import * as vscode from 'vscode';
import * as path from 'path';
import { getHttpPath } from './utils';
import {
  getHttpRequestBlocks,
  getHttpRequestBlockDescription,
  getHttpRequestBlockLabel,
} from './httpRequestParser';
import {
  createTreeLoadingPlaceholder,
  isTreeLoadingPlaceholder,
  renderLoadingTreeItem,
  TreeLoadCoordinator,
  TreeLoadingPlaceholder,
} from './treeLoading';

export type HttpTreeItemType = 'category' | 'folder' | 'file' | 'request';

export type HttpTreeElement = HttpTreeItem | TreeLoadingPlaceholder;

export interface HttpTreeItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  type: HttpTreeItemType;
  folderPath?: string;
  children?: HttpTreeItem[];
  startLine?: number;
  endLine?: number;
  sectionTitle?: string;
  requestLabel?: string;
  envName?: string;
}

const HTTP_FILE_EXTENSIONS = ['req', 'request', 'http', 'rest'];

function isHttpTreeFile(filePath: string): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return HTTP_FILE_EXTENSIONS.includes(ext);
}

/**
 * Tree data provider for workspace HTTP request files and runnable blocks.
 */
export class UserHttpTreeProvider implements vscode.TreeDataProvider<HttpTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<HttpTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly rootLoader = new TreeLoadCoordinator<HttpTreeItem | undefined, HttpTreeItem>(
    (parent) => this._onDidChangeTreeData.fire(parent),
    () => '__http_root__'
  );

  private readonly fileLoader = new TreeLoadCoordinator<HttpTreeItem, HttpTreeItem>(
    (parent) => this._onDidChangeTreeData.fire(parent),
    (parent) => `file:${parent?.filePath ?? ''}`
  );

  refresh(): void {
    this.rootLoader.clear();
    this.fileLoader.clear();
    this._onDidChangeTreeData.fire();
  }

  invalidateFile(filePath: string): void {
    this.fileLoader.invalidateKey(`file:${filePath}`);
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: HttpTreeElement): vscode.TreeItem {
    if (isTreeLoadingPlaceholder(element)) {
      return renderLoadingTreeItem(element);
    }
    if (element.type === 'category') {
      const item = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'httpCategory';
      return item;
    }

    if (element.type === 'folder') {
      const item = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = 'httpFolder';
      return item;
    }

    if (element.type === 'file') {
      const item = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.Collapsed);
      item.resourceUri = element.uri;
      item.command = {
        command: 'cursor-toys.openHttpRequest',
        title: 'Open HTTP Request File',
        arguments: [element.uri],
      };
      item.contextValue = 'httpFile';
      item.iconPath = new vscode.ThemeIcon('file');
      return item;
    }

    const label = element.requestLabel ?? 'Send Request';
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.iconPath = new vscode.ThemeIcon('play');
    item.contextValue = 'httpRequest';
    item.command = {
      command: 'cursor-toys.sendHttpRequest',
      title: 'Send HTTP Request',
      arguments: [
        element.uri,
        element.startLine,
        element.endLine,
        element.sectionTitle,
      ],
    };
    if (element.envName) {
      item.description = element.envName;
    }
    return item;
  }

  async getChildren(element?: HttpTreeElement): Promise<HttpTreeElement[]> {
    if (isTreeLoadingPlaceholder(element)) {
      return [];
    }

    if (element?.type === 'category' || element?.type === 'folder') {
      return element.children ?? [];
    }

    if (element?.type === 'file') {
      return this.fileLoader.resolveChildren(element, () => this.loadRequestChildren(element));
    }

    if (element?.type === 'request') {
      return [];
    }

    return this.rootLoader.resolveChildren(undefined, () => this.loadRootChildren());
  }

  private async loadRootChildren(): Promise<HttpTreeItem[]> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return [];
    }

    const httpPath = getHttpPath(workspaceFolder.uri.fsPath);
    const folderUri = vscode.Uri.file(httpPath);

    try {
      await vscode.workspace.fs.stat(folderUri);
    } catch {
      return [];
    }

    const files = await this.readDirectoryRecursive(httpPath, httpPath);
    if (files.length === 0) {
      return [];
    }

    const grouped = this.groupFilesByFolder(files);
    const workspaceName = workspaceFolder.name || 'Project';

    return [
      {
        uri: vscode.Uri.file(''),
        fileName: `${workspaceName} (workspace)`,
        filePath: httpPath,
        type: 'category',
        children: grouped,
      },
    ];
  }

  private async loadRequestChildren(fileItem: HttpTreeItem): Promise<HttpTreeItem[]> {
    try {
      const document = await vscode.workspace.openTextDocument(fileItem.uri);
      const blocks = getHttpRequestBlocks(document);
      return blocks.map((block) => {
        const label = getHttpRequestBlockLabel(block, document);
        const envName = getHttpRequestBlockDescription(block, document);
        return {
          uri: fileItem.uri,
          fileName: label,
          filePath: fileItem.filePath,
          type: 'request' as const,
          startLine: block.startLine,
          endLine: block.endLine,
          sectionTitle:
            block.kind === 'section' || block.kind === 'rest' ? block.title : undefined,
          requestLabel: label,
          envName,
        };
      });
    } catch (error) {
      console.error(`Failed to parse HTTP requests in ${fileItem.filePath}:`, error);
      return [];
    }
  }

  private async readDirectoryRecursive(
    basePath: string,
    currentPath: string
  ): Promise<HttpTreeItem[]> {
    const files: HttpTreeItem[] = [];
    const currentUri = vscode.Uri.file(currentPath);

    try {
      const entries = await vscode.workspace.fs.readDirectory(currentUri);

      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);

        if (type === vscode.FileType.File) {
          if (!isHttpTreeFile(itemPath)) {
            continue;
          }
          const relativePath = path.relative(basePath, itemPath);
          const folderPath = path.dirname(relativePath);
          const normalizedFolderPath =
            folderPath === '.' ? '' : folderPath.replace(/\\/g, '/');

          files.push({
            uri: vscode.Uri.file(itemPath),
            fileName: path.basename(itemPath),
            filePath: itemPath,
            type: 'file',
            folderPath: normalizedFolderPath,
          });
        } else if (type === vscode.FileType.Directory) {
          const subFiles = await this.readDirectoryRecursive(basePath, itemPath);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`Error reading HTTP directory ${currentPath}:`, error);
    }

    return files;
  }

  private groupFilesByFolder(files: HttpTreeItem[]): HttpTreeItem[] {
    const folderMap = new Map<string, HttpTreeItem[]>();

    for (const file of files) {
      const folder = file.folderPath || '';
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(file);
    }

    const result: HttpTreeItem[] = [];
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
        result.push({
          uri: vscode.Uri.file(''),
          fileName: path.basename(folderPath),
          filePath: folderPath,
          type: 'folder',
          folderPath,
          children: filesInFolder,
        });
      }
    }

    return result;
  }
}
