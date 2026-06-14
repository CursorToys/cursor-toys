import * as vscode from 'vscode';
import {
  DONE_COLUMN_DISPLAY_LIMIT,
  formatKanbanTagDisplayName,
  KanbanCardData,
  KanbanStatus,
  listKanbanCardPaths,
  loadKanbanCard,
} from './kanbanCard';
import { extensionDataScopeHasContent, getKanbanPath } from './utils';
import { KanbanBoardCardView, KanbanBoardScope, KanbanBoardState } from './kanbanBoardTypes';

export const DESCRIPTION_PREVIEW_MAX = 120;

function compareCards(a: KanbanCardData, b: KanbanCardData): number {
  const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return a.title.localeCompare(b.title);
}

function compareDoneCards(
  a: KanbanBoardCardView,
  b: KanbanBoardCardView
): number {
  const mtimeA = a.modifiedAt ?? 0;
  const mtimeB = b.modifiedAt ?? 0;
  if (mtimeA !== mtimeB) {
    return mtimeB - mtimeA;
  }
  return a.title.localeCompare(b.title);
}

function cardCanExpand(card: KanbanCardData): boolean {
  const description = card.description.trim();
  if (description.length > DESCRIPTION_PREVIEW_MAX) {
    return true;
  }
  if (description.split(/\r?\n/).length > 3) {
    return true;
  }
  if (card.title.trim().length > 52) {
    return true;
  }
  if (card.tags.length > 2) {
    return true;
  }
  return false;
}

function toView(card: KanbanCardData, modifiedAt?: number): KanbanBoardCardView {
  const description = card.description.trim();
  const preview =
    description.length > DESCRIPTION_PREVIEW_MAX
      ? `${description.slice(0, DESCRIPTION_PREVIEW_MAX).trim()}…`
      : description;
  return {
    filePath: card.filePath,
    fileName: card.filePath.split(/[/\\]/).pop() ?? card.title,
    title: card.title,
    status: card.status,
    order: card.order,
    descriptionPreview: preview,
    description: card.description,
    tags: card.tags.map((tag) => ({
      name: formatKanbanTagDisplayName(tag.name),
      color: tag.color,
    })),
    canExpand: cardCanExpand(card),
    modifiedAt,
  };
}

/**
 * Returns true when a Kanban scope has no folder or no card files yet.
 */
export async function isKanbanScopeEmpty(
  workspacePath: string | undefined,
  scope: KanbanBoardScope
): Promise<boolean> {
  const isPersonal = scope === 'personal';
  const kanbanPath = getKanbanPath(workspacePath, isPersonal);
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(kanbanPath));
  } catch {
    return true;
  }

  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const fileEntries = await listKanbanCardPaths(kanbanPath, allowedExtensions);
  return fileEntries.length === 0;
}

/**
 * Resolves which board scopes are available for the current workspace context.
 */
export function resolveKanbanBoardScopes(workspacePath: string | undefined): {
  availableScopes: KanbanBoardScope[];
  defaultScope: KanbanBoardScope;
} {
  const personalHasContent = extensionDataScopeHasContent('kanban', true);
  const availableScopes: KanbanBoardScope[] = [];

  if (workspacePath) {
    availableScopes.push('workspace');
  }
  if (personalHasContent) {
    availableScopes.push('personal');
  }

  if (availableScopes.length === 0 && workspacePath) {
    availableScopes.push('workspace');
  }
  if (availableScopes.length === 0 && personalHasContent) {
    availableScopes.push('personal');
  }

  const defaultScope: KanbanBoardScope =
    workspacePath && availableScopes.includes('workspace') ? 'workspace' : 'personal';

  return { availableScopes, defaultScope };
}

/**
 * Builds board state from a Kanban root (personal or workspace).
 */
export async function buildKanbanBoardState(
  workspacePath: string | undefined,
  scope: KanbanBoardScope
): Promise<KanbanBoardState | null> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const isPersonal = scope === 'personal';
  const kanbanPath = getKanbanPath(workspacePath, isPersonal);
  const { availableScopes } = resolveKanbanBoardScopes(workspacePath);

  const fileEntries = await listKanbanCardPaths(kanbanPath, allowedExtensions);
  const cards: Array<{ card: KanbanCardData; modifiedAt?: number }> = [];
  for (const entry of fileEntries) {
    const card = await loadKanbanCard(entry.filePath, kanbanPath);
    if (card) {
      cards.push({ card, modifiedAt: entry.mtime });
    }
  }

  cards.sort((a, b) => compareCards(a.card, b.card));

  const columns: Record<KanbanStatus, KanbanBoardCardView[]> = {
    backlog: [],
    todo: [],
    doing: [],
    done: [],
  };

  for (const { card, modifiedAt } of cards) {
    columns[card.status].push(toView(card, modifiedAt));
  }

  const columnTotals: Partial<Record<KanbanStatus, number>> = {
    backlog: columns.backlog.length,
    todo: columns.todo.length,
    doing: columns.doing.length,
    done: columns.done.length,
  };

  if (columns.done.length > DONE_COLUMN_DISPLAY_LIMIT) {
    columns.done.sort(compareDoneCards);
    columns.done = columns.done.slice(0, DONE_COLUMN_DISPLAY_LIMIT);
  }

  return { kanbanPath, scope, availableScopes, columns, columnTotals };
}
