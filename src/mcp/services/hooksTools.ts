import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';
import {
  createHooksFile,
  DOCUMENTED_HOOKS,
  parseHooksFile,
  validateHooksFile,
} from '../../hooksManager';
import { generateGistShareableForHooks, generateShareableForHooks } from '../../shareableGenerator';
import { getHooksPath } from '../../utils';

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveHooksPath(isPersonal?: boolean): string {
  const ws = getWorkspacePath();
  if (!ws && !isPersonal) {
    throw new Error('No workspace folder open');
  }
  return getHooksPath(ws ?? '', Boolean(isPersonal));
}

export async function hooksList(args: Record<string, unknown>): Promise<unknown> {
  const isPersonal = Boolean(args.isPersonal);
  const hooksPath = resolveHooksPath(isPersonal);
  const hooksDir = path.dirname(hooksPath);
  const scripts: string[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(hooksDir));
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name !== 'hooks.json') {
        scripts.push(path.join(hooksDir, name));
      }
    }
  } catch {
    // no dir
  }
  const config = await parseHooksFile(hooksPath);
  return {
    hooksPath,
    hooksDir,
    exists: Boolean(config),
    documentedHooks: DOCUMENTED_HOOKS,
    config,
    scripts: scripts.map((s) => ({ filePath: s, name: path.basename(s) })),
  };
}

export async function hooksRead(args: Record<string, unknown>): Promise<unknown> {
  const hooksPath = resolveHooksPath(Boolean(args.isPersonal));
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(hooksPath));
  return {
    hooksPath,
    content: Buffer.from(raw).toString('utf8'),
    config: await parseHooksFile(hooksPath),
  };
}

export async function hooksCreate(args: Record<string, unknown>): Promise<unknown> {
  const hooksPath = resolveHooksPath(Boolean(args.isPersonal));
  await createHooksFile(hooksPath);
  return hooksRead({ isPersonal: args.isPersonal });
}

export async function hooksValidate(args: Record<string, unknown>): Promise<unknown> {
  const hooksPath = resolveHooksPath(Boolean(args.isPersonal));
  const valid = await validateHooksFile(hooksPath);
  return { hooksPath, valid };
}

export async function hooksUpdate(args: Record<string, unknown>): Promise<unknown> {
  const hooksPath = resolveHooksPath(Boolean(args.isPersonal));
  const content = args.content;
  if (content === undefined) {
    throw new Error('content is required (JSON string or object)');
  }
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  JSON.parse(text);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(hooksPath), Buffer.from(text, 'utf8'));
  return hooksRead({ isPersonal: args.isPersonal });
}

export async function hooksDelete(args: Record<string, unknown>): Promise<unknown> {
  const hooksPath = resolveHooksPath(Boolean(args.isPersonal));
  await vscode.workspace.fs.delete(vscode.Uri.file(hooksPath));
  return { deleted: true, hooksPath };
}

export async function hooksShare(args: Record<string, unknown>): Promise<unknown> {
  const hooksPath = resolveHooksPath(Boolean(args.isPersonal));
  const shareable = await generateShareableForHooks(hooksPath);
  return { shareable };
}

export async function hooksShareGist(args: Record<string, unknown>): Promise<unknown> {
  const hooksPath = resolveHooksPath(Boolean(args.isPersonal));
  const gistUrl = await generateGistShareableForHooks(hooksPath);
  return { gistUrl };
}

async function resolveScriptPath(args: Record<string, unknown>): Promise<string> {
  const filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  const hooksDir = path.dirname(resolveHooksPath(Boolean(args.isPersonal)));
  return path.join(hooksDir, filePath);
}

export async function hookScriptRead(args: Record<string, unknown>): Promise<unknown> {
  const scriptPath = await resolveScriptPath(args);
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(scriptPath));
  return { filePath: scriptPath, content: Buffer.from(raw).toString('utf8') };
}

export async function hookScriptCreate(args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const hooksDir = path.dirname(resolveHooksPath(Boolean(args.isPersonal)));
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(hooksDir));
  const scriptPath = path.join(hooksDir, name);
  const content = String(args.content ?? '#!/bin/bash\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(scriptPath), Buffer.from(content, 'utf8'));
  return hookScriptRead({ filePath: scriptPath });
}

export async function hookScriptUpdate(args: Record<string, unknown>): Promise<unknown> {
  const scriptPath = await resolveScriptPath(args);
  if (args.content === undefined) {
    throw new Error('content is required');
  }
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(scriptPath),
    Buffer.from(String(args.content), 'utf8')
  );
  return hookScriptRead({ filePath: scriptPath });
}

export async function hookScriptDelete(args: Record<string, unknown>): Promise<unknown> {
  const scriptPath = await resolveScriptPath(args);
  await vscode.workspace.fs.delete(vscode.Uri.file(scriptPath));
  return { deleted: true, filePath: scriptPath };
}

export async function hookScriptShare(args: Record<string, unknown>): Promise<unknown> {
  const scriptPath = await resolveScriptPath(args);
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(scriptPath));
  return {
    filePath: scriptPath,
    content: Buffer.from(raw).toString('utf8'),
    note: 'Share hooks folder via hooks_share for full bundle',
  };
}

export function buildHooksToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    hooks_list: hooksList,
    hooks_read: hooksRead,
    hooks_create: hooksCreate,
    hooks_validate: hooksValidate,
    hooks_update: hooksUpdate,
    hooks_delete: hooksDelete,
    hooks_share: hooksShare,
    hooks_share_gist: hooksShareGist,
    hook_script_read: hookScriptRead,
    hook_script_create: hookScriptCreate,
    hook_script_update: hookScriptUpdate,
    hook_script_delete: hookScriptDelete,
    hook_script_share: hookScriptShare,
  };
}

export function buildHooksToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const confirm = { confirm: z.boolean().optional() };
  const personal = { isPersonal: z.boolean().optional() };
  const scriptPath = { filePath: z.string(), ...personal };
  return [
    { name: 'hooks_list', description: 'List hooks.json and scripts', inputSchema: personal },
    { name: 'hooks_read', description: 'Read hooks.json', inputSchema: personal },
    { name: 'hooks_create', description: 'Create default hooks.json', inputSchema: personal },
    { name: 'hooks_validate', description: 'Validate hooks.json schema', inputSchema: personal },
    {
      name: 'hooks_update',
      description: 'Update hooks.json content',
      inputSchema: { ...personal, content: z.union([z.string(), z.record(z.unknown())]) },
    },
    { name: 'hooks_delete', description: 'Delete hooks.json', inputSchema: { ...personal, ...confirm } },
    { name: 'hooks_share', description: 'Share hooks as CursorToys link', inputSchema: personal },
    { name: 'hooks_share_gist', description: 'Share hooks via GitHub Gist', inputSchema: personal },
    { name: 'hook_script_read', description: 'Read hook script file', inputSchema: scriptPath },
    {
      name: 'hook_script_create',
      description: 'Create hook script',
      inputSchema: { name: z.string(), content: z.string().optional(), ...personal },
    },
    {
      name: 'hook_script_update',
      description: 'Update hook script',
      inputSchema: { ...scriptPath, content: z.string() },
    },
    { name: 'hook_script_delete', description: 'Delete hook script', inputSchema: { ...scriptPath, ...confirm } },
    { name: 'hook_script_share', description: 'Read hook script for sharing', inputSchema: scriptPath },
  ];
}
