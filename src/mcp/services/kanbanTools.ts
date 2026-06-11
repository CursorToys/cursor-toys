import * as path from 'path';
import * as vscode from 'vscode';
import {
  createKanbanCardFile,
  listKanbanCardPaths,
  loadKanbanCard,
  saveKanbanCard,
} from '../../kanbanCard';
import {
  KanbanStatus,
  KANBAN_STATUSES,
  formatKanbanCardShareText,
} from '../../kanbanCardCore';
import { getKanbanPath, sanitizeFileName } from '../../utils';

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function resolveKanbanPath(isPersonal?: boolean): string {
  return getKanbanPath(getWorkspacePath(), Boolean(isPersonal));
}

async function resolveCardPath(
  filePath?: string,
  title?: string,
  isPersonal?: boolean
): Promise<string | null> {
  if (filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(resolveKanbanPath(isPersonal), filePath);
  }
  if (!title) {
    return null;
  }
  const kanbanPath = resolveKanbanPath(isPersonal);
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const entries = await listKanbanCardPaths(kanbanPath, allowedExtensions);
  const q = title.toLowerCase();
  for (const entry of entries) {
    const card = await loadKanbanCard(entry.filePath, kanbanPath);
    if (card && card.title.toLowerCase() === q) {
      return entry.filePath;
    }
  }
  return null;
}

export async function kanbanList(args: Record<string, unknown>): Promise<unknown> {
  const status = args.status as KanbanStatus | 'all' | undefined;
  const isPersonal = Boolean(args.isPersonal);
  const kanbanPath = resolveKanbanPath(isPersonal);
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const entries = await listKanbanCardPaths(kanbanPath, allowedExtensions);
  const cards = [];
  for (const entry of entries) {
    const card = await loadKanbanCard(entry.filePath, kanbanPath);
    if (!card) {
      continue;
    }
    if (status && status !== 'all' && card.status !== status) {
      continue;
    }
    cards.push({
      filePath: card.filePath,
      title: card.title,
      status: card.status,
      tags: card.tags,
      order: card.order,
    });
  }
  return { cards, kanbanPath };
}

export async function kanbanRead(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveCardPath(
    args.filePath as string | undefined,
    args.title as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Card not found. Provide filePath or title.');
  }
  const card = await loadKanbanCard(filePath);
  if (!card) {
    throw new Error(`Could not read card: ${filePath}`);
  }
  return {
    filePath: card.filePath,
    title: card.title,
    status: card.status,
    tags: card.tags,
    order: card.order,
    description: card.description,
    body: card.description,
    metadata: card.metadata,
  };
}

export async function kanbanCreate(args: Record<string, unknown>): Promise<unknown> {
  const title = String(args.title ?? '').trim();
  if (!title) {
    throw new Error('title is required');
  }
  const status = (args.status as KanbanStatus) ?? 'todo';
  if (!KANBAN_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Use one of: ${KANBAN_STATUSES.join(', ')}`);
  }
  const description = String(args.description ?? '');
  const isPersonal = Boolean(args.isPersonal);
  const created = await createKanbanCardFile(getWorkspacePath(), title, status, description, isPersonal);
  if (!created) {
    throw new Error('Failed to create kanban card');
  }
  const card = await loadKanbanCard(created);
  if (card && args.tags && Array.isArray(args.tags)) {
    card.tags = args.tags as typeof card.tags;
    if (typeof args.order === 'number') {
      card.order = args.order;
    }
    await saveKanbanCard(card);
  }
  return kanbanRead({ filePath: created, isPersonal });
}

export async function kanbanUpdate(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveCardPath(
    args.filePath as string | undefined,
    args.title as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Card not found');
  }
  const card = await loadKanbanCard(filePath);
  if (!card) {
    throw new Error('Card not found');
  }
  if (args.title !== undefined) {
    card.title = String(args.title).trim();
    card.metadata.title = card.title;
  }
  if (args.description !== undefined) {
    card.description = String(args.description);
  }
  if (args.tags !== undefined) {
    card.tags = args.tags as typeof card.tags;
  }
  if (typeof args.order === 'number') {
    card.order = args.order;
  }
  await saveKanbanCard(card);
  return kanbanRead({ filePath: card.filePath });
}

export async function kanbanMove(args: Record<string, unknown>): Promise<unknown> {
  const status = args.status as KanbanStatus;
  if (!status || !KANBAN_STATUSES.includes(status)) {
    throw new Error(`status is required (${KANBAN_STATUSES.join(', ')})`);
  }
  const filePath = await resolveCardPath(
    args.filePath as string | undefined,
    args.title as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Card not found');
  }
  const card = await loadKanbanCard(filePath);
  if (!card) {
    throw new Error('Card not found');
  }
  card.status = status;
  card.metadata.status = status;
  await saveKanbanCard(card);
  return kanbanRead({ filePath: card.filePath });
}

export async function kanbanRename(args: Record<string, unknown>): Promise<unknown> {
  const newTitle = String(args.newTitle ?? '').trim();
  if (!newTitle) {
    throw new Error('newTitle is required');
  }
  const filePath = await resolveCardPath(
    args.filePath as string | undefined,
    args.title as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Card not found');
  }
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const ext = path.extname(filePath) || `.${allowedExtensions[0] || 'md'}`;
  const sanitized = sanitizeFileName(newTitle);
  const dir = path.dirname(filePath);
  const newPath = path.join(dir, `${sanitized}${ext}`);
  if (newPath !== filePath) {
    await vscode.workspace.fs.rename(vscode.Uri.file(filePath), vscode.Uri.file(newPath), {
      overwrite: false,
    });
  }
  const card = await loadKanbanCard(newPath);
  if (card) {
    card.title = newTitle;
    card.metadata.title = newTitle;
    await saveKanbanCard(card);
  }
  return kanbanRead({ filePath: newPath });
}

export async function kanbanDelete(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveCardPath(
    args.filePath as string | undefined,
    args.title as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Card not found');
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  return { deleted: true, filePath };
}

export async function kanbanSearch(args: Record<string, unknown>): Promise<unknown> {
  const query = String(args.query ?? '').trim().toLowerCase();
  if (!query) {
    throw new Error('query is required');
  }
  const listed = (await kanbanList({ isPersonal: args.isPersonal })) as { cards: Array<{ filePath: string }> };
  const matches = [];
  for (const item of listed.cards) {
    const card = await loadKanbanCard(item.filePath);
    if (!card) {
      continue;
    }
    const haystack = [
      card.title,
      card.description,
      ...card.tags.map((t) => t.name),
    ]
      .join(' ')
      .toLowerCase();
    if (haystack.includes(query)) {
      matches.push({
        filePath: card.filePath,
        title: card.title,
        status: card.status,
      });
    }
  }
  return { matches };
}

export async function kanbanShare(args: Record<string, unknown>): Promise<unknown> {
  const filePath = await resolveCardPath(
    args.filePath as string | undefined,
    args.title as string | undefined,
    Boolean(args.isPersonal)
  );
  if (!filePath) {
    throw new Error('Card not found');
  }
  const card = await loadKanbanCard(filePath);
  if (!card) {
    throw new Error('Card not found');
  }
  return {
    shareText: formatKanbanCardShareText(card),
    filePath: card.filePath,
    title: card.title,
  };
}
