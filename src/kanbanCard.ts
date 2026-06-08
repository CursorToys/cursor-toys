import * as path from 'path';
import * as vscode from 'vscode';
import {
  KanbanCardData,
  KanbanStatus,
  KANBAN_STATUSES,
  MAX_KANBAN_CARD_BYTES,
  getKanbanRootFromCardPath,
  getKanbanStatusPath,
  inferKanbanStatusFromPath,
  kanbanCardToFileContent,
  parseKanbanCardFromContent,
} from './kanbanCardCore';
import { getKanbanPath, isAllowedExtension, sanitizeFileName } from './utils';

export type { KanbanCardData, KanbanStatus, KanbanTag } from './kanbanCardCore';
export {
  KANBAN_STATUSES,
  KANBAN_COLUMN_LABELS,
  DEFAULT_KANBAN_TAG_COLOR,
  MAX_KANBAN_CARD_BYTES,
  DONE_COLUMN_DISPLAY_LIMIT,
  normalizeKanbanStatus,
  parseKanbanTags,
  encodeKanbanTag,
  parseKanbanCardFromContent,
  kanbanCardToFileContent,
  getKanbanRootFromCardPath,
  getKanbanStatusPath,
  inferKanbanStatusFromPath,
  stripYamlQuotes,
  formatKanbanTagDisplayName,
  formatKanbanCardShareText,
  MAX_KANBAN_TAG_DISPLAY_LENGTH,
} from './kanbanCardCore';

export interface KanbanCardPathEntry {
  filePath: string;
  mtime?: number;
}

/**
 * Ensures the Kanban directory exists.
 */
export async function ensureKanbanDirectory(kanbanPath: string): Promise<void> {
  const folderUri = vscode.Uri.file(kanbanPath);
  try {
    await vscode.workspace.fs.stat(folderUri);
  } catch {
    await vscode.workspace.fs.createDirectory(folderUri);
  }
}

/**
 * Ensures all status subfolders exist under the Kanban root.
 */
export async function ensureKanbanStatusDirectories(kanbanPath: string): Promise<void> {
  await ensureKanbanDirectory(kanbanPath);
  for (const status of KANBAN_STATUSES) {
    const statusPath = getKanbanStatusPath(kanbanPath, status);
    const statusUri = vscode.Uri.file(statusPath);
    try {
      await vscode.workspace.fs.stat(statusUri);
    } catch {
      await vscode.workspace.fs.createDirectory(statusUri);
    }
  }
}

/**
 * Resolves a unique file path inside a directory.
 */
async function resolveUniqueFilePath(directory: string, fileName: string): Promise<string> {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = path.join(directory, fileName);
  let counter = 1;
  while (true) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(candidate));
      candidate = path.join(directory, `${base}-${counter}${ext}`);
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

/**
 * Moves a card file into the folder that matches its status.
 */
async function moveKanbanCardToStatusFolder(
  card: KanbanCardData,
  kanbanPath: string
): Promise<string> {
  const targetDir = getKanbanStatusPath(kanbanPath, card.status);
  await ensureKanbanStatusDirectories(kanbanPath);

  const currentDir = path.dirname(card.filePath);
  if (currentDir === targetDir) {
    return card.filePath;
  }

  const targetPath = await resolveUniqueFilePath(targetDir, path.basename(card.filePath));
  if (targetPath === card.filePath) {
    return card.filePath;
  }

  await vscode.workspace.fs.rename(
    vscode.Uri.file(card.filePath),
    vscode.Uri.file(targetPath),
    { overwrite: false }
  );
  card.filePath = targetPath;
  return targetPath;
}

/**
 * Applies folder-based status when a card lives under a status subfolder.
 */
export function applyKanbanStatusFromPath(card: KanbanCardData, kanbanPath: string): void {
  const folderStatus = inferKanbanStatusFromPath(kanbanPath, card.filePath);
  if (folderStatus) {
    card.status = folderStatus;
    card.metadata.status = folderStatus;
  }
}

/**
 * Reads a Kanban card from disk.
 */
export async function loadKanbanCard(
  filePath: string,
  kanbanPath?: string
): Promise<KanbanCardData | null> {
  try {
    const uri = vscode.Uri.file(filePath);
    const raw = await vscode.workspace.fs.readFile(uri);
    if (raw.byteLength > MAX_KANBAN_CARD_BYTES) {
      vscode.window.showWarningMessage(`Kanban card is too large to load: ${path.basename(filePath)}`);
      return null;
    }
    const content = Buffer.from(raw).toString('utf8');
    const card = parseKanbanCardFromContent(filePath, content);
    const root = kanbanPath ?? getKanbanRootFromCardPath(filePath);
    applyKanbanStatusFromPath(card, root);
    return card;
  } catch {
    return null;
  }
}

/**
 * Writes a Kanban card to disk, moving it into the matching status folder when needed.
 */
export async function saveKanbanCard(card: KanbanCardData, kanbanPath?: string): Promise<void> {
  const root = kanbanPath ?? getKanbanRootFromCardPath(card.filePath);
  await moveKanbanCardToStatusFolder(card, root);
  const content = kanbanCardToFileContent(card);
  const uri = vscode.Uri.file(card.filePath);
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

/**
 * Creates a new Kanban card file and returns its absolute path.
 */
export async function createKanbanCardFile(
  workspacePath: string | undefined,
  title: string,
  status: KanbanStatus = 'todo',
  description: string = '',
  isPersonal: boolean = false
): Promise<string | null> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const defaultExtension = allowedExtensions[0] || 'md';

  const sanitized = sanitizeFileName(title);
  if (sanitized.length === 0) {
    return null;
  }

  const kanbanPath = getKanbanPath(workspacePath, isPersonal);
  await ensureKanbanStatusDirectories(kanbanPath);

  const statusPath = getKanbanStatusPath(kanbanPath, status);
  const fileName = `${sanitized}.${defaultExtension}`;
  const fullPath = await resolveUniqueFilePath(statusPath, fileName);

  const card: KanbanCardData = {
    filePath: fullPath,
    title: title.trim(),
    status,
    description: description.trim(),
    tags: [],
    metadata: { title: title.trim(), status },
  };

  await saveKanbanCard(card, kanbanPath);
  return fullPath;
}

async function listKanbanFilesInDirectory(
  directory: string,
  allowedExtensions: string[]
): Promise<KanbanCardPathEntry[]> {
  const folderUri = vscode.Uri.file(directory);
  try {
    await vscode.workspace.fs.stat(folderUri);
  } catch {
    return [];
  }

  const entries = await vscode.workspace.fs.readDirectory(folderUri);
  const paths: KanbanCardPathEntry[] = [];
  for (const [name, fileType] of entries) {
    if (fileType !== vscode.FileType.File) {
      continue;
    }
    const fullPath = path.join(directory, name);
    if (!isAllowedExtension(fullPath, allowedExtensions)) {
      continue;
    }
    let mtime: number | undefined;
    try {
      const stat = await vscode.workspace.fs.stat(vscode.Uri.file(fullPath));
      mtime = stat.mtime;
    } catch {
      mtime = undefined;
    }
    paths.push({ filePath: fullPath, mtime });
  }
  return paths;
}

/**
 * Moves legacy flat Kanban card files into status subfolders.
 */
export async function migrateLegacyKanbanCards(
  kanbanPath: string,
  allowedExtensions: string[]
): Promise<void> {
  const legacyEntries = await listKanbanFilesInDirectory(kanbanPath, allowedExtensions);
  if (legacyEntries.length === 0) {
    return;
  }

  await ensureKanbanStatusDirectories(kanbanPath);
  for (const entry of legacyEntries) {
    const card = await loadKanbanCard(entry.filePath, kanbanPath);
    if (!card) {
      continue;
    }
    await saveKanbanCard(card, kanbanPath);
  }
}

/**
 * Lists Kanban card file paths under status subfolders and legacy flat files.
 */
export async function listKanbanCardPaths(
  kanbanPath: string,
  allowedExtensions: string[]
): Promise<KanbanCardPathEntry[]> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(kanbanPath));
  } catch {
    return [];
  }

  await migrateLegacyKanbanCards(kanbanPath, allowedExtensions);

  const paths: KanbanCardPathEntry[] = [];
  for (const status of KANBAN_STATUSES) {
    const statusPath = getKanbanStatusPath(kanbanPath, status);
    paths.push(...(await listKanbanFilesInDirectory(statusPath, allowedExtensions)));
  }

  return paths;
}
