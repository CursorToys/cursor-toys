import * as vscode from 'vscode';
import * as path from 'path';
import { getPersonalHooksPath, getProjectHooksPath, hooksFileExists, parseHooksFile, HooksConfig } from './hooksManager';
import {
  isTreeLoadingPlaceholder,
  renderLoadingTreeItem,
  TreeLoadCoordinator,
  TreeLoadingPlaceholder,
} from './treeLoading';

/**
 * Represents a tree item type
 */
export type HooksTreeItemType = 'category' | 'hook' | 'script';

/**
 * Represents a hooks file or category in the tree view
 */
export type HooksTreeElement = HooksFileItem | TreeLoadingPlaceholder;

export interface HooksFileItem {
  uri: vscode.Uri;
  label: string;
  filePath: string;
  type: HooksTreeItemType;
  isPersonal?: boolean;
  hookName?: string; // For hook type items
  scriptCommand?: string; // For script type items
  children?: HooksFileItem[];
}

/**
 * Tree data provider for Cursor hooks with personal and project hooks
 */
export class UserHooksTreeProvider implements vscode.TreeDataProvider<HooksTreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<HooksTreeElement | undefined | null | void> = 
    new vscode.EventEmitter<HooksTreeElement | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<HooksTreeElement | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private readonly rootLoader = new TreeLoadCoordinator<HooksFileItem | undefined, HooksFileItem>(
    (parent) => this._onDidChangeTreeData.fire(parent),
    () => '__hooks_root__'
  );

  /**
   * Refreshes the tree view
   */
  refresh(): void {
    this.rootLoader.clear();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Gets the tree item for a given element
   */
  getTreeItem(element: HooksTreeElement): vscode.TreeItem {
    if (isTreeLoadingPlaceholder(element)) {
      return renderLoadingTreeItem(element);
    }
    if (element.type === 'category') {
      // Category item (Personal or Project)
      const treeItem = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = new vscode.ThemeIcon('folder');
      treeItem.contextValue = 'hooksCategory';
      return treeItem;
    } else if (element.type === 'hook') {
      // Hook type item (e.g., "afterFileEdit")
      const treeItem = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      treeItem.iconPath = new vscode.ThemeIcon('symbol-event');
      treeItem.contextValue = 'hooksHook';
      treeItem.tooltip = `Hook: ${element.hookName}`;
      return treeItem;
    } else {
      // Script item (e.g., "format.sh")
      const treeItem = new vscode.TreeItem(
        element.label,
        vscode.TreeItemCollapsibleState.None
      );
      treeItem.resourceUri = element.uri;
      treeItem.command = {
        command: 'cursor-toys.openHooks',
        title: 'Open Hook Script',
        arguments: [element.uri]
      };
      treeItem.contextValue = 'hooksScript';
      treeItem.iconPath = new vscode.ThemeIcon('file-code');
      treeItem.description = element.scriptCommand;
      treeItem.tooltip = `Script: ${element.scriptCommand}\nPath: ${element.filePath}`;
      return treeItem;
    }
  }

  /**
   * Gets the children of the tree (categories and files)
   */
  async getChildren(element?: HooksTreeElement): Promise<HooksTreeElement[]> {
    if (isTreeLoadingPlaceholder(element)) {
      return [];
    }

    // If element is a category, return its children (hooks)
    if (element && element.type === 'category') {
      return element.children || [];
    }

    // If element is a hook, return its scripts
    if (element && element.type === 'hook') {
      return element.children || [];
    }

    // If element is a script, no children
    if (element && element.type === 'script') {
      return [];
    }

    return this.rootLoader.resolveChildren(undefined, () => this.loadRootChildren());
  }

  private async loadRootChildren(): Promise<HooksFileItem[]> {
    const items: HooksFileItem[] = [];

    // Personal hooks
    const personalPath = getPersonalHooksPath();
    const personalExists = await hooksFileExists(personalPath);
    
    if (personalExists) {
      const personalHooks = await this.parseHooksAndCreateItems(personalPath, true);
      if (personalHooks.length > 0) {
        items.push({
          uri: vscode.Uri.file(''), // Dummy URI for category
          label: 'Personal (~/.cursor)',
          filePath: path.dirname(personalPath),
          type: 'category',
          children: personalHooks
        });
      }
    }

    // Project hooks
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const projectPath = getProjectHooksPath(workspaceFolder.uri.fsPath);
      const projectExists = await hooksFileExists(projectPath);

      if (projectExists) {
        const projectHooks = await this.parseHooksAndCreateItems(projectPath, false);
        if (projectHooks.length > 0) {
          const workspaceName = workspaceFolder.name || 'Project';
          items.push({
            uri: vscode.Uri.file(''), // Dummy URI for category
            label: `${workspaceName} (workspace)`,
            filePath: path.dirname(projectPath),
            type: 'category',
            children: projectHooks
          });
        }
      }
    }

    // If no hooks files exist, show helpful message
    if (items.length === 0) {
      return [];
    }

    return items;
  }

  /**
   * Parses hooks.json and creates tree items for each hook and script
   */
  private async parseHooksAndCreateItems(hooksPath: string, isPersonal: boolean): Promise<HooksFileItem[]> {
    const config = await parseHooksFile(hooksPath);
    if (!config) {
      return [];
    }

    const items: HooksFileItem[] = [];
    const hooksDir = path.dirname(hooksPath);

    // Iterate through each hook type
    for (const [hookName, commands] of Object.entries(config.hooks)) {
      // Skip empty hooks
      if (commands.length === 0) {
        continue;
      }

      const scriptItems: HooksFileItem[] = [];

      // Create an item for each script in this hook
      for (const commandObj of commands) {
        const command = commandObj.command;
        
        // Extract script name from command
        // e.g., "./hooks/format.sh" -> "format.sh"
        const scriptName = path.basename(command);
        
        // Resolve the full path to the script
        // Commands can be relative to hooks directory
        let scriptPath = command;
        if (command.startsWith('./')) {
          scriptPath = path.join(hooksDir, command.substring(2));
        } else if (!path.isAbsolute(command)) {
          scriptPath = path.join(hooksDir, command);
        }

        const scriptUri = vscode.Uri.file(scriptPath);

        scriptItems.push({
          uri: scriptUri,
          label: scriptName,
          filePath: scriptPath,
          type: 'script',
          isPersonal,
          scriptCommand: command
        });
      }

      // Create the hook item with its scripts as children
      if (scriptItems.length > 0) {
        items.push({
          uri: vscode.Uri.file(''), // Dummy URI for hook
          label: hookName,
          filePath: hooksDir,
          type: 'hook',
          isPersonal,
          hookName,
          children: scriptItems
        });
      }
    }

    return items;
  }
}

