import * as vscode from 'vscode';
import * as path from 'path';
import {
  getExtensionDataFolderName,
  getKanbanPath,
  isAllowedExtension,
} from './utils';
import {
  KANBAN_COLUMN_LABELS,
  KANBAN_STATUSES,
  KanbanStatus,
  getKanbanStatusPath,
  migrateLegacyKanbanCards,
} from './kanbanCard';
import {
  isTreeLoadingPlaceholder,
  renderLoadingTreeItem,
  TreeLoadCoordinator,
  TreeLoadingPlaceholder,
} from './treeLoading';

export interface KanbanFileItem {
  kind: 'file';
  uri: vscode.Uri;
  fileName: string;
  filePath: string;
  isPersonal: boolean;
}

export interface KanbanStatusFolderItem {
  kind: 'statusFolder';
  status: KanbanStatus;
  label: string;
  folderPath: string;
  kanbanPath: string;
  isPersonal: boolean;
}

export interface KanbanScopeCategoryItem {
  kind: 'scopeCategory';
  label: string;
  kanbanPath: string;
  isPersonal: boolean;
}

export type KanbanTreeElement =
  | KanbanScopeCategoryItem
  | KanbanStatusFolderItem
  | KanbanFileItem
  | TreeLoadingPlaceholder;

function isKanbanScopeCategoryItem(
  element: KanbanTreeElement | undefined
): element is KanbanScopeCategoryItem {
  return !!element && 'kind' in element && element.kind === 'scopeCategory';
}

function isKanbanStatusFolderItem(
  element: KanbanTreeElement | undefined
): element is KanbanStatusFolderItem {
  return !!element && 'kind' in element && element.kind === 'statusFolder';
}

function isKanbanFileItem(element: KanbanTreeElement | undefined): element is KanbanFileItem {
  return !!element && 'kind' in element && element.kind === 'file';
}

/**
 * Tree data provider for personal and workspace Kanban card files grouped by status folder.
 */
export class UserKanbanTreeProvider implements vscode.TreeDataProvider<KanbanTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<KanbanTreeElement | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly rootLoader = new TreeLoadCoordinator<KanbanTreeElement | undefined, KanbanTreeElement>(
    () => this._onDidChangeTreeData.fire(),
    () => '__kanban_root__'
  );

  private readonly folderLoaders = new Map<string, TreeLoadCoordinator<KanbanTreeElement, KanbanFileItem>>();

  refresh(): void {
    this.rootLoader.clear();
    this.folderLoaders.clear();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: KanbanTreeElement): vscode.TreeItem {
    if (isTreeLoadingPlaceholder(element)) {
      return renderLoadingTreeItem(element);
    }
    if (isKanbanScopeCategoryItem(element)) {
      const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      treeItem.contextValue = 'userKanbanScopeCategory';
      treeItem.iconPath = new vscode.ThemeIcon(element.isPersonal ? 'home' : 'root-folder');
      return treeItem;
    }
    if (isKanbanStatusFolderItem(element)) {
      const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      treeItem.contextValue = 'userKanbanStatusFolder';
      treeItem.iconPath = new vscode.ThemeIcon('folder');
      return treeItem;
    }
    const treeItem = new vscode.TreeItem(element.fileName, vscode.TreeItemCollapsibleState.None);
    treeItem.resourceUri = element.uri;
    treeItem.command = {
      command: 'cursor-toys.openKanbanCard',
      title: 'Open Kanban Card',
      arguments: [element],
    };
    treeItem.contextValue = 'userKanbanFile';
    treeItem.iconPath = new vscode.ThemeIcon('tasklist');
    return treeItem;
  }

  getChildren(element?: KanbanTreeElement): vscode.ProviderResult<KanbanTreeElement[]> {
    if (!element) {
      return this.rootLoader.resolveChildren(undefined, () => this.loadRootChildren());
    }
    if (isTreeLoadingPlaceholder(element)) {
      return [];
    }
    if (isKanbanScopeCategoryItem(element)) {
      return KANBAN_STATUSES.map((status) => ({
        kind: 'statusFolder' as const,
        status,
        label: KANBAN_COLUMN_LABELS[status],
        folderPath: getKanbanStatusPath(element.kanbanPath, status),
        kanbanPath: element.kanbanPath,
        isPersonal: element.isPersonal,
      }));
    }
    if (isKanbanFileItem(element)) {
      return [];
    }
    if (isKanbanStatusFolderItem(element)) {
      return this.getFolderLoader(element).resolveChildren(element, () =>
        this.loadStatusFolderChildren(element)
      );
    }
    return [];
  }

  private getFolderLoader(
    folder: KanbanStatusFolderItem
  ): TreeLoadCoordinator<KanbanTreeElement, KanbanFileItem> {
    const key = `${folder.isPersonal ? 'p' : 'w'}:${folder.status}:${folder.kanbanPath}`;
    let loader = this.folderLoaders.get(key);
    if (!loader) {
      loader = new TreeLoadCoordinator<KanbanTreeElement, KanbanFileItem>(
        () => this._onDidChangeTreeData.fire(),
        () => `__kanban_folder__:${key}`
      );
      this.folderLoaders.set(key, loader);
    }
    return loader;
  }

  private async folderExists(folderPath: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(folderPath));
      return true;
    } catch {
      return false;
    }
  }

  private async loadRootChildren(): Promise<KanbanTreeElement[]> {
    const items: KanbanScopeCategoryItem[] = [];
    const extFolder = getExtensionDataFolderName();

    const personalPath = getKanbanPath(undefined, true);
    if (await this.folderExists(personalPath)) {
      items.push({
        kind: 'scopeCategory',
        label: `Personal (~/.${extFolder})`,
        kanbanPath: personalPath,
        isPersonal: true,
      });
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspacePath = workspaceFolder.uri.fsPath;
      const workspaceKanbanPath = getKanbanPath(workspacePath, false);
      if (await this.folderExists(workspaceKanbanPath)) {
        const workspaceName = workspaceFolder.name || 'Project';
        items.push({
          kind: 'scopeCategory',
          label: `${workspaceName} (workspace)`,
          kanbanPath: workspaceKanbanPath,
          isPersonal: false,
        });
      }
    }

    return items;
  }

  private async loadStatusFolderChildren(folder: KanbanStatusFolderItem): Promise<KanbanFileItem[]> {
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
    await migrateLegacyKanbanCards(folder.kanbanPath, allowedExtensions);

    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(folder.folderPath));
    } catch {
      return [];
    }

    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(folder.folderPath));
    const items: Array<KanbanFileItem & { mtime: number }> = [];

    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      const filePath = path.join(folder.folderPath, name);
      if (!isAllowedExtension(filePath, allowedExtensions)) {
        continue;
      }
      let mtime = 0;
      try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
        mtime = stat.mtime;
      } catch {
        mtime = 0;
      }
      items.push({
        kind: 'file',
        uri: vscode.Uri.file(filePath),
        fileName: name,
        filePath,
        isPersonal: folder.isPersonal,
        mtime,
      });
    }

    if (folder.status === 'done') {
      items.sort((a, b) => b.mtime - a.mtime || a.fileName.localeCompare(b.fileName));
    } else {
      items.sort((a, b) => a.fileName.localeCompare(b.fileName));
    }

    return items.map(({ mtime: _mtime, ...item }) => item);
  }
}
