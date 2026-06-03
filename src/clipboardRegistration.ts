import * as vscode from 'vscode';
import { getClipboardHistoryManager, ClipboardHistoryManager } from './clipboardHistoryManager';
import { ClipboardCommandStore } from './clipboardCommandStore';
import { ClipboardCommandEntry, ClipboardCommandScope } from './clipboardCommandTypes';
import { formatSlotDisplayLabel, normalizeClipSlotId } from './clipboardSnippetSlots';
import { truncateClipboardPreview } from './clipboardQuickPick';
import { ClipboardSlotItem, UserClipboardTreeProvider } from './userClipboardTreeProvider';

/**
 * Registers clipboard history and command clipboard commands.
 */
/**
 * Enables or disables Ctrl+C / Ctrl+X interception via keybinding `when` clauses.
 */
export async function syncClipboardKeybindingContext(): Promise<void> {
  const enabled = vscode.workspace
    .getConfiguration('cursorToys')
    .get<boolean>('clipboard.bindStandardKeys', true);
  await vscode.commands.executeCommand('setContext', 'cursorToys.clipboard.standardKeysEnabled', enabled);
}

export function registerClipboardFeature(
  context: vscode.ExtensionContext,
  treeProvider: UserClipboardTreeProvider
): void {
  const manager = getClipboardHistoryManager();
  const commandStore = new ClipboardCommandStore();

  void syncClipboardKeybindingContext();

  const refreshTree = (): void => treeProvider.refresh();

  const copyCmd = vscode.commands.registerCommand('cursor-toys.clipboard.copy', async () => {
    await captureClipboardAfterEditorAction(manager, 'editor.action.clipboardCopyAction', 'copy');
    refreshTree();
  });

  const cutCmd = vscode.commands.registerCommand('cursor-toys.clipboard.cut', async () => {
    await captureClipboardAfterEditorAction(manager, 'editor.action.clipboardCutAction', 'cut');
    refreshTree();
  });

  const pasteHistoryCmd = vscode.commands.registerCommand(
    'cursor-toys.clipboard.pasteFromHistory',
    async () => {
      await manager.pasteFromHistory();
    }
  );

  const clearHistoryCmd = vscode.commands.registerCommand('cursor-toys.clipboard.clearHistory', () => {
    manager.clearHistory();
    void vscode.window.showInformationMessage('Clipboard history cleared.');
    refreshTree();
  });

  const pasteHistoryEntryCmd = vscode.commands.registerCommand(
    'cursor-toys.clipboard.pasteHistoryEntry',
    async (text?: string) => {
      if (typeof text !== 'string' || !text) {
        return;
      }
      await manager.pasteHistoryText(text);
    }
  );

  const assignSlotCmd = vscode.commands.registerCommand(
    'cursor-toys.clipboard.assignSnippetSlot',
    async (slotIdArg?: string | ClipboardSlotItem) => {
      const text =
        manager.getSelectionText() ??
        manager.getEntries()[0]?.text ??
        (await vscode.env.clipboard.readText());
      if (!text?.trim()) {
        void vscode.window.showWarningMessage('Select text, copy to history, or use the system clipboard first.');
        return;
      }
      await manager.loadSlots(true);
      const targetSlotId = resolveSlotIdArg(slotIdArg) ?? (await pickSnippetSlotTarget(manager));
      if (!targetSlotId) {
        return;
      }
      const existing = await manager.getSlotEntry(targetSlotId);
      const defaultName =
        existing?.label?.trim() || text.split('\n')[0].trim().slice(0, 48) || targetSlotId;
      const nameInput = await vscode.window.showInputBox({
        prompt: 'Name for this snippet (shown in the sidebar)',
        placeHolder: 'e.g. Docker compose, API boilerplate',
        value: defaultName,
      });
      if (nameInput === undefined) {
        return;
      }
      const label = nameInput.trim() || undefined;
      const ok = await manager.assignSlot(targetSlotId, text, label);
      if (ok) {
        const entry = await manager.getSlotEntry(targetSlotId);
        const name = formatSlotDisplayLabel(targetSlotId, entry);
        void vscode.window.showInformationMessage(`Snippet saved: ${name}`);
        manager.invalidateSlotsCache();
        refreshTree();
      }
    }
  );

  const renameSlotCmd = vscode.commands.registerCommand(
    'cursor-toys.clipboard.renameSnippetSlot',
    async (slotIdArg?: string | ClipboardSlotItem) => {
      await manager.loadSlots(true);
      let slotId = resolveSlotIdArg(slotIdArg);
      if (!slotId) {
        slotId = await pickExistingSlotId(manager, 'Select snippet to rename');
      }
      if (!slotId) {
        return;
      }
      const entry = await manager.getSlotEntry(slotId);
      if (!entry) {
        return;
      }
      const newLabel = await vscode.window.showInputBox({
        prompt: 'Snippet name',
        value: entry.label ?? formatSlotDisplayLabel(slotId, entry),
      });
      if (newLabel === undefined) {
        return;
      }
      await manager.renameSlot(slotId, newLabel);
      manager.invalidateSlotsCache();
      refreshTree();
      void vscode.window.showInformationMessage(`Renamed to "${newLabel.trim() || slotId}".`);
    }
  );

  const clearSlotCmd = vscode.commands.registerCommand(
    'cursor-toys.clipboard.clearSnippetSlot',
    async (slotIdArg?: string | ClipboardSlotItem) => {
      await manager.loadSlots(true);
      let slotId = resolveSlotIdArg(slotIdArg);
      if (!slotId) {
        slotId = await pickExistingSlotId(manager, 'Select snippet to remove');
      }
      if (!slotId) {
        return;
      }
      const entry = await manager.getSlotEntry(slotId);
      const name = formatSlotDisplayLabel(slotId, entry);
      const confirm = await vscode.window.showWarningMessage(`Remove snippet "${name}"?`, 'Remove');
      if (confirm !== 'Remove') {
        return;
      }
      await manager.clearSlot(slotId);
      manager.invalidateSlotsCache();
      refreshTree();
    }
  );

  const pasteSlotCmd = vscode.commands.registerCommand(
    'cursor-toys.clipboard.pasteSnippetSlot',
    async (slotIdArg?: string | ClipboardSlotItem) => {
      await manager.loadSlots(true);
      let target = resolveSlotIdArg(slotIdArg);
      if (!target) {
        target = await pickExistingSlotId(manager, 'Paste snippet');
      }
      if (!target) {
        return;
      }
      await manager.pasteSlot(target);
    }
  );

  const saveCommandCmd = vscode.commands.registerCommand(
    'cursor-toys.commandClipboard.save',
    async () => {
      const text =
        manager.getSelectionText() ??
        manager.getEntries()[0]?.text ??
        (await vscode.env.clipboard.readText());
      if (!text?.trim()) {
        void vscode.window.showWarningMessage('Select or copy command text first.');
        return;
      }
      const label = await vscode.window.showInputBox({
        prompt: 'Command label',
        value: text.split('\n')[0].slice(0, 60),
      });
      if (!label) {
        return;
      }
      const scope = await pickCommandScope();
      if (!scope) {
        return;
      }
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      try {
        await commandStore.save(label, text, scope, { workspacePath: ws });
        void vscode.window.showInformationMessage(`Command saved (${scope}).`);
        refreshTree();
      } catch (err) {
        void vscode.window.showErrorMessage(err instanceof Error ? err.message : 'Failed to save command.');
      }
    }
  );

  const copyCommandCmd = vscode.commands.registerCommand(
    'cursor-toys.commandClipboard.copy',
    async (arg?: ClipboardCommandEntry) => {
      const entry = resolveCommandEntry(arg);
      if (!entry) {
        return;
      }
      await vscode.env.clipboard.writeText(entry.text);
      void vscode.window.showInformationMessage(`Copied "${entry.label}" to clipboard.`);
    }
  );

  const runCommandCmd = vscode.commands.registerCommand(
    'cursor-toys.commandClipboard.run',
    async (arg?: ClipboardCommandEntry) => {
      const entry = resolveCommandEntry(arg);
      if (!entry) {
        return;
      }
      const preview = entry.text.length > 120 ? `${entry.text.slice(0, 120)}…` : entry.text;
      const confirm = await vscode.window.showWarningMessage(
        `Run command in terminal?\n${preview}`,
        { modal: true },
        'Run'
      );
      if (confirm !== 'Run') {
        return;
      }
      const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('CursorToys Command');
      terminal.show();
      terminal.sendText(entry.text, true);
    }
  );

  const deleteCommandCmd = vscode.commands.registerCommand(
    'cursor-toys.commandClipboard.delete',
    async (arg?: ClipboardCommandEntry) => {
      const entry = resolveCommandEntry(arg);
      if (!entry) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Delete command "${entry.label}"?`,
        'Delete'
      );
      if (confirm !== 'Delete') {
        return;
      }
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      await commandStore.delete(entry, ws);
      refreshTree();
    }
  );

  const duplicateCommandCmd = vscode.commands.registerCommand(
    'cursor-toys.commandClipboard.duplicate',
    async (arg?: ClipboardCommandEntry) => {
      const entry = resolveCommandEntry(arg);
      if (!entry) {
        return;
      }
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      await commandStore.duplicate(entry, ws);
      refreshTree();
    }
  );

  const pinCommandCmd = vscode.commands.registerCommand(
    'cursor-toys.commandClipboard.pin',
    async (arg?: ClipboardCommandEntry) => {
      const entry = resolveCommandEntry(arg);
      if (!entry) {
        return;
      }
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      await commandStore.setPinned(entry, !entry.pinned, ws);
      refreshTree();
    }
  );

  const renameCommandCmd = vscode.commands.registerCommand(
    'cursor-toys.commandClipboard.rename',
    async (arg?: ClipboardCommandEntry) => {
      const entry = resolveCommandEntry(arg);
      if (!entry) {
        return;
      }
      const newLabel = await vscode.window.showInputBox({
        prompt: 'New label',
        value: entry.label,
      });
      if (!newLabel) {
        return;
      }
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      await commandStore.rename(entry, newLabel, ws);
      refreshTree();
    }
  );

  const refreshClipboardCmd = vscode.commands.registerCommand('cursor-toys.refreshClipboard', () => {
    void manager.loadSlots();
    refreshTree();
  });

  context.subscriptions.push(
    copyCmd,
    cutCmd,
    pasteHistoryCmd,
    pasteHistoryEntryCmd,
    clearHistoryCmd,
    assignSlotCmd,
    renameSlotCmd,
    clearSlotCmd,
    pasteSlotCmd,
    saveCommandCmd,
    copyCommandCmd,
    runCommandCmd,
    deleteCommandCmd,
    duplicateCommandCmd,
    pinCommandCmd,
    renameCommandCmd,
    refreshClipboardCmd,
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cursorToys.clipboard')) {
        manager.onConfigurationChanged();
        void syncClipboardKeybindingContext();
      }
    })
  );
}

/**
 * Runs the native editor copy/cut, then records whatever landed on the system clipboard.
 */
async function captureClipboardAfterEditorAction(
  manager: ClipboardHistoryManager,
  editorAction: 'editor.action.clipboardCopyAction' | 'editor.action.clipboardCutAction',
  source: 'copy' | 'cut'
): Promise<void> {
  await vscode.commands.executeCommand(editorAction);
  if (!manager.isEnabled()) {
    return;
  }
  const clip = await vscode.env.clipboard.readText();
  if (clip.length > 0) {
    manager.record(clip, source);
  }
}

function resolveSlotIdArg(arg?: string | ClipboardSlotItem): string | undefined {
  if (!arg) {
    return undefined;
  }
  if (typeof arg === 'string') {
    return normalizeClipSlotId(arg) ?? undefined;
  }
  if (arg.kind === 'slot') {
    return arg.slotId;
  }
  return undefined;
}

async function pickSnippetSlotTarget(manager: ClipboardHistoryManager): Promise<string | undefined> {
  const slots = manager.listSlots();
  type PickItem = vscode.QuickPickItem & { slotId: string };
  const items: PickItem[] = slots.map(({ slotId, entry }) => ({
    label: formatSlotDisplayLabel(slotId, entry),
    description: truncateClipboardPreview(entry.text, 60),
    detail: slotId,
    slotId,
  }));
  items.push({
    label: '$(add) New snippet…',
    description: 'Choose a name and store current text',
    slotId: '__new__',
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Save to snippet slot (replace existing or create new)',
  });
  if (!picked) {
    return undefined;
  }
  if (picked.slotId === '__new__') {
    const newId = manager.allocateSlotId();
    if (!newId) {
      void vscode.window.showErrorMessage('All 99 snippet slots are in use. Remove one first.');
      return undefined;
    }
    return newId;
  }
  const replace = await vscode.window.showWarningMessage(
    `Replace snippet "${picked.label}"?`,
    'Replace'
  );
  return replace === 'Replace' ? picked.slotId : undefined;
}

async function pickExistingSlotId(
  manager: ClipboardHistoryManager,
  placeHolder: string
): Promise<string | undefined> {
  const slots = manager.listSlots();
  if (slots.length === 0) {
    void vscode.window.showInformationMessage('No snippets saved yet.');
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    slots.map(({ slotId, entry }) => ({
      label: formatSlotDisplayLabel(slotId, entry),
      description: truncateClipboardPreview(entry.text, 60),
      slotId,
    })),
    { placeHolder }
  );
  return picked?.slotId;
}

async function pickCommandScope(): Promise<ClipboardCommandScope | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'Global', description: 'All workspaces', scope: 'global' as const },
      { label: 'Workspace', description: 'Current workspace folder', scope: 'workspace' as const },
      { label: 'Project', description: 'Same as workspace for this repo', scope: 'project' as const },
    ],
    { placeHolder: 'Command clipboard scope' }
  );
  return pick?.scope;
}

function resolveCommandEntry(arg: unknown): ClipboardCommandEntry | undefined {
  if (!arg || typeof arg !== 'object') {
    return undefined;
  }
  const record = arg as Record<string, unknown>;
  if (record.id && record.text && record.scope && record.label) {
    return arg as ClipboardCommandEntry;
  }
  if (record.entry && typeof record.entry === 'object') {
    return resolveCommandEntry(record.entry);
  }
  return undefined;
}
