import * as vscode from 'vscode';
import { z } from 'zod';
import { injectTextToChat } from '../../chatInjection';
import { buildPromptDeeplink, sendSelectionToChat, sendToChat } from '../../sendToChat';

export function buildChatToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    chat_send: async (args) => {
      const text = String(args.text ?? '');
      if (!text.trim()) {
        throw new Error('text is required');
      }
      const ok = await sendToChat(text, args.prompt as string | undefined);
      return { sent: ok };
    },
    chat_send_selection: async (args) => {
      const text = args.text as string | undefined;
      if (text?.trim()) {
        const ok = await sendToChat(text, args.prompt as string | undefined);
        return { sent: ok, source: 'args' };
      }
      await sendSelectionToChat(args.prompt as string | undefined);
      return { sent: true, source: 'selection' };
    },
    chat_open_with_prompt: async (args) => {
      const prompt = String(args.prompt ?? '');
      if (!prompt.trim()) {
        throw new Error('prompt is required');
      }
      await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
      return { opened: true };
    },
    chat_copy_as_prompt_link: async (args) => {
      const text = args.text as string | undefined;
      let content = text;
      if (!content?.trim()) {
        const editor = vscode.window.activeTextEditor;
        if (editor && !editor.selection.isEmpty) {
          content = editor.document.getText(editor.selection);
        }
      }
      if (!content?.trim()) {
        throw new Error('text or editor selection required');
      }
      const deeplink = buildPromptDeeplink(content);
      return { deeplink };
    },
    chat_inject: async (args) => {
      const text = String(args.text ?? '');
      if (!text.trim()) {
        throw new Error('text is required');
      }
      const submit =
        typeof args.submit === 'boolean' ? (args.submit as boolean) : undefined;
      const result = await injectTextToChat(
        text,
        submit !== undefined ? { submit } : undefined
      );
      return result;
    },
  };
}

export function buildChatToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  return [
    {
      name: 'chat_send',
      description: 'Send text to Cursor chat',
      inputSchema: { text: z.string(), prompt: z.string().optional() },
    },
    {
      name: 'chat_send_selection',
      description: 'Send selection or text to chat',
      inputSchema: { text: z.string().optional(), prompt: z.string().optional() },
    },
    {
      name: 'chat_open_with_prompt',
      description: 'Open chat composer with prompt',
      inputSchema: { prompt: z.string() },
    },
    {
      name: 'chat_copy_as_prompt_link',
      description: 'Build prompt deeplink from text or selection',
      inputSchema: { text: z.string().optional() },
    },
    {
      name: 'chat_inject',
      description: 'Inject text into chat composer (optional auto-submit)',
      inputSchema: { text: z.string(), submit: z.boolean().optional() },
    },
  ];
}
