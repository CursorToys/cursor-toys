import * as vscode from 'vscode';
import { ClipboardRingEntry } from './clipboardRingBuffer';

const DEFAULT_PREVIEW_CHARS = 80;

/**
 * Truncates text for Quick Pick labels.
 */
export function truncateClipboardPreview(text: string, maxChars: number): string {
  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= maxChars) {
    return singleLine;
  }
  return `${singleLine.slice(0, Math.max(0, maxChars - 1))}…`;
}

/**
 * Shows clipboard history in a Quick Pick; returns selected text or undefined.
 */
export async function pickClipboardHistoryEntry(
  entries: readonly ClipboardRingEntry[],
  previewChars: number = DEFAULT_PREVIEW_CHARS
): Promise<string | undefined> {
  if (entries.length === 0) {
    void vscode.window.showInformationMessage('Clipboard history is empty.');
    return undefined;
  }
  const items = entries.map((entry, index) => {
    const preview = truncateClipboardPreview(entry.text, previewChars);
    const sourceLabel = entry.source === 'cut' ? 'cut' : 'copy';
    return {
      label: `$(${index === 0 ? 'history' : 'file'}) ${preview}`,
      description: `${sourceLabel} · ${new Date(entry.timestamp).toLocaleTimeString()}`,
      detail: entry.text.length > previewChars ? entry.text : undefined,
      entry,
    };
  });
  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Paste from clipboard history',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return picked?.entry.text;
}
