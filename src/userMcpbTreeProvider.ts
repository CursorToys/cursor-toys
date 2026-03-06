import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getMcpbRoot } from './mcpbInstaller';
import type { McpbManifest } from './mcpbInstaller';

/**
 * Represents an installed MCPB package in the tree view.
 */
export interface McpbPackageItem {
  serverId: string;
  label: string;
  packagePath: string;
  uri: vscode.Uri;
}

/**
 * Tree data provider for installed MCPB packages (~/.mcpb).
 */
export class UserMcpbTreeProvider implements vscode.TreeDataProvider<McpbPackageItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<McpbPackageItem | undefined | null | void> =
    new vscode.EventEmitter<McpbPackageItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<McpbPackageItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: McpbPackageItem): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    treeItem.description = element.serverId;
    treeItem.tooltip = element.packagePath;
    treeItem.iconPath = new vscode.ThemeIcon('package');
    treeItem.contextValue = 'userMcpbPackage';
    treeItem.command = {
      command: 'cursor-toys.revealMcpb',
      title: 'Reveal in Folder',
      arguments: [element]
    };
    return treeItem;
  }

  async getChildren(): Promise<McpbPackageItem[]> {
    const mcpbRoot = getMcpbRoot();
    const rootUri = vscode.Uri.file(mcpbRoot);

    try {
      await vscode.workspace.fs.stat(rootUri);
    } catch {
      return [];
    }

    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(rootUri);
    } catch {
      return [];
    }

    const items: McpbPackageItem[] = [];
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) continue;
      const packagePath = path.join(mcpbRoot, name);
      const manifestPath = path.join(packagePath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;

      let label = name;
      try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(raw) as McpbManifest;
        if (manifest.display_name && typeof manifest.display_name === 'string') {
          label = manifest.display_name;
        } else if (manifest.name && typeof manifest.name === 'string') {
          label = manifest.name;
        }
      } catch {
        // Keep folder name as label
      }

      items.push({
        serverId: name,
        label,
        packagePath,
        uri: vscode.Uri.file(packagePath)
      });
    }

    items.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
    return items;
  }
}
