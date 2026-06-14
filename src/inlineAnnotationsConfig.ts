import * as vscode from 'vscode';
import {
  DEFAULT_INLINE_ANNOTATION_TAG_COLORS,
  DEFAULT_INLINE_ANNOTATION_TAGS,
} from './inlineAnnotationTags';

const ENABLED_CONTEXT_KEY = 'cursorToys.inlineAnnotationsEnabled';

export { DEFAULT_INLINE_ANNOTATION_TAGS, DEFAULT_INLINE_ANNOTATION_TAG_COLORS } from './inlineAnnotationTags';

export const DEFAULT_INLINE_ANNOTATION_EXTENSIONS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'cs',
  'cpp',
  'c',
  'h',
  'hpp',
  'rb',
  'php',
  'swift',
  'scala',
  'md',
  'mdc',
  'json',
  'yaml',
  'yml',
  'toml',
  'sql',
  'sh',
  'bash',
  'zsh',
  'vue',
  'svelte',
] as const;

export interface InlineAnnotationsSettings {
  enabled: boolean;
  highlightComments: boolean;
  tagColors: Record<string, string>;
  tags: string[];
  scanIncludePaths: string[];
  fileExtensions: string[];
  updateOnType: boolean;
  updateDebounceMs: number;
}

/**
 * Reads inline annotation settings from workspace configuration.
 */
export function getInlineAnnotationsSettings(): InlineAnnotationsSettings {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const rawTags = config.get<string[]>('inlineAnnotations.tags', [...DEFAULT_INLINE_ANNOTATION_TAGS]);
  const rawExtensions = config.get<string[]>(
    'inlineAnnotations.fileExtensions',
    [...DEFAULT_INLINE_ANNOTATION_EXTENSIONS]
  );
  const rawIncludePaths = config.get<string[]>('inlineAnnotations.scanIncludePaths', []);
  const rawColors = config.get<Record<string, string>>(
    'inlineAnnotations.tagColors',
    { ...DEFAULT_INLINE_ANNOTATION_TAG_COLORS }
  );

  return {
    enabled: config.get<boolean>('inlineAnnotations.enabled', true),
    highlightComments: config.get<boolean>('inlineAnnotations.highlightComments', true),
    tagColors: normalizeTagColors(rawColors),
    tags: normalizeStringList(rawTags, DEFAULT_INLINE_ANNOTATION_TAGS),
    scanIncludePaths: normalizeStringList(rawIncludePaths, []),
    fileExtensions: normalizeExtensionList(rawExtensions),
    updateOnType: config.get<boolean>('inlineAnnotations.updateOnType', true),
    updateDebounceMs: Math.max(200, config.get<number>('inlineAnnotations.updateDebounceMs', 500)),
  };
}

function normalizeTagColors(raw: Record<string, string>): Record<string, string> {
  const merged: Record<string, string> = { ...DEFAULT_INLINE_ANNOTATION_TAG_COLORS };
  if (!raw || typeof raw !== 'object') {
    return merged;
  }

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string' || !value.trim()) {
      continue;
    }
    merged[key.trim().toLowerCase()] = value.trim();
  }

  return merged;
}

function normalizeStringList(values: string[], fallback: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [...fallback];
  }

  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim().toLowerCase();
    if (trimmed && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeExtensionList(values: string[]): string[] {
  if (!Array.isArray(values) || values.length === 0) {
    return [...DEFAULT_INLINE_ANNOTATION_EXTENSIONS];
  }

  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim().replace(/^\./, '').toLowerCase();
    if (trimmed && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }

  return normalized.length > 0 ? normalized : [...DEFAULT_INLINE_ANNOTATION_EXTENSIONS];
}

/**
 * Returns whether inline annotations are enabled.
 */
export function isInlineAnnotationsEnabled(): boolean {
  return getInlineAnnotationsSettings().enabled;
}

/**
 * Returns the highlight color for a tag, falling back to a neutral tone.
 */
export function getInlineAnnotationTagColor(tag: string, tagColors: Record<string, string>): string {
  return tagColors[tag.toLowerCase()] ?? '#9E9E9E40';
}

/**
 * Syncs VS Code context keys used in menu and view `when` clauses.
 */
export function syncInlineAnnotationsContext(): void {
  void vscode.commands.executeCommand('setContext', ENABLED_CONTEXT_KEY, isInlineAnnotationsEnabled());
}

/**
 * Registers listeners that keep inline annotation context keys in sync with settings.
 */
export function registerInlineAnnotationsConfigListener(
  context: vscode.ExtensionContext,
  onSettingsChanged?: () => void
): void {
  syncInlineAnnotationsContext();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('cursorToys.inlineAnnotations')) {
        syncInlineAnnotationsContext();
        onSettingsChanged?.();
      }
    })
  );
}
