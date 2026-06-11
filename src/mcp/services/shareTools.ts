import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';
import { GistManager } from '../../gistManager';
import { importFromGist, importShareable } from '../../shareableImporter';
import { generateGistShareable, generateGistShareableForBundle, generateShareableForProject } from '../../shareableGenerator';
import { generateTree } from '../../treeGenerator';
import { sendToChat } from '../../sendToChat';
import type { McpHostContext } from '../types';

export function buildShareToolHandlers(
  ctx: McpHostContext
): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    import_shareable: async (args) => {
      const url = String(args.url ?? '').trim();
      if (!url) {
        throw new Error('url is required');
      }
      await importShareable(url);
      return { imported: true, url };
    },
    import_from_gist: async (args) => {
      const gistUrl = String(args.gistUrl ?? args.url ?? '').trim();
      if (!gistUrl) {
        throw new Error('gistUrl is required');
      }
      await importFromGist(gistUrl);
      return { imported: true, gistUrl };
    },
    export_project_bundle: async () => {
      const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!ws) {
        throw new Error('No workspace open');
      }
      const shareable = await generateShareableForProject(ws);
      return { shareable };
    },
    generate_tree: async (args) => {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) {
        throw new Error('No workspace open');
      }
      const targetPath = args.path
        ? path.isAbsolute(String(args.path))
          ? String(args.path)
          : path.join(ws.uri.fsPath, String(args.path))
        : ws.uri.fsPath;
      const result = await generateTree(targetPath, {
        maxDepth: args.maxDepth as number | undefined,
        maxFiles: args.maxFiles as number | undefined,
      });
      return result ?? { error: 'Could not generate tree' };
    },
    share_via_gist: async (args) => {
      const filePath = String(args.filePath ?? '').trim();
      if (!filePath) {
        throw new Error('filePath is required');
      }
      const gistUrl = await generateGistShareable(filePath, undefined, ctx.extensionContext);
      return { gistUrl };
    },
    share_folder_via_gist: async (args) => {
      const folderPath = String(args.folderPath ?? '').trim();
      if (!folderPath) {
        throw new Error('folderPath is required');
      }
      const bundleType = (args.bundleType as
        | 'command'
        | 'rule'
        | 'prompt'
        | 'notepad'
        | 'http'
        | 'project'
        | 'plan'
        | 'skill') ?? 'project';
      const gistUrl = await generateGistShareableForBundle(
        bundleType,
        folderPath,
        ctx.extensionContext
      );
      return { gistUrl };
    },
    configure_github_token: async (args) => {
      const token = String(args.token ?? '').trim();
      if (!token) {
        throw new Error('token is required (set only, never read back)');
      }
      const gist = GistManager.getInstance(ctx.extensionContext);
      await gist.setGitHubToken(token);
      return { configured: true };
    },
    remove_github_token: async () => {
      const gist = GistManager.getInstance(ctx.extensionContext);
      await gist.removeGitHubToken();
      return { removed: true };
    },
    chat_generate_tree_and_send: async (args) => {
      const ws = vscode.workspace.workspaceFolders?.[0];
      if (!ws) {
        throw new Error('No workspace open');
      }
      const result = await generateTree(ws.uri.fsPath);
      if (!result) {
        throw new Error('Could not generate tree');
      }
      const prompt = args.prompt as string | undefined;
      await sendToChat(result.tree, prompt);
      return { sent: true, fileCount: result.fileCount, folderCount: result.folderCount };
    },
  };
}

export function buildShareToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  return [
    { name: 'import_shareable', description: 'Import CursorToys shareable URL', inputSchema: { url: z.string() } },
    { name: 'import_from_gist', description: 'Import from GitHub Gist', inputSchema: { gistUrl: z.string() } },
    { name: 'export_project_bundle', description: 'Export workspace as CursorToys project bundle', inputSchema: {} },
    {
      name: 'generate_tree',
      description: 'Generate directory tree text',
      inputSchema: {
        path: z.string().optional(),
        maxDepth: z.number().optional(),
        maxFiles: z.number().optional(),
      },
    },
    { name: 'share_via_gist', description: 'Share file via GitHub Gist', inputSchema: { filePath: z.string() } },
    {
      name: 'share_folder_via_gist',
      description: 'Share folder via Gist bundle',
      inputSchema: {
        folderPath: z.string(),
        bundleType: z
          .enum(['command', 'rule', 'prompt', 'notepad', 'http', 'project', 'plan', 'skill'])
          .optional(),
      },
    },
    {
      name: 'configure_github_token',
      description: 'Set GitHub token for Gist (write-only)',
      inputSchema: { token: z.string() },
    },
    { name: 'remove_github_token', description: 'Remove stored GitHub token', inputSchema: {} },
    {
      name: 'chat_generate_tree_and_send',
      description: 'Generate workspace tree and send to chat',
      inputSchema: { prompt: z.string().optional() },
    },
  ];
}
