import * as path from 'path';
import * as vscode from 'vscode';
import { generateDeeplink } from './deeplinkGenerator';
import { generateShareable } from './shareableGenerator';
import { backupBeforeWrite } from './backupManager';
import { getPersonalAgentsPath, sanitizeFileName, isAllowedExtension } from './utils';
import { refreshUserAgentsTree } from './userAgentsTreeProvider';

/**
 * Lists personal agent (.md) files under ~/.cursor/agents/.
 */
export async function listAgentFiles(): Promise<string[]> {
  const root = getPersonalAgentsPath();
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(root));
  } catch {
    return [];
  }
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(root));
  const files: string[] = [];
  for (const [name, fileType] of entries) {
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    const full = path.join(root, name);
    if (isAllowedExtension(full, allowedExtensions) || name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files.sort();
}

async function resolveAgentPath(filePath?: string, name?: string): Promise<string | null> {
  if (filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(getPersonalAgentsPath(), filePath);
  }
  if (!name) {
    return null;
  }
  const files = await listAgentFiles();
  const q = name.toLowerCase();
  return (
    files.find((f) => path.basename(f, path.extname(f)).toLowerCase() === q) ??
    files.find((f) => path.basename(f).toLowerCase() === q) ??
    null
  );
}

const AGENT_TEMPLATE = (name: string) => `---
description: ""
---
# ${name}
`;

export async function readAgent(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveAgentPath(
    args.filePath as string | undefined,
    args.name as string | undefined
  );
  if (!filePath) {
    throw new Error('Agent not found');
  }
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return { filePath, content: Buffer.from(raw).toString('utf8') };
}

export async function listAgents(): Promise<unknown> {
  const root = getPersonalAgentsPath();
  const files = await listAgentFiles();
  return {
    root,
    agents: files.map((f) => ({ filePath: f, name: path.basename(f) })),
  };
}

export async function createAgent(args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const root = getPersonalAgentsPath();
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(root));
  const sanitized = sanitizeFileName(name);
  const filePath = path.join(root, `${sanitized}.md`);
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    await backupBeforeWrite(filePath, 'agents');
  } catch {
    // new file
  }
  const content = String(args.content ?? AGENT_TEMPLATE(name));
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
  refreshUserAgentsTree();
  return readAgent({ filePath });
}

export async function updateAgent(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveAgentPath(
    args.filePath as string | undefined,
    args.name as string | undefined
  );
  if (!filePath || args.content === undefined) {
    throw new Error('Agent not found or content missing');
  }
  await backupBeforeWrite(filePath, 'agents');
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(String(args.content), 'utf8')
  );
  refreshUserAgentsTree();
  return readAgent({ filePath });
}

export async function renameAgent(args: Record<string, unknown>): Promise<unknown> {
  const newName = String(args.newName ?? '').trim();
  if (!newName) {
    throw new Error('newName is required');
  }
  const filePath = await resolveAgentPath(
    args.filePath as string | undefined,
    args.name as string | undefined
  );
  if (!filePath) {
    throw new Error('Agent not found');
  }
  const ext = path.extname(filePath) || '.md';
  const newPath = path.join(path.dirname(filePath), `${sanitizeFileName(newName)}${ext}`);
  await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(newPath), {
    overwrite: false,
  });
  refreshUserAgentsTree();
  return readAgent({ filePath: newPath });
}

export async function deleteAgent(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveAgentPath(
    args.filePath as string | undefined,
    args.name as string | undefined
  );
  if (!filePath) {
    throw new Error('Agent not found');
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  refreshUserAgentsTree();
  return { deleted: true, filePath };
}

export async function shareAgent(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveAgentPath(
    args.filePath as string | undefined,
    args.name as string | undefined
  );
  if (!filePath) {
    throw new Error('Agent not found');
  }
  const shareable = await generateShareable(filePath, 'command');
  return { shareable };
}

export async function generateAgentDeeplink(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveAgentPath(
    args.filePath as string | undefined,
    args.name as string | undefined
  );
  if (!filePath) {
    throw new Error('Agent not found');
  }
  const deeplink = await generateDeeplink(filePath);
  return { deeplink };
}
