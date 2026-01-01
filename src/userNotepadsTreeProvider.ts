import * as vscode from 'vscode';
import * as path from 'path';
import { getNotepadsPath, isAllowedExtension } from './utils';

/**
 * Represents a tree item (can be a folder or a file)
 */
export type TreeItemType = 'folder' | 'file';

/**
 * Represents a notepad file or folder in the tree view
 */
export interface NotepadFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  type: TreeItemType;
  folderPath?: string; // Relative folder path for grouping
  children?: NotepadFileItem[]; // Children for folder items
}

/**
 * Tree data provider for user notepads folder with drag and drop support
 */
export class UserNotepadsTreeProvider implements vscode.TreeDataProvider<NotepadFileItem>, vscode.TreeDragAndDropController<NotepadFileItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<NotepadFileItem | undefined | null | void> = new vscode.EventEmitter<NotepadFileItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<NotepadFileItem | undefined | null | void> = this._onDidChangeTreeData.event;

  // Drag and drop support
  dropMimeTypes = ['application/vnd.code.tree.cursor-deeplink.userNotepads'];
  dragMimeTypes = ['text/uri-list'];

  /**
   * Refreshes the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for a given element
   */
  getTreeItem(element: NotepadFileItem): vscode.TreeItem {
    if (element.type === 'folder') {
      // Folder item
      const treeItem = new vscode.TreeItem(
        element.fileName,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = vscode.ThemeIcon.Folder;
      treeItem.contextValue = 'userNotepadFolder';
      return treeItem;
    } else {
      // File item
      const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
      treeItem.resourceUri = element.uri;
      treeItem.command = {
        command: 'cursor-toys.openNotepad',
        title: 'Open Notepad',
        arguments: [element.uri]
      };
      treeItem.contextValue = 'userNotepadFile';
      treeItem.iconPath = new vscode.ThemeIcon('note');
      return treeItem;
    }
  }

  /**
   * Recursively reads directory contents and finds all notepad files
   * @param basePath The base notepads folder path (e.g., ~/.cursor/notepads/)
   * @param currentPath The current directory being processed
   * @param allowedExtensions Array of allowed file extensions
   * @returns Array of NotepadFileItem with relative paths in fileName
   */
  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string,
    allowedExtensions: string[]
  ): Promise<NotepadFileItem[]> {
    const notepadFiles: NotepadFileItem[] = [];
    const currentUri = vscode.Uri.file(currentPath);

    try {
      // Read directory contents
      const entries = await vscode.workspace.fs.readDirectory(currentUri);

      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);

        if (type === vscode.FileType.File) {
          // Check if extension is allowed
          if (isAllowedExtension(itemPath, allowedExtensions)) {
            // Calculate relative path from basePath
            const relativePath = path.relative(basePath, itemPath);
            // Get the folder path (directory part of relative path)
            const folderPath = path.dirname(relativePath);
            // Normalize path separators for cross-platform compatibility
            const normalizedFolderPath = folderPath === '.' ? '' : folderPath.replace(/\\/g, '/');
            
            const fileUri = vscode.Uri.file(itemPath);
            notepadFiles.push({
              uri: fileUri,
              fileName: path.basename(itemPath), // Just the file name, not the full path
              filePath: itemPath,
              type: 'file',
              folderPath: normalizedFolderPath
            });
          }
        } else if (type === vscode.FileType.Directory) {
          // Recursively search in subdirectories
          const subFiles = await this.readDirectoryRecursive(basePath, itemPath, allowedExtensions);
          notepadFiles.push(...subFiles);
        }
      }
    } catch (error) {
      // Handle errors (permission denied, etc.) silently for subdirectories
      console.error(`Error reading directory ${currentPath}:`, error);
    }

    return notepadFiles;
  }

  /**
   * Groups files by folder path and creates a hierarchical structure
   * @param files Array of notepad files with folderPath information
   * @param sourceFolder Source folder name (cursor) for labeling
   * @returns Array of folder items with their children
   */
  private groupFilesByFolder(files: NotepadFileItem[], sourceFolder: string): NotepadFileItem[] {
    // Group files by folder path
    const folderMap = new Map<string, NotepadFileItem[]>();
    
    for (const file of files) {
      const folder = file.folderPath || ''; // Root folder if empty
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(file);
    }

    const result: NotepadFileItem[] = [];

    // Sort folder keys (root first, then alphabetically)
    const sortedFolders = Array.from(folderMap.keys()).sort((a, b) => {
      if (a === '' && b !== '') return -1; // Root first
      if (a !== '' && b === '') return 1;
      return a.localeCompare(b);
    });

    for (const folderPath of sortedFolders) {
      const filesInFolder = folderMap.get(folderPath)!;
      
      // Sort files alphabetically
      filesInFolder.sort((a, b) => a.fileName.localeCompare(b.fileName));

      if (folderPath === '') {
        // Root folder - add files directly
        result.push(...filesInFolder);
      } else {
        // Create folder item
        const folderName = path.basename(folderPath);
        const folderLabel = `${folderName}`;
        
        result.push({
          uri: vscode.Uri.file(''), // Dummy URI for folder
          fileName: folderLabel,
          filePath: folderPath,
          type: 'folder',
          folderPath: folderPath,
          children: filesInFolder
        });
      }
    }

    return result;
  }

  /**
   * Gets the children of the tree (folders and files)
   */
  async getChildren(element?: NotepadFileItem): Promise<NotepadFileItem[]> {
    // If element is a folder, return its children
    if (element && element.type === 'folder') {
      return element.children || [];
    }

    // If element is a file, no children
    if (element && element.type === 'file') {
      return [];
    }
    
    // Root level - get notepads from current workspace only
    try {
      // Check if workspace is open
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        // No workspace open, return empty
        return [];
      }

      // Get allowed extensions from configuration (only .md for notepads)
      const config = vscode.workspace.getConfiguration('cursorToys');
      const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

      const workspacePath = workspaceFolder.uri.fsPath;
      const notepadsPath = getNotepadsPath(workspacePath, false);
      const folderUri = vscode.Uri.file(notepadsPath);

      // Check if folder exists
      try {
        await vscode.workspace.fs.stat(folderUri);
      } catch {
        // Folder doesn't exist, return empty
        return [];
      }

      // Recursively read all notepad files from workspace
      const notepadFiles = await this.readDirectoryRecursive(
        notepadsPath,
        notepadsPath,
        allowedExtensions
      );

      // Group files by their subfolders
      const groupedItems = this.groupFilesByFolder(notepadFiles, 'notepads');

      // Sort items alphabetically
      groupedItems.sort((a, b) => a.fileName.localeCompare(b.fileName));

      return groupedItems;
    } catch (error) {
      // Handle errors (folder doesn't exist, permission denied, etc.)
      console.error('Error reading notepads folder:', error);
      return [];
    }
  }

  /**
   * Handle drag operation - called when user starts dragging an item
   */
  async handleDrag(source: readonly NotepadFileItem[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Only allow dragging files, not folders
    const files = source.filter(item => item.type === 'file' && item.uri.scheme === 'file');
    if (files.length === 0) {
      return;
    }

    // Store the dragged items in the data transfer
    dataTransfer.set(
      'application/vnd.code.tree.cursor-deeplink.userNotepads',
      new vscode.DataTransferItem(files)
    );
  }

  /**
   * Handle drop operation - called when user drops an item
   */
  async handleDrop(target: NotepadFileItem | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
    // Get the dragged items
    const transferItem = dataTransfer.get('application/vnd.code.tree.cursor-deeplink.userNotepads');
    if (!transferItem) {
      return;
    }

    const draggedItems: NotepadFileItem[] = transferItem.value;
    if (!draggedItems || draggedItems.length === 0) {
      return;
    }

    // Determine the target folder
    let targetFolderPath: string;
    let targetBasePath: string;

    if (!target) {
      // Dropped on root - shouldn't happen but handle it
      vscode.window.showErrorMessage('Cannot drop files on root. Please drop on a folder.');
      return;
    }

    if (target.type === 'folder') {
      // Dropped on a folder
      const draggedItem = draggedItems[0];
      const draggedBasePath = this.getBasePath(draggedItem.filePath);
      targetBasePath = draggedBasePath;
      
      // Extract the actual folder path
      const folderName = target.fileName.replace('📁 ', '');
      targetFolderPath = path.join(draggedBasePath, target.folderPath || folderName);
    } else {
      // Dropped on a file - move to the same folder as the target file
      const targetDir = path.dirname(target.filePath);
      targetFolderPath = targetDir;
      targetBasePath = this.getBasePath(target.filePath);
    }

    // Move each dragged file
    for (const item of draggedItems) {
      try {
        const sourceUri = item.uri;
        const fileName = path.basename(item.filePath);
        const targetUri = vscode.Uri.file(path.join(targetFolderPath, fileName));

        // Check if target already exists
        try {
          await vscode.workspace.fs.stat(targetUri);
          const overwrite = await vscode.window.showWarningMessage(
            `File "${fileName}" already exists in the target folder. Overwrite?`,
            'Yes', 'No'
          );
          if (overwrite !== 'Yes') {
            continue;
          }
        } catch {
          // File doesn't exist, proceed
        }

        // Move the file
        await vscode.workspace.fs.rename(sourceUri, targetUri, { overwrite: true });
        vscode.window.showInformationMessage(`Moved "${fileName}" successfully!`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to move "${item.fileName}": ${error}`);
      }
    }

    // Refresh the tree view
    this.refresh();
  }

  /**
   * Get the base notepads path from a file path
   * @param filePath Full file path
   * @returns Base notepads path (.cursor/notepads)
   */
  private getBasePath(filePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return '';
    }
    const workspacePath = workspaceFolder.uri.fsPath;
    const notepadsPath = getNotepadsPath(workspacePath, false);
    
    if (filePath.startsWith(notepadsPath)) {
      return notepadsPath;
    }
    return '';
  }
}

