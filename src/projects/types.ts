export const PROJECT_REGISTRY_SCHEMA_VERSION = 1 as const;

export const PROJECT_COLOR_PRESETS = [
  'blue',
  'green',
  'orange',
  'purple',
  'red',
  'teal',
  'yellow',
  'gray',
] as const;

export type ProjectColor = (typeof PROJECT_COLOR_PRESETS)[number];

export type ProjectPathKind = 'folder' | 'workspace-file';

export interface ProjectEntry {
  id: string;
  path: string;
  pathKind: ProjectPathKind;
  label: string;
  category?: string;
  color?: ProjectColor;
  notes?: string;
  pinned: boolean;
  pinnedAt?: string;
  lastOpenedAt: string;
}

export interface ProjectRegistrySnapshot {
  schemaVersion: typeof PROJECT_REGISTRY_SCHEMA_VERSION;
  pinned: ProjectEntry[];
  recent: ProjectEntry[];
}

export function createEmptyRegistrySnapshot(): ProjectRegistrySnapshot {
  return {
    schemaVersion: PROJECT_REGISTRY_SCHEMA_VERSION,
    pinned: [],
    recent: [],
  };
}
