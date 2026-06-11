import {
  ProjectEntry,
  ProjectRegistrySnapshot,
  createEmptyRegistrySnapshot,
} from './types';
import {
  defaultLabelFromPath,
  detectProjectPathKind,
  normalizeProjectPath,
  projectIdFromPath,
  projectPathsEqual,
} from './projectPathUtils';

export interface PinProjectInput {
  path: string;
  label?: string;
  category?: string;
  color?: ProjectEntry['color'];
  notes?: string;
}

export interface EditProjectInput {
  label?: string;
  category?: string;
  color?: ProjectEntry['color'];
  notes?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function findPinnedIndex(snapshot: ProjectRegistrySnapshot, pathValue: string): number {
  return snapshot.pinned.findIndex((entry) => projectPathsEqual(entry.path, pathValue));
}

function findRecentIndex(snapshot: ProjectRegistrySnapshot, pathValue: string): number {
  return snapshot.recent.findIndex((entry) => projectPathsEqual(entry.path, pathValue));
}

function removeFromRecent(snapshot: ProjectRegistrySnapshot, pathValue: string): void {
  const index = findRecentIndex(snapshot, pathValue);
  if (index >= 0) {
    snapshot.recent.splice(index, 1);
  }
}

/**
 * Pins or updates a project entry, merging duplicates by path.
 */
export function pinProjectInSnapshot(
  snapshot: ProjectRegistrySnapshot,
  input: PinProjectInput
): ProjectEntry {
  const normalizedPath = normalizeProjectPath(input.path);
  const pathKind = detectProjectPathKind(normalizedPath);
  const timestamp = nowIso();
  const existingIndex = findPinnedIndex(snapshot, normalizedPath);

  if (existingIndex >= 0) {
    const existing = snapshot.pinned[existingIndex];
    const updated: ProjectEntry = {
      ...existing,
      label: input.label?.trim() || existing.label,
      category: input.category !== undefined ? input.category.trim() || undefined : existing.category,
      color: input.color ?? existing.color,
      notes: input.notes !== undefined ? input.notes.trim() || undefined : existing.notes,
      lastOpenedAt: timestamp,
    };
    snapshot.pinned[existingIndex] = updated;
    removeFromRecent(snapshot, normalizedPath);
    return updated;
  }

  const entry: ProjectEntry = {
    id: projectIdFromPath(normalizedPath),
    path: normalizedPath,
    pathKind,
    label: input.label?.trim() || defaultLabelFromPath(normalizedPath),
    category: input.category?.trim() || undefined,
    color: input.color,
    notes: input.notes?.trim() || undefined,
    pinned: true,
    pinnedAt: timestamp,
    lastOpenedAt: timestamp,
  };
  snapshot.pinned.unshift(entry);
  removeFromRecent(snapshot, normalizedPath);
  return entry;
}

/**
 * Records a workspace open in recent list and updates pinned last-opened time.
 */
export function recordWorkspaceOpenInSnapshot(
  snapshot: ProjectRegistrySnapshot,
  pathValue: string,
  recentLimit: number
): ProjectEntry | undefined {
  const normalizedPath = normalizeProjectPath(pathValue);
  if (normalizedPath.length === 0) {
    return undefined;
  }

  const timestamp = nowIso();
  const pinnedIndex = findPinnedIndex(snapshot, normalizedPath);
  if (pinnedIndex >= 0) {
    const updated = { ...snapshot.pinned[pinnedIndex], lastOpenedAt: timestamp };
    snapshot.pinned[pinnedIndex] = updated;
    removeFromRecent(snapshot, normalizedPath);
    return updated;
  }

  const recentIndex = findRecentIndex(snapshot, normalizedPath);
  if (recentIndex >= 0) {
    const updated = { ...snapshot.recent[recentIndex], lastOpenedAt: timestamp };
    snapshot.recent.splice(recentIndex, 1);
    snapshot.recent.unshift(updated);
    capRecentList(snapshot, recentLimit);
    return updated;
  }

  const entry: ProjectEntry = {
    id: projectIdFromPath(normalizedPath),
    path: normalizedPath,
    pathKind: detectProjectPathKind(normalizedPath),
    label: defaultLabelFromPath(normalizedPath),
    pinned: false,
    lastOpenedAt: timestamp,
  };
  snapshot.recent.unshift(entry);
  capRecentList(snapshot, recentLimit);
  return entry;
}

/**
 * Caps the recent list to the configured limit.
 */
export function capRecentList(snapshot: ProjectRegistrySnapshot, recentLimit: number): void {
  const limit = Math.max(1, recentLimit);
  if (snapshot.recent.length > limit) {
    snapshot.recent.length = limit;
  }
}

/**
 * Unpins a project; keeps it in recent if it was opened before.
 */
export function unpinProjectInSnapshot(
  snapshot: ProjectRegistrySnapshot,
  projectId: string,
  recentLimit: number
): boolean {
  const index = snapshot.pinned.findIndex((entry) => entry.id === projectId);
  if (index < 0) {
    return false;
  }
  const [removed] = snapshot.pinned.splice(index, 1);
  const unpinned: ProjectEntry = { ...removed, pinned: false, pinnedAt: undefined };
  const recentIndex = findRecentIndex(snapshot, unpinned.path);
  if (recentIndex >= 0) {
    snapshot.recent[recentIndex] = { ...snapshot.recent[recentIndex], ...unpinned, pinned: false };
  } else {
    snapshot.recent.unshift(unpinned);
    capRecentList(snapshot, recentLimit);
  }
  return true;
}

/**
 * Updates metadata for a pinned or recent project.
 */
export function editProjectInSnapshot(
  snapshot: ProjectRegistrySnapshot,
  projectId: string,
  input: EditProjectInput
): ProjectEntry | undefined {
  const pinnedIndex = snapshot.pinned.findIndex((entry) => entry.id === projectId);
  if (pinnedIndex >= 0) {
    const updated = applyEdit(snapshot.pinned[pinnedIndex], input);
    snapshot.pinned[pinnedIndex] = updated;
    return updated;
  }
  const recentIndex = snapshot.recent.findIndex((entry) => entry.id === projectId);
  if (recentIndex >= 0) {
    const updated = applyEdit(snapshot.recent[recentIndex], input);
    snapshot.recent[recentIndex] = updated;
    return updated;
  }
  return undefined;
}

function applyEdit(entry: ProjectEntry, input: EditProjectInput): ProjectEntry {
  return {
    ...entry,
    label: input.label !== undefined ? input.label.trim() || entry.label : entry.label,
    category: input.category !== undefined ? input.category.trim() || undefined : entry.category,
    color: input.color !== undefined ? input.color : entry.color,
    notes: input.notes !== undefined ? input.notes.trim() || undefined : entry.notes,
  };
}

/**
 * Removes a project from pinned and recent lists.
 */
export function removeProjectFromSnapshot(snapshot: ProjectRegistrySnapshot, projectId: string): boolean {
  const pinnedBefore = snapshot.pinned.length;
  const recentBefore = snapshot.recent.length;
  snapshot.pinned = snapshot.pinned.filter((entry) => entry.id !== projectId);
  snapshot.recent = snapshot.recent.filter((entry) => entry.id !== projectId);
  return snapshot.pinned.length < pinnedBefore || snapshot.recent.length < recentBefore;
}

/**
 * Clears non-pinned recent history.
 */
export function clearRecentInSnapshot(snapshot: ProjectRegistrySnapshot): void {
  snapshot.recent = [];
}

/**
 * Finds a project by id in pinned or recent lists.
 */
export function findProjectById(
  snapshot: ProjectRegistrySnapshot,
  projectId: string
): ProjectEntry | undefined {
  return (
    snapshot.pinned.find((entry) => entry.id === projectId) ??
    snapshot.recent.find((entry) => entry.id === projectId)
  );
}

/**
 * Parses registry JSON with schema validation and recovery.
 */
export function parseRegistrySnapshot(raw: unknown): ProjectRegistrySnapshot {
  if (!raw || typeof raw !== 'object') {
    return createEmptyRegistrySnapshot();
  }
  const data = raw as Partial<ProjectRegistrySnapshot>;
  if (data.schemaVersion !== 1) {
    return createEmptyRegistrySnapshot();
  }
  return {
    schemaVersion: 1,
    pinned: Array.isArray(data.pinned) ? data.pinned.filter(isValidEntry) : [],
    recent: Array.isArray(data.recent) ? data.recent.filter(isValidEntry) : [],
  };
}

function isValidEntry(value: unknown): value is ProjectEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const entry = value as Partial<ProjectEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.path === 'string' &&
    (entry.pathKind === 'folder' || entry.pathKind === 'workspace-file') &&
    typeof entry.label === 'string' &&
    typeof entry.lastOpenedAt === 'string' &&
    typeof entry.pinned === 'boolean'
  );
}

/**
 * Returns pinned projects grouped by category name.
 */
export function groupPinnedByCategory(
  pinned: readonly ProjectEntry[]
): { category: string; entries: ProjectEntry[] }[] {
  const groups = new Map<string, ProjectEntry[]>();
  for (const entry of pinned) {
    const key = entry.category?.trim() || 'Uncategorized';
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, entries]) => ({
      category,
      entries: entries.sort((a, b) => a.label.localeCompare(b.label)),
    }));
}
