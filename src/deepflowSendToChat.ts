import * as vscode from 'vscode';
import { injectTextToChat, notifyPasteWithoutSubmit } from './remoteTelegram';
import { sendToChat } from './sendToChat';

/**
 * Sends text to Cursor chat using the same injection path as Remote Telegram
 * (cursorInject.send → paste/submit → workbench chat → deeplink fallback).
 */
export async function sendDeepflowToChat(text: string): Promise<boolean> {
  const payload = (text || '').trim();
  if (!payload) {
    return false;
  }
  try {
    const cmds = await vscode.commands.getCommands(true);
    if (cmds.includes('cursorInject.send')) {
      await vscode.commands.executeCommand('cursorInject.send', payload);
      return true;
    }
  } catch {
    // try next strategy
  }
  const injected = await injectTextToChat(payload);
  if (injected.pasted) {
    if (!injected.submitted) {
      notifyPasteWithoutSubmit('DeepFlow');
    }
    return true;
  }
  const fallback = await sendToChat(payload);
  if (fallback) {
    void vscode.window.showInformationMessage(
      'DeepFlow: opened chat with your message (auto-paste was unavailable). Submit manually if needed.'
    );
  }
  return fallback;
}
