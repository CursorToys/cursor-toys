import * as vscode from 'vscode';
import { ClipboardHistoryManager, getClipboardHistoryManager } from './clipboardHistoryManager';
import { truncateClipboardPreview } from './clipboardQuickPick';
import { ClipboardCommandStore } from './clipboardCommandStore';
import { ClipboardCommandEntry } from './clipboardCommandTypes';
import { formatSlotDisplayLabel } from './clipboardSnippetSlots';

export type ClipboardTreeElement =
  | ClipboardCategoryItem
  | ClipboardActionItem
  | ClipboardHistoryEntryItem
  | ClipboardSlotItem
  | ClipboardCommandItem;

export interface ClipboardCategoryItem {
  kind: 'category';
  id: string;
  label: string;
  scope?: 'history' | 'slots' | 'global' | 'workspace';
}

export interface ClipboardActionItem {
  kind: 'action';
  id: string;
  label: string;
  commandId: string;
  description?: string;
}

export interface ClipboardHistoryEntryItem {
  kind: 'historyEntry';
  index: number;
  text: string;
  source: 'copy' | 'cut';
  timestamp: number;
}

export interface ClipboardSlotItem {
  kind: 'slot';
  slotId: string;
  displayLabel: string;
  preview: string;
}

export interface ClipboardCommandItem {
  kind: 'command';
  entry: ClipboardCommandEntry;
}

function isCategory(e: ClipboardTreeElement): e is ClipboardCategoryItem {
  return e.kind === 'category';
}

function isAction(e: ClipboardTreeElement): e is ClipboardActionItem {
  return e.kind === 'action';
}

function isHistoryEntry(e: ClipboardTreeElement): e is ClipboardHistoryEntryItem {
  return e.kind === 'historyEntry';
}

function isSlot(e: ClipboardTreeElement): e is ClipboardSlotItem {
  return e.kind === 'slot';
}

function isCommand(e: ClipboardTreeElement): e is ClipboardCommandItem {
  return e.kind === 'command';
}

const TREE_PREVIEW_CHARS = 72;

/**
 * Sidebar tree for clipboard history actions and saved command clipboard.
 */
export class UserClipboardTreeProvider implements vscode.TreeDataProvider<ClipboardTreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ClipboardTreeElement | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly commandStore = new ClipboardCommandStore();

  constructor(private readonly historyManager: ClipboardHistoryManager = getClipboardHistoryManager()) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ClipboardTreeElement): vscode.TreeItem {
    if (isCategory(element)) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = element.id;
      item.contextValue = 'clipboardCategory';
      item.iconPath = new vscode.ThemeIcon(
        element.scope === 'history' ? 'history' : element.scope === 'slots' ? 'symbol-snippet' : 'terminal'
      );
      return item;
    }
    if (isAction(element)) {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.description = element.description;
      item.command = { command: element.commandId, title: element.label };
      item.contextValue = 'clipboardAction';
      item.iconPath = new vscode.ThemeIcon(element.id.includes('clear') ? 'trash' : 'add');
      return item;
    }
    if (isHistoryEntry(element)) {
      const preview = truncateClipboardPreview(element.text, TREE_PREVIEW_CHARS);
      const item = new vscode.TreeItem(preview, vscode.TreeItemCollapsibleState.None);
      item.description = `${element.source} · ${new Date(element.timestamp).toLocaleTimeString()}`;
      item.tooltip = element.text;
      item.command = {
        command: 'cursor-toys.clipboard.pasteHistoryEntry',
        title: 'Paste',
        arguments: [element.text],
      };
      item.contextValue = 'clipboardHistoryEntry';
      item.iconPath = new vscode.ThemeIcon(element.source === 'cut' ? 'diff-removed' : 'copy');
      return item;
    }
    if (isSlot(element)) {
      const item = new vscode.TreeItem(element.displayLabel, vscode.TreeItemCollapsibleState.None);
      item.description = element.preview || 'empty';
      item.tooltip = element.preview ? `${element.displayLabel}\n\n${element.preview}` : element.displayLabel;
      item.command = {
        command: 'cursor-toys.clipboard.pasteSnippetSlot',
        title: 'Paste Snippet',
        arguments: [element],
      };
      item.contextValue = 'clipboardSlotFilled';
      item.iconPath = new vscode.ThemeIcon('symbol-snippet');
      return item;
    }
    const entry = element.entry;
    const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
    item.description = entry.pinned ? `${entry.scope} · pinned` : entry.scope;
    item.command = {
      command: 'cursor-toys.commandClipboard.copy',
      title: 'Copy Command',
      arguments: [entry],
    };
    item.contextValue = 'clipboardCommandEntry';
    item.iconPath = new vscode.ThemeIcon(entry.pinned ? 'pinned' : 'terminal');
    return item;
  }

  async getChildren(element?: ClipboardTreeElement): Promise<ClipboardTreeElement[]> {
    if (!element) {
      return [
        { kind: 'category', id: 'history', label: 'Recent History', scope: 'history' },
        { kind: 'category', id: 'slots', label: 'Snippet Slots', scope: 'slots' },
        { kind: 'category', id: 'global', label: 'Global Commands', scope: 'global' },
        { kind: 'category', id: 'workspace', label: 'Workspace Commands', scope: 'workspace' },
      ];
    }
    if (isCategory(element)) {
      if (element.scope === 'history') {
        const entries = this.historyManager.getEntries();
        const children: ClipboardTreeElement[] = entries.map((entry, index) => ({
          kind: 'historyEntry' as const,
          index,
          text: entry.text,
          source: entry.source,
          timestamp: entry.timestamp,
        }));
        children.push({
          kind: 'action',
          id: 'paste-history',
          label: 'Paste from picker…',
          commandId: 'cursor-toys.clipboard.pasteFromHistory',
          description: 'Quick Pick',
        });
        if (entries.length > 0) {
          children.push({
            kind: 'action',
            id: 'clear-history',
            label: 'Clear history',
            commandId: 'cursor-toys.clipboard.clearHistory',
          });
        }
        if (entries.length === 0) {
          children.unshift({
            kind: 'action',
            id: 'history-hint',
            label: 'Copy text in the editor (Ctrl+C)',
            commandId: 'cursor-toys.clipboard.pasteFromHistory',
            description: 'History fills automatically',
          });
        }
        return children;
      }
      if (element.scope === 'slots') {
        await this.historyManager.loadSlots(true);
        const slots = this.historyManager.listSlots();
        const children: ClipboardTreeElement[] = [
          {
            kind: 'action',
            id: 'new-slot',
            label: 'Save to snippet slot…',
            commandId: 'cursor-toys.clipboard.assignSnippetSlot',
            description: 'Name and store selection',
          },
        ];
        for (const { slotId, entry } of slots) {
          const displayLabel = formatSlotDisplayLabel(slotId, entry);
          children.push({
            kind: 'slot',
            slotId,
            displayLabel,
            preview: truncateClipboardPreview(entry.text, TREE_PREVIEW_CHARS),
          });
        }
        if (slots.length === 0) {
          children.push({
            kind: 'action',
            id: 'slots-hint',
            label: 'No snippets yet — use Save above',
            commandId: 'cursor-toys.clipboard.assignSnippetSlot',
          });
        }
        return children;
      }
      if (element.scope === 'global') {
        const entries = await this.commandStore.list('global');
        return entries.map((entry) => ({ kind: 'command' as const, entry }));
      }
      if (element.scope === 'workspace') {
        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!ws) {
          return [
            {
              kind: 'action',
              id: 'no-ws',
              label: 'Open a workspace folder',
              commandId: 'cursor-toys.clipboard.pasteFromHistory',
              description: 'required for workspace commands',
            },
          ];
        }
        const entries = await this.commandStore.list('workspace', ws);
        return entries.map((entry) => ({ kind: 'command' as const, entry }));
      }
    }
    return [];
  }
}

export function isClipboardCommandItem(
  arg: ClipboardTreeElement | ClipboardCommandEntry | undefined
): arg is ClipboardCommandEntry {
  return !!arg && 'id' in arg && 'text' in arg && 'scope' in arg;
}
