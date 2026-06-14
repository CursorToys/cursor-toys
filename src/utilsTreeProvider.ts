import * as vscode from 'vscode';

export type UtilsItemKind = 'category' | 'action';

export interface UtilsTreeItemModel {
  id: string;
  label: string;
  kind: UtilsItemKind;
  description?: string;
  iconId?: string;
  commandId?: string;
  children?: UtilsTreeItemModel[];
}

export const UTILS_ITEMS: UtilsTreeItemModel[] = [
  {
    id: 'text',
    label: 'Text',
    kind: 'category',
    iconId: 'edit',
    children: [
      {
        id: 'trim-clipboard',
        label: 'Trim & Minify Clipboard',
        kind: 'action',
        iconId: 'clippy',
        commandId: 'cursor-toys.trimClipboard',
        description: 'Auto-detect + shrink',
      },
      {
        id: 'trim-clipboard-select',
        label: 'Trim & Minify Clipboard (Select Type)',
        kind: 'action',
        iconId: 'clippy',
        commandId: 'cursor-toys.trimClipboardWithPrompt',
        description: 'Choose type before trimming',
      },
      {
        id: 'refine-clipboard',
        label: 'Refine Clipboard with AI',
        kind: 'action',
        iconId: 'sparkle',
        commandId: 'cursor-toys.refineClipboardWithAI',
        description: 'Rewrite/clean up',
      },
      {
        id: 'process-with-prompt',
        label: 'Process Selection with Prompt',
        kind: 'action',
        iconId: 'wand',
        commandId: 'cursor-toys.processWithPrompt',
        description: 'Custom transformation',
      },
    ],
  },
  {
    id: 'files',
    label: 'Files',
    kind: 'category',
    iconId: 'files',
    children: [
      {
        id: 'minify-file',
        label: 'Minify File',
        kind: 'action',
        iconId: 'file-zip',
        commandId: 'cursor-toys.minifyFile',
        description: 'Write a .min output',
      },
    ],
  },
  {
    id: 'http',
    label: 'HTTP',
    kind: 'category',
    iconId: 'globe',
    children: [
      {
        id: 'run-http-tests-all',
        label: 'Run HTTP Tests (All)',
        kind: 'action',
        iconId: 'beaker',
        commandId: 'cursor-toys.runHttpTestsAll',
        description: 'CLI assertions runner',
      },
      {
        id: 'select-http-env',
        label: 'Select HTTP Environment',
        kind: 'action',
        iconId: 'layers',
        commandId: 'cursor-toys.selectEnvironment',
        description: 'Switch .env set',
      },
    ],
  },
];

/**
 * Tree data provider for the CursorToys Utils view (quick actions).
 */
export class CursorToysUtilsTreeProvider implements vscode.TreeDataProvider<UtilsTreeItemModel> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<UtilsTreeItemModel | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: UtilsTreeItemModel): vscode.TreeItem {
    const collapsible =
      element.kind === 'category'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    const item = new vscode.TreeItem(element.label, collapsible);
    item.id = element.id;
    item.description = element.description;

    if (element.iconId) {
      item.iconPath = new vscode.ThemeIcon(element.iconId);
    }

    if (element.kind === 'category') {
      item.contextValue = 'cursorToysUtilsCategory';
      return item;
    }

    if (element.kind === 'action' && element.commandId) {
      item.contextValue = 'cursorToysUtilsAction';
      item.command = {
        command: element.commandId,
        title: element.label,
      };
    }

    return item;
  }

  getChildren(element?: UtilsTreeItemModel): UtilsTreeItemModel[] {
    if (!element) {
      return UTILS_ITEMS;
    }
    return element.children ?? [];
  }
}

