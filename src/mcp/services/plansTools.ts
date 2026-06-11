import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';
import { generateShareable, generateShareableForPlanFolder } from '../../shareableGenerator';
import { getPlansPath, isAllowedExtension, sanitizeFileName } from '../../utils';

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolvePlansPath(isPersonal?: boolean): string {
  return getPlansPath(getWorkspacePath(), Boolean(isPersonal));
}

async function listPlanFiles(isPersonal?: boolean): Promise<string[]> {
  const plansPath = resolvePlansPath(isPersonal);
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(plansPath));
  } catch {
    return [];
  }
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(plansPath));
  const files: string[] = [];
  for (const [name, type] of entries) {
    if (type === vscode.FileType.File && isAllowedExtension(path.join(plansPath, name), allowedExtensions)) {
      files.push(path.join(plansPath, name));
    }
  }
  return files.sort();
}

async function resolvePlanPath(
  filePath?: string,
  name?: string,
  isPersonal?: boolean
): Promise<string | null> {
  if (filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(resolvePlansPath(isPersonal), filePath);
  }
  if (!name) {
    return null;
  }
  const q = name.toLowerCase();
  return (
    (await listPlanFiles(isPersonal)).find(
      (f) => path.basename(f, path.extname(f)).toLowerCase() === q
    ) ?? null
  );
}

async function planList(args: Record<string, unknown>): Promise<unknown> {
  const isPersonal = Boolean(args.isPersonal);
  const files = await listPlanFiles(isPersonal);
  return {
    plansPath: resolvePlansPath(isPersonal),
    plans: files.map((f) => ({ filePath: f, name: path.basename(f, path.extname(f)) })),
  };
}

async function planRead(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolvePlanPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Plan not found');
  }
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return { filePath, content: Buffer.from(raw).toString('utf8') };
}

async function planCreate(args: Record<string, unknown>): Promise<unknown> {
  const title = String(args.title ?? args.name ?? '').trim();
  if (!title) {
    throw new Error('title is required');
  }
  const isPersonal = Boolean(args.isPersonal);
  const plansPath = resolvePlansPath(isPersonal);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(plansPath));
  const config = vscode.workspace.getConfiguration('cursorToys');
  const ext = config.get<string[]>('allowedExtensions', ['md'])[0] || 'md';
  const filePath = path.join(plansPath, `${sanitizeFileName(title)}.${ext}`);
  const body = String(args.content ?? args.body ?? `# ${title}\n\n`);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(body, 'utf8'));
  return planRead({ filePath, isPersonal });
}

async function planUpdate(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolvePlanPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath || args.content === undefined) {
    throw new Error('plan not found or content missing');
  }
  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(filePath),
    Buffer.from(String(args.content), 'utf8')
  );
  return planRead({ filePath });
}

async function planRename(args: Record<string, unknown>): Promise<unknown> {
  const newTitle = String(args.newTitle ?? '').trim();
  if (!newTitle) {
    throw new Error('newTitle is required');
  }
  const filePath = await resolvePlanPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('plan not found');
  }
  const ext = path.extname(filePath) || '.md';
  const newPath = path.join(path.dirname(filePath), `${sanitizeFileName(newTitle)}${ext}`);
  await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(newPath), {
    overwrite: false,
  });
  return planRead({ filePath: newPath });
}

async function planDelete(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolvePlanPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('plan not found');
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  return { deleted: true, filePath };
}

async function planShare(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolvePlanPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('plan not found');
  }
  const shareable = await generateShareable(filePath, 'plan');
  return { shareable };
}

async function planShareFolder(args: Record<string, unknown>): Promise<unknown> {
  const isPersonal = Boolean(args.isPersonal);
  const folderPath = resolvePlansPath(isPersonal);
  const shareable = await generateShareableForPlanFolder(folderPath);
  return { shareable };
}

export function buildPlansToolHandlers(): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    plan_list: planList,
    plan_read: planRead,
    plan_create: planCreate,
    plan_update: planUpdate,
    plan_rename: planRename,
    plan_delete: planDelete,
    plan_share: planShare,
    plan_share_folder: planShareFolder,
  };
}

export function buildPlansToolDefinitions(): Array<{
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
  return [
    { name: 'plan_list', description: 'List cursor plans', inputSchema: { isPersonal: z.boolean().optional() } },
    { name: 'plan_read', description: 'Read plan file', inputSchema: common },
    {
      name: 'plan_create',
      description: 'Create plan',
      inputSchema: { title: z.string(), content: z.string().optional(), isPersonal: z.boolean().optional() },
    },
    { name: 'plan_update', description: 'Update plan', inputSchema: { ...common, content: z.string() } },
    { name: 'plan_rename', description: 'Rename plan', inputSchema: { ...common, newTitle: z.string() } },
    { name: 'plan_delete', description: 'Delete plan', inputSchema: { ...common, ...confirm } },
    { name: 'plan_share', description: 'Share plan as CursorToys link', inputSchema: common },
    { name: 'plan_share_folder', description: 'Share plans folder', inputSchema: { isPersonal: z.boolean().optional() } },
  ];
}
