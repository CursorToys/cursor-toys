import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';
import { generateDeeplink } from '../../deeplinkGenerator';
import { generateShareable } from '../../shareableGenerator';
import {
  getCommandsPath,
  getPromptsPath,
  getRulesPath,
  getSkillsPath,
  isAllowedExtension,
  sanitizeFileName,
} from '../../utils';

export type ProjectAssetType = 'commands' | 'rules' | 'prompts' | 'skills';

const ASSET_PATH_GETTERS: Record<
  ProjectAssetType,
  (workspacePath?: string, isUser?: boolean) => string
> = {
  commands: getCommandsPath,
  rules: getRulesPath,
  prompts: getPromptsPath,
  skills: getSkillsPath,
};

const ASSET_FILE_TYPES: Record<ProjectAssetType, 'command' | 'rule' | 'prompt' | 'skill'> = {
  commands: 'command',
  rules: 'rule',
  prompts: 'prompt',
  skills: 'skill',
};

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getAssetRoot(type: ProjectAssetType, isPersonal?: boolean): string {
  return ASSET_PATH_GETTERS[type](getWorkspacePath(), Boolean(isPersonal));
}

async function listAssetFiles(type: ProjectAssetType, isPersonal?: boolean): Promise<string[]> {
  const root = getAssetRoot(type, isPersonal);
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const folderUri = vscode.Uri.file(root);
  try {
    await vscode.workspace.fs.stat(folderUri);
  } catch {
    return [];
  }
  const entries = await vscode.workspace.fs.readDirectory(folderUri);
  const files: string[] = [];
  for (const [name, fileType] of entries) {
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    const full = path.join(root, name);
    if (isAllowedExtension(full, allowedExtensions) || type === 'skills') {
      files.push(full);
    }
  }
  return files.sort();
}

async function resolveAssetPath(
  type: ProjectAssetType,
  filePath?: string,
  name?: string,
  isPersonal?: boolean
): Promise<string | null> {
  if (filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(getAssetRoot(type, isPersonal), filePath);
  }
  if (!name) {
    return null;
  }
  const files = await listAssetFiles(type, isPersonal);
  const q = name.toLowerCase();
  return (
    files.find((f) => path.basename(f, path.extname(f)).toLowerCase() === q) ??
    files.find((f) => path.basename(f).toLowerCase() === q) ??
    null
  );
}

export async function assetList(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const isPersonal = Boolean(args.isPersonal);
  const files = await listAssetFiles(type, isPersonal);
  return {
    type,
    root: getAssetRoot(type, isPersonal),
    files: files.map((f) => ({ filePath: f, name: path.basename(f) })),
  };
}

export async function assetRead(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const filePath = await resolveAssetPath(
    type,
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error(`${type} asset not found`);
  }
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return { filePath, content: Buffer.from(raw).toString('utf8') };
}

export async function assetCreate(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const name = String(args.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const isPersonal = Boolean(args.isPersonal);
  const root = getAssetRoot(type, isPersonal);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(root));
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const ext = type === 'rules' && allowedExtensions.includes('mdc') ? 'mdc' : allowedExtensions[0] || 'md';
  const sanitized = sanitizeFileName(name);
  const filePath = path.join(root, `${sanitized}.${ext}`);
  const content = String(args.content ?? `# ${name}\n\n`);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
  return assetRead(type, { filePath, isPersonal });
}

export async function assetUpdate(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const filePath = await resolveAssetPath(
    type,
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath || args.content === undefined) {
    throw new Error('asset not found or content missing');
  }
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(String(args.content), 'utf8')
  );
  return assetRead(type, { filePath });
}

export async function assetRename(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const newName = String(args.newName ?? '').trim();
  if (!newName) {
    throw new Error('newName is required');
  }
  const filePath = await resolveAssetPath(
    type,
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('asset not found');
  }
  const ext = path.extname(filePath) || '.md';
  const newPath = path.join(path.dirname(filePath), `${sanitizeFileName(newName)}${ext}`);
  await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(newPath), {
    overwrite: false,
  });
  return assetRead(type, { filePath: newPath });
}

export async function assetDelete(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const filePath = await resolveAssetPath(
    type,
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('asset not found');
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  return { deleted: true, filePath };
}

export async function assetGenerateDeeplink(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const filePath = await resolveAssetPath(
    type,
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('asset not found');
  }
  const deeplink = await generateDeeplink(filePath);
  return { deeplink };
}

export async function assetShare(
  type: ProjectAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const filePath = await resolveAssetPath(
    type,
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('asset not found');
  }
  const shareable = await generateShareable(filePath, ASSET_FILE_TYPES[type]);
  return { shareable };
}

export function buildAssetToolHandlers(): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {};
  const ops: Array<{
    suffix: string;
    fn: (type: ProjectAssetType, args: Record<string, unknown>) => Promise<unknown>;
  }> = [
    { suffix: 'list', fn: assetList },
    { suffix: 'read', fn: assetRead },
    { suffix: 'create', fn: assetCreate },
    { suffix: 'update', fn: assetUpdate },
    { suffix: 'rename', fn: assetRename },
    { suffix: 'delete', fn: assetDelete },
    { suffix: 'generate_deeplink', fn: assetGenerateDeeplink },
    { suffix: 'share', fn: assetShare },
  ];
  for (const type of Object.keys(ASSET_PATH_GETTERS) as ProjectAssetType[]) {
    for (const op of ops) {
      handlers[`${type}_${op.suffix}`] = (args) => op.fn(type, args);
    }
  }
  return handlers;
}

export function buildAssetToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const confirm = { confirm: z.boolean().optional() };
  const common = {
    filePath: z.string().optional(),
    name: z.string().optional(),
    isPersonal: z.boolean().optional(),
  };
  const defs: Array<{ name: string; description: string; inputSchema: Record<string, z.ZodTypeAny> }> = [];
  for (const type of Object.keys(ASSET_PATH_GETTERS) as ProjectAssetType[]) {
    defs.push(
      { name: `${type}_list`, description: `List project ${type}`, inputSchema: { isPersonal: z.boolean().optional() } },
      { name: `${type}_read`, description: `Read ${type} asset`, inputSchema: common },
      {
        name: `${type}_create`,
        description: `Create ${type} asset`,
        inputSchema: {
          name: z.string(),
          content: z.string().optional(),
          isPersonal: z.boolean().optional(),
        },
      },
      { name: `${type}_update`, description: `Update ${type} asset`, inputSchema: { ...common, content: z.string() } },
      { name: `${type}_rename`, description: `Rename ${type} asset`, inputSchema: { ...common, newName: z.string() } },
      { name: `${type}_delete`, description: `Delete ${type} asset`, inputSchema: { ...common, ...confirm } },
      { name: `${type}_generate_deeplink`, description: `Generate deeplink for ${type}`, inputSchema: common },
      { name: `${type}_share`, description: `Share ${type} as CursorToys link`, inputSchema: common }
    );
  }
  return defs;
}
