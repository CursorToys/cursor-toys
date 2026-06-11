import * as vscode from 'vscode';
import { z } from 'zod';
import { callGeminiApi } from '../../geminiApi';
import { DEFAULT_GEMINI_MODEL } from '../../geminiModels';
import { minifyFile, minifyContent, detectFileType, type MinifiableFileType } from '../../minifier';
import { readClipboard, trimClipboardAuto } from '../../clipboardProcessor';
import { sendToChat } from '../../sendToChat';
import type { McpHostContext } from '../types';

const GEMINI_API_KEY_SECRET = 'cursorToys.geminiApiKey';

async function getGeminiConfig() {
  const config = vscode.workspace.getConfiguration('cursorToys');
  return {
    model: config.get<string>('geminiModel', DEFAULT_GEMINI_MODEL),
    prompt: config.get<string>('geminiRefinePrompt', ''),
    timeout: config.get<number>('geminiRequestTimeout', 30),
  };
}

export function buildRefineToolHandlers(
  ctx: McpHostContext
): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    minify_file: async (args) => {
      const filePath = String(args.filePath ?? '');
      if (!filePath) {
        throw new Error('filePath is required');
      }
      const result = await minifyFile(filePath);
      return result;
    },
    minify_text: async (args) => {
      const text = String(args.text ?? '');
      const fileType = ((args.fileType as string) || detectFileType('file.json')) as MinifiableFileType;
      const result = minifyContent(text, fileType);
      return result;
    },
    trim_clipboard: async () => {
      await trimClipboardAuto();
      return { ok: true };
    },
    refine_text: async (args) => {
      const text = String(args.text ?? '');
      if (!text.trim()) {
        throw new Error('text is required');
      }
      const apiKey = await ctx.extensionContext.secrets.get(GEMINI_API_KEY_SECRET);
      if (!apiKey) {
        throw new Error('Gemini API key not configured. Use configure_gemini_key.');
      }
      const geminiConfig = await getGeminiConfig();
      const prompt = (args.prompt as string | undefined) ?? geminiConfig.prompt;
      const refined = await callGeminiApi(text, {
        apiKey,
        model: geminiConfig.model,
        prompt,
        timeout: geminiConfig.timeout,
      });
      return { refined };
    },
    refine_and_send_to_chat: async (args) => {
      const text = String(args.text ?? '');
      if (!text.trim()) {
        throw new Error('text is required');
      }
      const apiKey = await ctx.extensionContext.secrets.get(GEMINI_API_KEY_SECRET);
      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }
      const geminiConfig = await getGeminiConfig();
      const refined = await callGeminiApi(text, {
        apiKey,
        model: geminiConfig.model,
        prompt: geminiConfig.prompt,
        timeout: geminiConfig.timeout,
      });
      if (!refined) {
        throw new Error('Refine failed');
      }
      await sendToChat(refined, args.prompt as string | undefined);
      return { refined, sent: true };
    },
    process_with_prompt: async (args) => {
      const text = String(args.text ?? '');
      const customPrompt = String(args.prompt ?? '');
      if (!text.trim() || !customPrompt.trim()) {
        throw new Error('text and prompt are required');
      }
      const apiKey = await ctx.extensionContext.secrets.get(GEMINI_API_KEY_SECRET);
      if (!apiKey) {
        throw new Error('Gemini API key not configured');
      }
      const geminiConfig = await getGeminiConfig();
      const result = await callGeminiApi(text, {
        apiKey,
        model: geminiConfig.model,
        prompt: customPrompt,
        timeout: geminiConfig.timeout,
      });
      return { result };
    },
    configure_gemini_key: async (args) => {
      const apiKey = String(args.apiKey ?? '').trim();
      if (!apiKey) {
        throw new Error('apiKey is required (set only, never read back)');
      }
      await ctx.extensionContext.secrets.store(GEMINI_API_KEY_SECRET, apiKey);
      return { configured: true };
    },
    remove_gemini_key: async () => {
      await ctx.extensionContext.secrets.delete(GEMINI_API_KEY_SECRET);
      return { removed: true };
    },
  };
}

export function buildRefineToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  return [
    { name: 'minify_file', description: 'Minify a file in workspace', inputSchema: { filePath: z.string() } },
    {
      name: 'minify_text',
      description: 'Minify text content',
      inputSchema: { text: z.string(), fileType: z.string().optional() },
    },
    { name: 'trim_clipboard', description: 'Trim and minify clipboard', inputSchema: {} },
    {
      name: 'refine_text',
      description: 'Refine text via Gemini',
      inputSchema: { text: z.string(), prompt: z.string().optional() },
    },
    {
      name: 'refine_and_send_to_chat',
      description: 'Refine text and send to chat',
      inputSchema: { text: z.string(), prompt: z.string().optional() },
    },
    {
      name: 'process_with_prompt',
      description: 'Process text with custom Gemini prompt',
      inputSchema: { text: z.string(), prompt: z.string() },
    },
    {
      name: 'configure_gemini_key',
      description: 'Set Gemini API key (write-only)',
      inputSchema: { apiKey: z.string() },
    },
    { name: 'remove_gemini_key', description: 'Remove Gemini API key', inputSchema: {} },
  ];
}
