import * as vscode from 'vscode';
import * as path from 'path';
import { ClipboardRingBuffer } from './clipboardRingBuffer';
import { pickClipboardHistoryEntry } from './clipboardQuickPick';
import {
  assignClipSlot,
  ClipboardSlotEntry,
  ClipboardSlotsStore,
  findNextFreeSlotId,
  formatSlotDisplayLabel,
  listClipSlots,
  normalizeClipSlotId,
  parseClipboardSlotsJson,
  removeClipSlot,
  renameClipSlotLabel,
  serializeClipboardSlots,
} from './clipboardSnippetSlots';
import { getClipboardSlotsFilePath } from './utils';

/**
 * Orchestrates in-memory clipboard history and persisted snippet slots.
 */
export class ClipboardHistoryManager {
  private buffer = new ClipboardRingBuffer();
  private slots: ClipboardSlotsStore = {};
  private slotsLoaded = false;

  isEnabled(): boolean {
    return vscode.workspace.getConfiguration('cursorToys').get<boolean>('clipboard.enabled', true);
  }

  private getConfig(): { maxEntries: number; maxEntryChars: number; syncWithSystem: boolean; previewChars: number } {
    const config = vscode.workspace.getConfiguration('cursorToys');
    return {
      maxEntries: Math.max(1, config.get<number>('clipboard.maxEntries', 30)),
      maxEntryChars: Math.max(1, config.get<number>('clipboard.maxEntryChars', 100_000)),
      syncWithSystem: config.get<boolean>('clipboard.syncWithSystem', true),
      previewChars: Math.max(20, config.get<number>('clipboard.previewChars', 80)),
    };
  }

  getPreviewChars(): number {
    return this.getConfig().previewChars;
  }

  private rebuildBuffer(): void {
    const { maxEntries, maxEntryChars } = this.getConfig();
    const previous = this.buffer.getEntries();
    this.buffer = new ClipboardRingBuffer({ maxEntries, maxEntryChars });
    for (let i = previous.length - 1; i >= 0; i--) {
      this.buffer.push(previous[i].text, previous[i].source);
    }
  }

  /**
   * Records text in the ring buffer.
   */
  record(text: string, source: 'copy' | 'cut'): void {
    if (!this.isEnabled()) {
      return;
    }
    this.rebuildBuffer();
    const { maxEntryChars } = this.getConfig();
    const ok = this.buffer.push(text, source);
    if (!ok) {
      void vscode.window.showWarningMessage(
        `Clipboard entry exceeds max size (${maxEntryChars} characters) and was not stored.`
      );
    }
  }

  getEntries(): readonly import('./clipboardRingBuffer').ClipboardRingEntry[] {
    return this.buffer.getEntries();
  }

  clearHistory(): void {
    this.buffer.clear();
  }

  invalidateSlotsCache(): void {
    this.slotsLoaded = false;
  }

  async loadSlots(force = false): Promise<void> {
    if (this.slotsLoaded && !force) {
      return;
    }
    const filePath = getClipboardSlotsFilePath();
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      this.slots = parseClipboardSlotsJson(Buffer.from(raw).toString('utf8'));
    } catch {
      this.slots = {};
    }
    this.slotsLoaded = true;
  }

  private async persistSlots(): Promise<void> {
    const filePath = getClipboardSlotsFilePath();
    const dir = path.dirname(filePath);
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dir));
    } catch {
      // exists
    }
    const content = Buffer.from(serializeClipboardSlots(this.slots), 'utf8');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content);
  }

  async getSlotEntry(slotId: string): Promise<ClipboardSlotEntry | undefined> {
    await this.loadSlots();
    const key = normalizeClipSlotId(slotId);
    return key ? this.slots[key] : undefined;
  }

  listSlots(): { slotId: string; entry: ClipboardSlotEntry }[] {
    return listClipSlots(this.slots);
  }

  async assignSlot(slotId: string, text: string, label?: string): Promise<boolean> {
    const key = normalizeClipSlotId(slotId);
    if (!key) {
      void vscode.window.showErrorMessage('Invalid slot. Use clip01 through clip99.');
      return false;
    }
    await this.loadSlots();
    const existing = this.slots[key];
    this.slots = assignClipSlot(this.slots, key, text, label ?? existing?.label);
    await this.persistSlots();
    return true;
  }

  async renameSlot(slotId: string, label: string): Promise<boolean> {
    const key = normalizeClipSlotId(slotId);
    if (!key || !this.slots[key]) {
      return false;
    }
    await this.loadSlots();
    this.slots = renameClipSlotLabel(this.slots, key, label);
    await this.persistSlots();
    return true;
  }

  async clearSlot(slotId: string): Promise<boolean> {
    const key = normalizeClipSlotId(slotId);
    if (!key) {
      return false;
    }
    await this.loadSlots();
    if (!this.slots[key]) {
      return false;
    }
    this.slots = removeClipSlot(this.slots, key);
    await this.persistSlots();
    return true;
  }

  allocateSlotId(): string | null {
    return findNextFreeSlotId(this.slots);
  }

  getSlotsStore(): ClipboardSlotsStore {
    return { ...this.slots };
  }

  /**
   * Inserts text at the active editor selection or cursor.
   */
  async insertText(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showWarningMessage('Open an editor to paste clipboard content.');
      return;
    }
    await editor.edit((builder) => {
      if (!editor.selection.isEmpty) {
        builder.replace(editor.selection, text);
      } else {
        builder.insert(editor.selection.active, text);
      }
    });
  }

  private async syncSystemClipboard(text: string): Promise<void> {
    if (this.getConfig().syncWithSystem) {
      await vscode.env.clipboard.writeText(text);
    }
  }

  /**
   * Pastes a specific history entry (e.g. from sidebar click).
   */
  async pasteHistoryText(text: string): Promise<void> {
    if (!text) {
      return;
    }
    await this.syncSystemClipboard(text);
    await this.insertText(text);
  }

  /**
   * Opens history Quick Pick and pastes the chosen entry.
   */
  async pasteFromHistory(): Promise<void> {
    if (!this.isEnabled()) {
      void vscode.window.showWarningMessage('CursorToys clipboard history is disabled.');
      return;
    }
    const { previewChars } = this.getConfig();
    const text = await pickClipboardHistoryEntry(this.buffer.getEntries(), previewChars);
    if (text === undefined) {
      return;
    }
    await this.pasteHistoryText(text);
  }

  async pasteSlot(slotId: string): Promise<void> {
    await this.loadSlots();
    const entry = await this.getSlotEntry(slotId);
    if (!entry?.text) {
      const label = formatSlotDisplayLabel(slotId, entry);
      void vscode.window.showWarningMessage(`Snippet "${label}" is empty.`);
      return;
    }
    await this.syncSystemClipboard(entry.text);
    await this.insertText(entry.text);
  }

  /**
   * Reads current editor selection text.
   */
  getSelectionText(): string | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      return undefined;
    }
    return editor.document.getText(editor.selection);
  }

  onConfigurationChanged(): void {
    this.rebuildBuffer();
  }
}

let managerInstance: ClipboardHistoryManager | undefined;

export function getClipboardHistoryManager(): ClipboardHistoryManager {
  if (!managerInstance) {
    managerInstance = new ClipboardHistoryManager();
  }
  return managerInstance;
}
