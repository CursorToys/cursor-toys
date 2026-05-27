import * as vscode from 'vscode';
import { injectTextToChat, notifyPasteWithoutSubmit } from './chatInjection';
import { sendToChat } from './sendToChat';

export interface SendDeepflowToChatOptions {
  /** When false, paste in the composer without auto-submit (draft Plan). Default: true. */
  submit?: boolean;
}

/**
 * Sends text to Cursor chat using paste-and-submit injection
 * (cursorInject.send → paste/submit → workbench chat → deeplink fallback).
 */
export async function sendDeepflowToChat(
  text: string,
  options?: SendDeepflowToChatOptions
): Promise<boolean> {
  const payload = (text || '').trim();
  if (!payload) {
    return false;
  }
  const shouldSubmit = options?.submit !== false;

  if (shouldSubmit) {
    try {
      const cmds = await vscode.commands.getCommands(true);
      if (cmds.includes('cursorInject.send')) {
        await vscode.commands.executeCommand('cursorInject.send', payload);
        return true;
      }
    } catch {
      // try next strategy
    }
  }

  const injected = await injectTextToChat(payload, { submit: shouldSubmit });
  if (injected.pasted) {
    if (shouldSubmit && !injected.submitted) {
      notifyPasteWithoutSubmit('DeepFlow');
    }
    return true;
  }

  if (!shouldSubmit) {
    return false;
  }

  const fallback = await sendToChat(payload);
  if (fallback) {
    void vscode.window.showInformationMessage(
      'DeepFlow: opened chat with your message (auto-paste was unavailable). Submit manually if needed.'
    );
  }
  return fallback;
}
