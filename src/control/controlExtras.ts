import * as path from 'path';
import * as vscode from 'vscode';
import { ClipboardCommandStore } from '../clipboardCommandStore';
import type { ClipboardCommandEntry } from '../clipboardCommandTypes';
import { getClipboardHistoryManager } from '../clipboardHistoryManager';
import { formatSlotDisplayLabel } from '../clipboardSnippetSlots';
import { truncateClipboardPreview } from '../clipboardQuickPick';
import { CodeAnchorsManager } from '../codeAnchorsManager';
import { ProjectRegistry } from '../projects/projectRegistry';
import { isProjectsEnabled } from '../projects/projectsConfig';
import type { ProjectEntry } from '../projects/types';
import type { ControlAction } from './controlModel';

const PREVIEW_CHARS = 72;

export interface ControlCommandRow {
  id: string;
  label: string;
  description?: string;
  commandId: string;
  commandArgs?: unknown[];
}

export interface ControlClipboardData {
  history: ControlCommandRow[];
  slots: ControlCommandRow[];
  globalCommands: ControlCommandRow[];
  workspaceCommands: ControlCommandRow[];
}

export interface ControlProjectRow {
  id: string;
  label: string;
  description?: string;
  entry: ProjectEntry;
}

export interface ControlProjectsData {
  enabled: boolean;
  actions: ControlAction[];
  pinned: ControlProjectRow[];
  recent: ControlProjectRow[];
}

export interface ControlAnchorRow {
  id: string;
  filePath: string;
  fileName: string;
  line: number;
  preview: string;
}

export interface ControlCodeAnchorsData {
  enabled: boolean;
  anchors: ControlAnchorRow[];
  actions: ControlAction[];
}

function row(
  id: string,
  label: string,
  commandId: string,
  options?: { description?: string; commandArgs?: unknown[] }
): ControlCommandRow {
  return {
    id,
    label,
    description: options?.description,
    commandId,
    commandArgs: options?.commandArgs,
  };
}

function commandEntryRow(entry: ClipboardCommandEntry): ControlCommandRow {
  return row(entry.id, entry.label, 'cursor-toys.commandClipboard.copy', {
    description: entry.pinned ? `${entry.scope} · pinned` : entry.scope,
    commandArgs: [entry],
  });
}

function formatRelativeOpened(iso: string): string {
  const opened = new Date(iso).getTime();
  if (Number.isNaN(opened)) {
    return '';
  }
  const diffMs = Date.now() - opened;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

function projectRow(entry: ProjectEntry): ControlProjectRow {
  return {
    id: entry.id,
    label: entry.label,
    description: formatRelativeOpened(entry.lastOpenedAt),
    entry,
  };
}

/**
 * Builds clipboard sections for the Control webview.
 */
export async function buildClipboardData(): Promise<ControlClipboardData> {
  const historyManager = getClipboardHistoryManager();
  const commandStore = new ClipboardCommandStore();
  const entries = historyManager.getEntries();

  const history: ControlCommandRow[] = entries.map((entry, index) =>
    row(`hist-${index}`, truncateClipboardPreview(entry.text, PREVIEW_CHARS), 'cursor-toys.clipboard.pasteHistoryEntry', {
      description: `${entry.source} · ${new Date(entry.timestamp).toLocaleTimeString()}`,
      commandArgs: [entry.text],
    })
  );
  history.push(
    row('paste-picker', 'Paste from picker…', 'cursor-toys.clipboard.pasteFromHistory', {
      description: 'Quick Pick',
    })
  );
  if (entries.length > 0) {
    history.push(row('clear-history', 'Clear history', 'cursor-toys.clipboard.clearHistory'));
  }

  await historyManager.loadSlots(true);
  const slots: ControlCommandRow[] = [
    row('new-slot', 'Save to snippet slot…', 'cursor-toys.clipboard.assignSnippetSlot', {
      description: 'Name and store selection',
    }),
  ];
  for (const { slotId, entry } of historyManager.listSlots()) {
    const displayLabel = formatSlotDisplayLabel(slotId, entry);
    slots.push(
      row(`slot-${slotId}`, displayLabel, 'cursor-toys.clipboard.pasteSnippetSlot', {
        description: truncateClipboardPreview(entry.text, PREVIEW_CHARS),
        commandArgs: [{ kind: 'slot', slotId, displayLabel, preview: entry.text }],
      })
    );
  }

  const globalCommands = (await commandStore.list('global')).map(commandEntryRow);
  globalCommands.unshift(
    row('save-global-cmd', 'Save command to clipboard…', 'cursor-toys.commandClipboard.save', {
      description: 'Global scope',
    })
  );

  const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let workspaceCommands: ControlCommandRow[] = [];
  if (ws) {
    workspaceCommands = (await commandStore.list('workspace', ws)).map(commandEntryRow);
    workspaceCommands.unshift(
      row('save-ws-cmd', 'Save workspace command…', 'cursor-toys.commandClipboard.save', {
        description: 'Workspace scope',
      })
    );
  } else {
    workspaceCommands = [
      row('no-ws', 'Open a workspace folder', 'cursor-toys.clipboard.pasteFromHistory', {
        description: 'Required for workspace commands',
      }),
    ];
  }

  return { history, slots, globalCommands, workspaceCommands };
}

/**
 * Builds project registry data for the Control webview.
 */
export function buildProjectsData(registry: ProjectRegistry): ControlProjectsData {
  const actions: ControlAction[] = [
    { id: 'pin-current', label: 'Pin current workspace', commandId: 'cursor-toys.projects.pinCurrent' },
    { id: 'add-folder', label: 'Add project from folder…', commandId: 'cursor-toys.projects.addFromFolder' },
    { id: 'open-dashboard', label: 'Open projects dashboard', commandId: 'cursor-toys.projects.openDashboard' },
    { id: 'clear-recent', label: 'Clear recent', commandId: 'cursor-toys.projects.clearRecent' },
  ];

  if (!isProjectsEnabled()) {
    return { enabled: false, actions, pinned: [], recent: [] };
  }

  const pinned = registry
    .getPinned()
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(projectRow);
  const recent = registry.getRecent().map(projectRow);

  return { enabled: true, actions, pinned, recent };
}

/**
 * Builds code anchor rows for the Control webview.
 */
export async function buildCodeAnchorsData(
  context: vscode.ExtensionContext
): Promise<ControlCodeAnchorsData> {
  const cfg = vscode.workspace.getConfiguration('cursorToys');
  const enabled = cfg.get<boolean>('codeAnchors.enabled', true);
  const actions: ControlAction[] = [
    { id: 'toggle-anchor', label: 'Toggle anchor on line', commandId: 'cursor-toys.toggleAnchor' },
    { id: 'next-anchor', label: 'Next anchor', commandId: 'cursor-toys.nextAnchor' },
    { id: 'prev-anchor', label: 'Previous anchor', commandId: 'cursor-toys.prevAnchor' },
    { id: 'clear-anchors', label: 'Clear all anchors', commandId: 'cursor-toys.clearAnchors' },
  ];

  if (!enabled) {
    return { enabled: false, anchors: [], actions };
  }

  const manager = CodeAnchorsManager.getInstance(context);
  const allAnchors = manager.getAllAnchors();
  const anchors: ControlAnchorRow[] = [];

  for (const [uriString, lines] of allAnchors.entries()) {
    const uri = vscode.Uri.parse(uriString);
    let document: vscode.TextDocument | undefined;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch {
      document = undefined;
    }
    for (const line of lines) {
      let preview = '(unable to read)';
      if (document && line < document.lineCount) {
        preview = document.lineAt(line).text.trim().substring(0, 50) || '(empty line)';
      }
      anchors.push({
        id: `${uri.fsPath}:${line}`,
        filePath: uri.fsPath,
        fileName: path.basename(uri.fsPath),
        line,
        preview,
      });
    }
  }

  anchors.sort((a, b) => a.fileName.localeCompare(b.fileName) || a.line - b.line);
  return { enabled: true, anchors, actions };
}
