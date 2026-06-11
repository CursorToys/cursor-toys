import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';
import { generateDeeplink } from '../../deeplinkGenerator';
import { generateShareable } from '../../shareableGenerator';
import {
  getPersonalCommandsPaths,
  getPersonalHooksPath,
  getPersonalPlansPaths,
  getPersonalPromptsPaths,
  getPersonalSkillsPaths,
  isAllowedExtension,
  sanitizeFileName,
} from '../../utils';

export type PersonalAssetType = 'commands' | 'prompts' | 'skills' | 'plans' | 'hooks';

const PERSONAL_ROOTS: Record<PersonalAssetType, () => string[]> = {
  commands: getPersonalCommandsPaths,
  prompts: getPersonalPromptsPaths,
  skills: getPersonalSkillsPaths,
  plans: getPersonalPlansPaths,
  hooks: () => [path.dirname(getPersonalHooksPath())],
};

const PERSONAL_FILE_TYPES: Partial<
  Record<PersonalAssetType, 'command' | 'prompt' | 'skill' | 'plan' | 'hooks'>
> = {
  commands: 'command',
  prompts: 'prompt',
  skills: 'skill',
  plans: 'plan',
  hooks: 'hooks',
};

async function listPersonalFiles(type: PersonalAssetType): Promise<string[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const files: string[] = [];
  for (const root of PERSONAL_ROOTS[type]()) {
    if (type === 'hooks') {
      const hooksFile = path.join(root, 'hooks.json');
      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(hooksFile));
        files.push(hooksFile);
      } catch {
        // no hooks.json
      }
      continue;
    }
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(root));
    } catch {
      continue;
    }
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(root));
    for (const [name, fileType] of entries) {
      if (fileType !== vscode.FileType.File) {
        continue;
      }
      const full = path.join(root, name);
      if (type === 'skills' || isAllowedExtension(full, allowedExtensions)) {
        files.push(full);
      }
    }
  }
  return [...new Set(files)].sort();
}

async function resolvePersonalPath(
  type: PersonalAssetType,
  filePath?: string,
  name?: string
): Promise<string | null> {
  if (filePath) {
    return path.isAbsolute(filePath) ? filePath : null;
  }
  if (!name) {
    return null;
  }
  const files = await listPersonalFiles(type);
  const q = name.toLowerCase();
  return (
    files.find((f) => path.basename(f, path.extname(f)).toLowerCase() === q) ??
    files.find((f) => path.basename(f).toLowerCase() === q) ??
    null
  );
}

async function personalList(type: PersonalAssetType): Promise<unknown> {
  const files = await listPersonalFiles(type);
  return {
    type,
    roots: PERSONAL_ROOTS[type](),
    files: files.map((f) => ({ filePath: f, name: path.basename(f) })),
  };
}

async function personalRead(type: PersonalAssetType, args: Record<string, unknown>): Promise<unknown> {
  const filePath =
    (args.filePath as string | undefined) ??
    (await resolvePersonalPath(type, undefined, args.name as string | undefined));
  if (!filePath) {
    throw new Error('Personal asset not found');
  }
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return { filePath, content: Buffer.from(raw).toString('utf8') };
}

async function personalCreate(type: PersonalAssetType, args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const root = PERSONAL_ROOTS[type]()[0];
  if (!root) {
    throw new Error('No personal root configured');
  }
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(root));
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const ext = allowedExtensions[0] || 'md';
  const filePath = path.join(root, `${sanitizeFileName(name)}.${ext}`);
  const content = String(args.content ?? `# ${name}\n\n`);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
  return personalRead(type, { filePath });
}

async function personalUpdate(type: PersonalAssetType, args: Record<string, unknown>): Promise<unknown> {
  const filePath =
    (args.filePath as string | undefined) ??
    (await resolvePersonalPath(type, undefined, args.name as string | undefined));
  if (!filePath || args.content === undefined) {
    throw new Error('asset not found or content missing');
  }
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(String(args.content), 'utf8')
  );
  return personalRead(type, { filePath });
}

async function personalRename(type: PersonalAssetType, args: Record<string, unknown>): Promise<unknown> {
  const newName = String(args.newName ?? '').trim();
  if (!newName) {
    throw new Error('newName is required');
  }
  const filePath =
    (args.filePath as string | undefined) ??
    (await resolvePersonalPath(type, undefined, args.name as string | undefined));
  if (!filePath) {
    throw new Error('asset not found');
  }
  const ext = path.extname(filePath) || '.md';
  const newPath = path.join(path.dirname(filePath), `${sanitizeFileName(newName)}${ext}`);
  await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(newPath), {
    overwrite: false,
  });
  return personalRead(type, { filePath: newPath });
}

async function personalDelete(type: PersonalAssetType, args: Record<string, unknown>): Promise<unknown> {
  const filePath =
    (args.filePath as string | undefined) ??
    (await resolvePersonalPath(type, undefined, args.name as string | undefined));
  if (!filePath) {
    throw new Error('asset not found');
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  return { deleted: true, filePath };
}

async function personalShare(type: PersonalAssetType, args: Record<string, unknown>): Promise<unknown> {
  const filePath =
    (args.filePath as string | undefined) ??
    (await resolvePersonalPath(type, undefined, args.name as string | undefined));
  if (!filePath) {
    throw new Error('asset not found');
  }
  const forced = PERSONAL_FILE_TYPES[type];
  const shareable = forced ? await generateShareable(filePath, forced) : await generateShareable(filePath);
  return { shareable };
}

async function personalGenerateDeeplink(
  type: PersonalAssetType,
  args: Record<string, unknown>
): Promise<unknown> {
  const filePath =
    (args.filePath as string | undefined) ??
    (await resolvePersonalPath(type, undefined, args.name as string | undefined));
  if (!filePath) {
    throw new Error('asset not found');
  }
  const deeplink = await generateDeeplink(filePath);
  return { deeplink };
}

export async function personalSaveFromSelection(args: Record<string, unknown>): Promise<unknown> {
  const assetType = String(args.type ?? 'commands') as PersonalAssetType;
  const editor = vscode.window.activeTextEditor;
  const text =
    (args.text as string | undefined) ??
    (editor && !editor.selection.isEmpty ? editor.document.getText(editor.selection) : '');
  if (!text?.trim()) {
    throw new Error('No text provided and no editor selection');
  }
  const name = String(args.name ?? `saved-${Date.now()}`);
  return personalCreate(assetType, { name, content: text });
}

export function buildPersonalToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
    personal_save_from_selection: personalSaveFromSelection,
  };
  const ops: Array<{
    suffix: string;
    fn: (type: PersonalAssetType, args: Record<string, unknown>) => Promise<unknown>;
  }> = [
    { suffix: 'list', fn: (t) => personalList(t) },
    { suffix: 'read', fn: personalRead },
    { suffix: 'create', fn: personalCreate },
    { suffix: 'update', fn: personalUpdate },
    { suffix: 'rename', fn: personalRename },
    { suffix: 'delete', fn: personalDelete },
    { suffix: 'share', fn: personalShare },
    { suffix: 'generate_deeplink', fn: personalGenerateDeeplink },
  ];
  for (const type of Object.keys(PERSONAL_ROOTS) as PersonalAssetType[]) {
    for (const op of ops) {
      handlers[`personal_${type}_${op.suffix}`] = (args) => op.fn(type, args);
    }
  }
  return handlers;
}

export function buildPersonalToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  const confirm = { confirm: z.boolean().optional() };
  const common = { filePath: z.string().optional(), name: z.string().optional() };
  const defs: Array<{ name: string; description: string; inputSchema: Record<string, z.ZodTypeAny> }> = [
    {
      name: 'personal_save_from_selection',
      description: 'Save editor selection or text as personal command/prompt/skill',
      inputSchema: {
        type: z.enum(['commands', 'prompts', 'skills', 'plans', 'hooks']).optional(),
        name: z.string().optional(),
        text: z.string().optional(),
      },
    },
  ];
  for (const type of Object.keys(PERSONAL_ROOTS) as PersonalAssetType[]) {
    defs.push(
      { name: `personal_${type}_list`, description: `List personal ${type}`, inputSchema: {} },
      { name: `personal_${type}_read`, description: `Read personal ${type}`, inputSchema: common },
      {
        name: `personal_${type}_create`,
        description: `Create personal ${type}`,
        inputSchema: { name: z.string(), content: z.string().optional() },
      },
      {
        name: `personal_${type}_update`,
        description: `Update personal ${type}`,
        inputSchema: { ...common, content: z.string() },
      },
      {
        name: `personal_${type}_rename`,
        description: `Rename personal ${type}`,
        inputSchema: { ...common, newName: z.string() },
      },
      {
        name: `personal_${type}_delete`,
        description: `Delete personal ${type}`,
        inputSchema: { ...common, ...confirm },
      },
      {
        name: `personal_${type}_share`,
        description: `Share personal ${type}`,
        inputSchema: common,
      },
      {
        name: `personal_${type}_generate_deeplink`,
        description: `Generate deeplink for personal ${type}`,
        inputSchema: common,
      }
    );
  }
  return defs;
}
