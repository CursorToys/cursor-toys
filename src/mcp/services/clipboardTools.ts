import * as vscode from 'vscode';
import { z } from 'zod';
import { getClipboardHistoryManager } from '../../clipboardHistoryManager';
import { truncatePreview } from '../security';

export function buildClipboardToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    clipboard_history_list: async () => {
      const config = vscode.workspace.getConfiguration('cursorToys');
      if (config.get<boolean>('mcp.disableClipboardViaMcp', false)) {
        throw new Error('Clipboard MCP tools are disabled by cursorToys.mcp.disableClipboardViaMcp');
      }
      const mgr = getClipboardHistoryManager();
      const previewChars = mgr.getPreviewChars();
      const entries = mgr.getEntries().map((e, index) => ({
        index,
        source: e.source,
        preview: truncatePreview(e.text, previewChars),
        length: e.text.length,
      }));
      return { count: entries.length, entries };
    },
    clipboard_history_get: async (args) => {
      const config = vscode.workspace.getConfiguration('cursorToys');
      if (config.get<boolean>('mcp.disableClipboardViaMcp', false)) {
        throw new Error('Clipboard MCP tools are disabled');
      }
      const index = args.index as number | undefined;
      if (index === undefined || index < 0) {
        throw new Error('index is required (0-based)');
      }
      const mgr = getClipboardHistoryManager();
      const entries = mgr.getEntries();
      const entry = entries[index];
      if (!entry) {
        throw new Error(`No clipboard entry at index ${index}`);
      }
      const includeFull = args.includeFullContent === true;
      return {
        index,
        source: entry.source,
        text: includeFull ? entry.text : truncatePreview(entry.text, mgr.getPreviewChars()),
        truncated: !includeFull && entry.text.length > mgr.getPreviewChars(),
      };
    },
    clipboard_history_clear: async () => {
      getClipboardHistoryManager().clearHistory();
      return { cleared: true };
    },
    clipboard_slot_list: async () => {
      const mgr = getClipboardHistoryManager();
      await mgr.loadSlots();
      return { slots: mgr.listSlots() };
    },
    clipboard_slot_get: async (args) => {
      const slotId = String(args.slotId ?? '');
      const mgr = getClipboardHistoryManager();
      const entry = await mgr.getSlotEntry(slotId);
      if (!entry) {
        throw new Error(`Slot not found: ${slotId}`);
      }
      return { slotId, entry };
    },
    clipboard_slot_assign: async (args) => {
      const slotId = String(args.slotId ?? '');
      const text = String(args.text ?? '');
      const mgr = getClipboardHistoryManager();
      const ok = await mgr.assignSlot(slotId, text, args.label as string | undefined);
      return { assigned: ok, slotId };
    },
    clipboard_slot_rename: async (args) => {
      const slotId = String(args.slotId ?? '');
      const label = String(args.label ?? '');
      const mgr = getClipboardHistoryManager();
      const ok = await mgr.renameSlot(slotId, label);
      return { renamed: ok, slotId };
    },
    clipboard_slot_clear: async (args) => {
      const slotId = String(args.slotId ?? '');
      const mgr = getClipboardHistoryManager();
      const ok = await mgr.clearSlot(slotId);
      return { cleared: ok, slotId };
    },
  };
}

export function buildClipboardToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const confirm = { confirm: z.boolean().optional() };
  return [
    { name: 'clipboard_history_list', description: 'List clipboard ring buffer (preview truncated)', inputSchema: {} },
    {
      name: 'clipboard_history_get',
      description: 'Get clipboard entry by index',
      inputSchema: {
        index: z.number(),
        includeFullContent: z.boolean().optional(),
      },
    },
    { name: 'clipboard_history_clear', description: 'Clear clipboard history', inputSchema: confirm },
    { name: 'clipboard_slot_list', description: 'List named clipboard slots', inputSchema: {} },
    { name: 'clipboard_slot_get', description: 'Get clipboard slot content', inputSchema: { slotId: z.string() } },
    {
      name: 'clipboard_slot_assign',
      description: 'Assign text to clipboard slot',
      inputSchema: { slotId: z.string(), text: z.string(), label: z.string().optional() },
    },
    {
      name: 'clipboard_slot_rename',
      description: 'Rename clipboard slot label',
      inputSchema: { slotId: z.string(), label: z.string() },
    },
    { name: 'clipboard_slot_clear', description: 'Clear clipboard slot', inputSchema: { slotId: z.string() } },
  ];
}
