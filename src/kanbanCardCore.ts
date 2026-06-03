import * as path from 'path';
import { parseFrontmatter, FrontmatterMetadata } from './frontmatterParser';
import { serializeKanbanCardFile } from './kanbanCardSerializer';

export type KanbanStatus = 'backlog' | 'todo' | 'doing' | 'done';

export const KANBAN_STATUSES: readonly KanbanStatus[] = [
  'backlog',
  'todo',
  'doing',
  'done',
] as const;

export const KANBAN_COLUMN_LABELS: Record<KanbanStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  doing: 'Doing',
  done: 'Done',
};

/** Maximum cards shown in the Done column on the board webview. */
export const DONE_COLUMN_DISPLAY_LIMIT = 10;

export const DEFAULT_KANBAN_TAG_COLOR = '#3794ff';

export const MAX_KANBAN_CARD_BYTES = 500_000;

export interface KanbanTag {
  name: string;
  color?: string;
}

export interface KanbanCardData {
  filePath: string;
  title: string;
  status: KanbanStatus;
  order?: number;
  description: string;
  tags: KanbanTag[];
  metadata: FrontmatterMetadata;
}

/** Maximum characters shown for a tag label on the Kanban board. */
export const MAX_KANBAN_TAG_DISPLAY_LENGTH = 80;

const TAG_COLOR_PATTERN = /^#[0-9a-fA-F]{3,8}$/;

/**
 * Removes surrounding YAML quotes from a scalar value.
 */
export function stripYamlQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Formats a tag name for display (text only, truncated).
 */
export function formatKanbanTagDisplayName(
  name: string,
  maxLength: number = MAX_KANBAN_TAG_DISPLAY_LENGTH
): string {
  const trimmed = stripYamlQuotes(name).trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trim()}…`;
}

/**
 * Builds plain text for copying or sending a Kanban card to chat.
 */
export function formatKanbanCardShareText(card: {
  title: string;
  description: string;
  tags: KanbanTag[];
  status?: KanbanStatus;
}): string {
  const lines: string[] = [`# ${card.title.trim()}`];
  if (card.status) {
    lines.push(`Status: ${KANBAN_COLUMN_LABELS[card.status]}`);
  }
  const description = card.description.trim();
  if (description) {
    lines.push('', description);
  }
  const tagNames = card.tags
    .map((tag) => formatKanbanTagDisplayName(tag.name))
    .filter((name) => name.length > 0);
  if (tagNames.length > 0) {
    lines.push('', `Tags: ${tagNames.join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * Normalizes a raw status value to a valid Kanban status.
 */
export function normalizeKanbanStatus(raw: unknown): KanbanStatus {
  if (raw === 'backlog' || raw === 'todo' || raw === 'doing' || raw === 'done') {
    return raw;
  }
  return 'todo';
}

/**
 * Returns the Kanban root folder when the card lives in a status subfolder or legacy flat layout.
 */
export function getKanbanRootFromCardPath(filePath: string): string {
  const parent = path.dirname(filePath);
  const parentName = path.basename(parent);
  if (KANBAN_STATUSES.includes(parentName as KanbanStatus)) {
    return path.dirname(parent);
  }
  return parent;
}

/**
 * Builds the path to a status subfolder under the Kanban root.
 */
export function getKanbanStatusPath(kanbanPath: string, status: KanbanStatus): string {
  return path.join(kanbanPath, status);
}

/**
 * Infers status from a card file path when it is stored under a status subfolder.
 */
export function inferKanbanStatusFromPath(kanbanPath: string, filePath: string): KanbanStatus | null {
  const parentDir = path.dirname(filePath);
  if (parentDir === kanbanPath) {
    return null;
  }
  const folderName = path.basename(parentDir);
  if (KANBAN_STATUSES.includes(folderName as KanbanStatus)) {
    return folderName as KanbanStatus;
  }
  return null;
}

/**
 * Parses a tag entry from frontmatter (supports `name` or `name:#hexcolor`).
 */
export function parseKanbanTagEntry(entry: unknown): KanbanTag | null {
  if (typeof entry !== 'string') {
    return null;
  }
  const trimmed = stripYamlQuotes(entry.trim());
  if (!trimmed) {
    return null;
  }
  const colonIndex = trimmed.lastIndexOf(':');
  if (colonIndex > 0) {
    const maybeColor = trimmed.slice(colonIndex + 1);
    if (TAG_COLOR_PATTERN.test(maybeColor)) {
      return { name: trimmed.slice(0, colonIndex).trim(), color: maybeColor };
    }
  }
  return { name: trimmed };
}

/**
 * Parses tags array from frontmatter metadata.
 */
export function parseKanbanTags(raw: unknown): KanbanTag[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const tags: KanbanTag[] = [];
  for (const entry of raw) {
    const tag = parseKanbanTagEntry(entry);
    if (tag && tag.name.length > 0) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Encodes a tag for YAML frontmatter storage.
 */
export function encodeKanbanTag(tag: KanbanTag): string {
  const name = tag.name.trim();
  if (tag.color && TAG_COLOR_PATTERN.test(tag.color)) {
    return `${name}:${tag.color}`;
  }
  return name;
}

/**
 * Parses Kanban card data from file content (pure, no I/O).
 */
export function parseKanbanCardFromContent(filePath: string, content: string): KanbanCardData {
  const parsed = parseFrontmatter(content);
  const metadata: FrontmatterMetadata = { ...parsed.metadata };
  const status = normalizeKanbanStatus(metadata.status);
  metadata.status = status;
  const tags = parseKanbanTags(metadata.tags);

  const baseName = path.basename(filePath, path.extname(filePath));
  const title =
    typeof metadata.title === 'string' && metadata.title.trim().length > 0
      ? metadata.title.trim()
      : baseName;

  const order = typeof metadata.order === 'number' ? metadata.order : undefined;

  return {
    filePath,
    title,
    status,
    order,
    description: parsed.content,
    tags,
    metadata,
  };
}

/**
 * Builds file content for a Kanban card.
 */
export function kanbanCardToFileContent(card: {
  title: string;
  status: KanbanStatus;
  order?: number;
  description: string;
  tags: KanbanTag[];
  metadata: FrontmatterMetadata;
}): string {
  const metadata: FrontmatterMetadata = { ...card.metadata };
  metadata.title = card.title;
  metadata.status = card.status;
  if (card.order !== undefined) {
    metadata.order = card.order;
  } else {
    delete metadata.order;
  }
  if (card.tags.length > 0) {
    metadata.tags = card.tags.map(encodeKanbanTag);
  } else {
    delete metadata.tags;
  }
  return serializeKanbanCardFile(metadata, card.description);
}
