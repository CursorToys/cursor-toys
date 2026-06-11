import * as path from 'path';
import { ProjectPathKind } from './types';

/**
 * Detects whether a path refers to a multi-root workspace file or a folder.
 */
export function detectProjectPathKind(filePath: string): ProjectPathKind {
  const base = path.basename(filePath).toLowerCase();
  if (base.endsWith('.code-workspace')) {
    return 'workspace-file';
  }
  return 'folder';
}

/**
 * Normalizes a project path for stable comparison and storage.
 */
export function normalizeProjectPath(filePath: string): string {
  const trimmed = filePath.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  if (
    trimmed.startsWith('file://') ||
    trimmed.startsWith('vscode-remote://') ||
    trimmed.startsWith('vscode-local://')
  ) {
    return trimmed;
  }
  return path.normalize(trimmed);
}

/**
 * Builds a default display label from a stored project path.
 */
export function defaultLabelFromPath(filePath: string): string {
  if (
    filePath.startsWith('file://') ||
    filePath.startsWith('vscode-remote://') ||
    filePath.startsWith('vscode-local://')
  ) {
    try {
      const segments = filePath.split('/').filter(Boolean);
      return decodeURIComponent(segments[segments.length - 1] ?? 'Project');
    } catch {
      return 'Project';
    }
  }
  const base = path.basename(filePath);
  if (base.toLowerCase().endsWith('.code-workspace')) {
    return base.slice(0, -'.code-workspace'.length);
  }
  return base || filePath;
}

/**
 * Returns true when two stored paths refer to the same project location.
 */
export function projectPathsEqual(a: string, b: string): boolean {
  const na = normalizeProjectPath(a);
  const nb = normalizeProjectPath(b);
  if (na === nb) {
    return true;
  }
  if (
    !na.startsWith('file://') &&
    !na.startsWith('vscode-remote://') &&
    !nb.startsWith('file://') &&
    !nb.startsWith('vscode-remote://')
  ) {
    return path.resolve(na).toLowerCase() === path.resolve(nb).toLowerCase();
  }
  return false;
}

/**
 * Creates a stable registry id from a normalized path.
 */
export function projectIdFromPath(filePath: string): string {
  const normalized = normalizeProjectPath(filePath);
  return Buffer.from(normalized.toLowerCase()).toString('base64url').slice(0, 32);
}
