import * as path from 'path';
import * as vscode from 'vscode';
import { generateShareable } from '../../shareableGenerator';
import { getNotepadsPath, isAllowedExtension, sanitizeFileName } from '../../utils';

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveNotepadsPath(isPersonal?: boolean): string {
  return getNotepadsPath(getWorkspacePath(), Boolean(isPersonal));
}

async function listNotepadFiles(isPersonal?: boolean): Promise<string[]> {
  const notepadsPath = resolveNotepadsPath(isPersonal);
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const folderUri = vscode.Uri.file(notepadsPath);
  try {
    await vscode.workspace.fs.stat(folderUri);
  } catch {
    return [];
  }
  const entries = await vscode.workspace.fs.readDirectory(folderUri);
  const files: string[] = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.File) {
      continue;
    }
    const fullPath = path.join(notepadsPath, name);
    if (isAllowedExtension(fullPath, allowedExtensions)) {
      files.push(fullPath);
    }
  }
  return files.sort();
}

async function resolveNotepadPath(
  filePath?: string,
  name?: string,
  isPersonal?: boolean
): Promise<string | null> {
  if (filePath) {
    return path.isAbsolute(filePath)
      ? filePath
      : path.join(resolveNotepadsPath(isPersonal), filePath);
  }
  if (!name) {
    return null;
  }
  const files = await listNotepadFiles(isPersonal);
  const q = name.toLowerCase();
  return files.find((f) => path.basename(f, path.extname(f)).toLowerCase() === q) ?? null;
}

export async function notepadList(args: Record<string, unknown>): Promise<unknown> {
  const isPersonal = Boolean(args.isPersonal);
  const files = await listNotepadFiles(isPersonal);
  return {
    notepads: files.map((f) => ({
      filePath: f,
      name: path.basename(f, path.extname(f)),
    })),
    notepadsPath: resolveNotepadsPath(isPersonal),
  };
}

export async function notepadRead(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveNotepadPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Notepad not found');
  }
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  const content = Buffer.from(raw).toString('utf8');
  return {
    filePath,
    name: path.basename(filePath, path.extname(filePath)),
    content,
  };
}

export async function notepadCreate(args: Record<string, unknown>): Promise<unknown> {
  const title = String(args.title ?? '').trim();
  if (!title) {
    throw new Error('title is required');
  }
  const isPersonal = Boolean(args.isPersonal);
  const notepadsPath = resolveNotepadsPath(isPersonal);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(notepadsPath));
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const ext = allowedExtensions[0] || 'md';
  const sanitized = sanitizeFileName(title);
  const filePath = path.join(notepadsPath, `${sanitized}.${ext}`);
  const body = String(args.body ?? args.content ?? `# ${title}\n\n`);
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(body, 'utf8'));
  return notepadRead({ filePath, isPersonal });
}

export async function notepadUpdate(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveNotepadPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Notepad not found');
  }
  const content = args.content ?? args.body;
  if (content === undefined) {
    throw new Error('content is required');
  }
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(String(content), 'utf8'));
  return notepadRead({ filePath });
}

export async function notepadRename(args: Record<string, unknown>): Promise<unknown> {
  const newTitle = String(args.newTitle ?? '').trim();
  if (!newTitle) {
    throw new Error('newTitle is required');
  }
  const filePath = await resolveNotepadPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Notepad not found');
  }
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const ext = path.extname(filePath) || `.${allowedExtensions[0] || 'md'}`;
  const newPath = path.join(path.dirname(filePath), `${sanitizeFileName(newTitle)}${ext}`);
  if (newPath !== filePath) {
    await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(newPath), {
      overwrite: false,
    });
  }
  return notepadRead({ filePath: newPath });
}

export async function notepadDelete(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveNotepadPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Notepad not found');
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  return { deleted: true, filePath };
}

export async function notepadShare(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveNotepadPath(
    args.filePath as string | undefined,
    args.name as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Notepad not found');
  }
  const shareable = await generateShareable(filePath, 'notepad');
  return { shareable };
}
