import * as vscode from 'vscode';
import * as path from 'path';
import { getAgentsPath, getPersonalAgentsPath, isAllowedExtension } from './utils';
import {
  isTreeLoadingPlaceholder,
  renderLoadingTreeItem,
  TreeLoadCoordinator,
  TreeLoadingPlaceholder,
} from './treeLoading';

export type AgentTreeItemType = 'category' | 'folder' | 'file';

export type AgentTreeElement = AgentFileItem | TreeLoadingPlaceholder;

export interface AgentFileItem {
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  type: AgentTreeItemType;
  folderPath?: string;
  isPersonal?: boolean;
  children?: AgentFileItem[];
}

let treeProviderInstance: UserAgentsTreeProvider | undefined;

/**
 * Registers the active tree provider for refresh hooks (global watcher, MCP mutations).
 */
export function registerUserAgentsTreeProvider(provider: UserAgentsTreeProvider): void {
  treeProviderInstance = provider;
}

/**
 * Refreshes the Agents explorer tree when registered.
 */
export function refreshUserAgentsTree(): void {
  treeProviderInstance?.refresh();
}

/**
 * Tree data provider for personal and workspace Cursor subagents (~/.cursor/agents/).
 */
export class UserAgentsTreeProvider implements vscode.TreeDataProvider<AgentTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    AgentTreeElement | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly rootLoader = new TreeLoadCoordinator<AgentFileItem | undefined, AgentFileItem>(
    () => this._onDidChangeTreeData.fire(),
    () => '__agents_root__'
  );

  refresh(): void {
    this.rootLoader.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: AgentTreeElement): vscode.TreeItem {
    if (isTreeLoadingPlaceholder(element)) {
      return renderLoadingTreeItem(element);
    }
    if (element.type === 'category') {
      const item = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('folder');
      item.contextValue = 'agentCategory';
      return item;
    }
    if (element.type === 'folder') {
      const item = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = vscode.ThemeIcon.Folder;
      item.contextValue = 'userAgentFolder';
      return item;
    }
    const item = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = element.uri;
    item.command = {
      command: 'cursor-toys.openUserAgent',
      title: 'Open Agent',
      arguments: [element.uri],
    };
    item.contextValue = 'userAgentFile';
    item.iconPath = new vscode.ThemeIcon('hubot');
    return item;
  }

  async getChildren(element?: AgentTreeElement): Promise<AgentTreeElement[]> {
    if (isTreeLoadingPlaceholder(element)) {
      return [];
    }
    if (element && (element.type === 'category' || element.type === 'folder')) {
      return element.children || [];
    }
    if (element && element.type === 'file') {
      return [];
    }
    return this.rootLoader.resolveChildren(undefined, () => this.loadRootChildren());
  }

  private async readDirectoryRecursive(basePath: string, currentPath: string, allowedExtensions: string[]): Promise<AgentFileItem[]> {
    const files: AgentFileItem[] = [];
    try {
      const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
      for (const [name, type] of entries) {
        const itemPath = path.join(currentPath, name);
        if (type === vscode.FileType.File) {
          if (isAllowedExtension(itemPath, allowedExtensions) || name.endsWith('.md')) {
            const relativePath = path.relative(basePath, itemPath);
            const folderPath = path.dirname(relativePath);
            const normalizedFolderPath = folderPath === '.' ? '' : folderPath.replace(/\\/g, '/');
            files.push({
              uri: vscode.Uri.file(itemPath),
              fileName: path.basename(itemPath),
              filePath: itemPath,
              type: 'file',
              folderPath: normalizedFolderPath,
            });
          }
        } else if (type === vscode.FileType.Directory) {
          files.push(...(await this.readDirectoryRecursive(basePath, itemPath, allowedExtensions)));
        }
      }
    } catch (error) {
      console.error(`Error reading agents directory ${currentPath}:`, error);
    }
    return files;
  }

  private groupFilesByFolder(files: AgentFileItem[]): AgentFileItem[] {
    const folderMap = new Map<string, AgentFileItem[]>();
    for (const file of files) {
      const folder = file.folderPath || '';
      if (!folderMap.has(folder)) {
        folderMap.set(folder, []);
      }
      folderMap.get(folder)!.push(file);
    }
    const result: AgentFileItem[] = [];
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

  private async loadRootChildren(): Promise<AgentFileItem[]> {
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    const items: AgentFileItem[] = [];

    const personalPath = getPersonalAgentsPath();
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(personalPath));
      const personalFiles = await this.readDirectoryRecursive(personalPath, personalPath, allowedExtensions);
      personalFiles.forEach((f) => {
        f.isPersonal = true;
      });
      if (personalFiles.length > 0) {
        items.push({
          uri: vscode.Uri.file(''),
          fileName: 'Personal (~/.cursor/agents)',
          filePath: personalPath,
          type: 'category',
          isPersonal: true,
          children: this.groupFilesByFolder(personalFiles),
        });
      }
    } catch {
      // personal agents folder missing
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspaceAgentsPath = getAgentsPath(workspaceFolder.uri.fsPath, false);
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(workspaceAgentsPath));
        const workspaceFiles = await this.readDirectoryRecursive(
          workspaceAgentsPath,
          workspaceAgentsPath,
          allowedExtensions
        );
        workspaceFiles.forEach((f) => {
          f.isPersonal = false;
        });
        if (workspaceFiles.length > 0) {
          items.push({
            uri: vscode.Uri.file(''),
            fileName: `${workspaceFolder.name} (workspace)`,
            filePath: workspaceAgentsPath,
            type: 'category',
            isPersonal: false,
            children: this.groupFilesByFolder(workspaceFiles),
          });
        }
      } catch {
        // no workspace agents
      }
    }

    return items;
  }
}
