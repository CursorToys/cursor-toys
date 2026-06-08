import * as vscode from 'vscode';
import * as path from 'path';
import {
  getExtensionDataFolderName,
  getNotepadsPath,
  isAllowedExtension,
} from './utils';
import {
  isTreeLoadingPlaceholder,
  renderLoadingTreeItem,
  TreeLoadCoordinator,
  TreeLoadingPlaceholder,
} from './treeLoading';

export type TreeItemType = 'category' | 'folder' | 'file';

export type NotepadTreeElement = NotepadFileItem | TreeLoadingPlaceholder;

export interface NotepadFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  type: TreeItemType;
  folderPath?: string;
  isPersonal?: boolean;
  basePath?: string;
  children?: NotepadFileItem[];
}

/**
 * Tree data provider for personal and workspace notepads with drag and drop support.
 */
export class UserNotepadsTreeProvider
  implements vscode.TreeDataProvider<NotepadTreeElement>, vscode.TreeDragAndDropController<NotepadFileItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<NotepadTreeElement | undefined | null | void> =
    new vscode.EventEmitter<NotepadTreeElement | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<NotepadTreeElement | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private readonly rootLoader = new TreeLoadCoordinator<NotepadFileItem | undefined, NotepadFileItem>(
    () => this._onDidChangeTreeData.fire(),
    () => '__notepads_root__'
  );

  dropMimeTypes = ['application/vnd.code.tree.cursor-deeplink.userNotepads'];
  dragMimeTypes = ['text/uri-list'];

  refresh(): void {
    this.rootLoader.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: NotepadTreeElement): vscode.TreeItem {
    if (isTreeLoadingPlaceholder(element)) {
      return renderLoadingTreeItem(element);
    }
    if (element.type === 'category') {
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = new vscode.ThemeIcon(element.isPersonal ? 'home' : 'root-folder');
      treeItem.contextValue = 'notepadCategory';
      return treeItem;
    }
    if (element.type === 'folder') {
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = vscode.ThemeIcon.Folder;
      treeItem.contextValue = 'userNotepadFolder';
      return treeItem;
    }
    const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
    treeItem.resourceUri = element.uri;
    treeItem.command = {
      command: 'cursor-toys.openNotepad',
      title: 'Open Notepad',
      arguments: [element.uri],
    };
    treeItem.contextValue = 'userNotepadFile';
    treeItem.iconPath = new vscode.ThemeIcon('note');
    return treeItem;
  }

  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string,
    allowedExtensions: string[],
    isPersonal: boolean
  ): Promise<NotepadFileItem[]> {
    const notepadFiles: NotepadFileItem[] = [];
    const currentUri = vscode.Uri.file(currentPath);

    try {
      const entries = await vscode.workspace.fs.readDirectory(currentUri);

      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);

        if (type === vscode.FileType.File) {
          if (isAllowedExtension(itemPath, allowedExtensions)) {
            const relativePath = path.relative(basePath, itemPath);
            const folderPath = path.dirname(relativePath);
            const normalizedFolderPath = folderPath === '.' ? '' : folderPath.replace(/\\/g, '/');

            notepadFiles.push({
              uri: vscode.Uri.file(itemPath),
              fileName: path.basename(itemPath),
              filePath: itemPath,
              type: 'file',
              folderPath: normalizedFolderPath,
              isPersonal,
              basePath,
            });
          }
        } else if (type === vscode.FileType.Directory) {
          const subFiles = await this.readDirectoryRecursive(
            basePath,
            itemPath,
            allowedExtensions,
            isPersonal
          );
          notepadFiles.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${currentPath}:`, error);
    }

    return notepadFiles;
  }

  private groupFilesByFolder(files: NotepadFileItem[]): NotepadFileItem[] {
    const folderMap = new Map<string, NotepadFileItem[]>();

    for (const file of files) {
      const folder = file.folderPath || '';
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(file);
    }

    const result: NotepadFileItem[] = [];
    const sortedFolders = Array.from(folderMap.keys()).sort((a, b) => {
      if (a === '' && b !== '') {
        return -1;
      }
      if (a !== '' && b === '') {
        return 1;
      }
      return a.localeCompare(b);
    });

    for (const folderPath of sortedFolders) {
      const filesInFolder = folderMap.get(folderPath)!;
      filesInFolder.sort((a, b) => a.fileName.localeCompare(b.fileName));

      if (folderPath === '') {
        result.push(...filesInFolder);
      } else {
        const folderName = path.basename(folderPath);
        result.push({
          uri: vscode.Uri.file(''),
          fileName: folderName,
          filePath: folderPath,
          type: 'folder',
          folderPath,
          isPersonal: filesInFolder[0]?.isPersonal,
          basePath: filesInFolder[0]?.basePath,
          children: filesInFolder,
        });
      }
    }

    return result;
  }

  async getChildren(element?: NotepadTreeElement): Promise<NotepadTreeElement[]> {
    if (isTreeLoadingPlaceholder(element)) {
      return [];
    }
    if (element && element.type === 'category') {
      return element.children || [];
    }
    if (element && element.type === 'folder') {
      return element.children || [];
    }
    if (element && element.type === 'file') {
      return [];
    }

    return this.rootLoader.resolveChildren(undefined, () => this.loadRootChildren());
  }

  private async folderExists(folderPath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(folderPath));
      return true;
    } catch {
      return false;
    }
  }

  private async loadRootChildren(): Promise<NotepadFileItem[]> {
    try {
      const config = vscode.workspace.getConfiguration('cursorToys');
      const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
      const extFolder = getExtensionDataFolderName();
      const items: NotepadFileItem[] = [];

      const personalPath = getNotepadsPath(undefined, true);
      if (await this.folderExists(personalPath)) {
        const personalFiles = await this.readDirectoryRecursive(
          personalPath,
          personalPath,
          allowedExtensions,
          true
        );
        items.push({
          uri: vscode.Uri.file(''),
          fileName: `Personal (~/.${extFolder})`,
          filePath: personalPath,
          type: 'category',
          isPersonal: true,
          basePath: personalPath,
          children: this.groupFilesByFolder(personalFiles),
        });
      }

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (workspaceFolder) {
        const workspacePath = workspaceFolder.uri.fsPath;
        const notepadsPath = getNotepadsPath(workspacePath, false);
        if (await this.folderExists(notepadsPath)) {
          const workspaceFiles = await this.readDirectoryRecursive(
            notepadsPath,
            notepadsPath,
            allowedExtensions,
            false
          );
          const workspaceName = workspaceFolder.name || 'Project';
          items.push({
            uri: vscode.Uri.file(''),
            fileName: `${workspaceName} (workspace)`,
            filePath: notepadsPath,
            type: 'category',
            isPersonal: false,
            basePath: notepadsPath,
            children: this.groupFilesByFolder(workspaceFiles),
          });
        }
      }

      return items;
    } catch (error) {
      console.error('Error reading notepads folder:', error);
      return [];
    }
  }

  async handleDrag(
    source: readonly NotepadFileItem[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const files = source.filter((item) => item.type === 'file' && item.uri.scheme === 'file');
    if (files.length === 0) {
      return;
    }
    dataTransfer.set(
      'application/vnd.code.tree.cursor-deeplink.userNotepads',
      new vscode.DataTransferItem(files)
    );
  }

  async handleDrop(
    target: NotepadFileItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = dataTransfer.get('application/vnd.code.tree.cursor-deeplink.userNotepads');
    if (!transferItem) {
      return;
    }

    const draggedItems: NotepadFileItem[] = transferItem.value;
    if (!draggedItems || draggedItems.length === 0) {
      return;
    }

    let targetFolderPath: string;

    if (!target) {
      vscode.window.showErrorMessage('Cannot drop files on root. Please drop on a folder.');
      return;
    }

    if (target.type === 'category') {
      vscode.window.showErrorMessage('Drop on a folder inside the category, not on the category itself.');
      return;
    }

    if (target.type === 'folder') {
      const draggedItem = draggedItems[0];
      const basePath = draggedItem.basePath ?? this.getBasePathFromFile(draggedItem.filePath);
      if (!basePath) {
        return;
      }
      targetFolderPath = path.join(basePath, target.folderPath || target.fileName);
    } else {
      targetFolderPath = path.dirname(target.filePath);
    }

    for (const item of draggedItems) {
      try {
        const sourceUri = item.uri;
        const fileName = path.basename(item.filePath);
        const targetUri = vscode.Uri.file(path.join(targetFolderPath, fileName));

        try {
          await vscode.workspace.fs.stat(targetUri);
          const overwrite = await vscode.window.showWarningMessage(
            `File "${fileName}" already exists in the target folder. Overwrite?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            continue;
          }
        } catch {
          // File does not exist
        }

        await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: true });
        vscode.window.showInformationMessage(`Moved "${fileName}" successfully!`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to move "${item.fileName}": ${error}`);
      }
    }

    this.refresh();
  }

  private getBasePathFromFile(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    const extFolder = getExtensionDataFolderName();
    const markers = [
      `/.${extFolder}/notepads/`,
      '/.cursor/notepads/',
      '/.vscode/notepads/',
      '/.ai/notepads/',
    ];
    for (const marker of markers) {
      const idx = normalized.indexOf(marker);
      if (idx >= 0) {
        return filePath.slice(0, idx + marker.length - 1);
      }
    }
    return '';
  }
}
