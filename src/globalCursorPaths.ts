import * as path from 'path';

/**
 * Resolves the global Cursor config root directory.
 * @param homePath User home directory
 * @param baseFolderName Configured base folder name (e.g. cursor)
 * @param globalCursorPathOverride Optional setting override (relative to home or absolute)
 */
export function resolveGlobalCursorRoot(
  homePath: string,
  baseFolderName: string,
  globalCursorPathOverride?: string
): string {
  const trimmed = globalCursorPathOverride?.trim();
  if (trimmed) {
    return path.isAbsolute(trimmed) ? trimmed : path.join(homePath, trimmed);
  }
  return path.join(homePath, `.${baseFolderName}`);
}

/**
 * Builds the personal agents directory path under the global Cursor root.
 */
export function buildPersonalAgentsPath(globalCursorRoot: string): string {
  return path.join(globalCursorRoot, 'agents');
}

/**
 * Builds the personal backups directory path under the global Cursor root.
 */
export function buildPersonalBackupsPath(globalCursorRoot: string): string {
  return path.join(globalCursorRoot, '.backups');
}
