import * as path from 'path';

export type ExtensionDataSubfolder = 'kanban' | 'notepads';

/**
 * Normalizes the extension data folder name (e.g. cursortoys).
 */
export function normalizeExtensionDataFolderName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : 'cursortoys';
}

/**
 * Builds `{root}/.{extensionDataFolder}/{subfolder}`.
 */
export function buildExtensionDataSubfolderPath(
  rootDir: string,
  extensionDataFolder: string,
  subfolder: ExtensionDataSubfolder
): string {
  return path.join(
    rootDir,
    `.${normalizeExtensionDataFolderName(extensionDataFolder)}`,
    subfolder
  );
}

/**
 * Builds legacy `{root}/.{baseFolder}/{subfolder}` (Cursor AI base folder).
 */
export function buildLegacySubfolderPath(
  rootDir: string,
  baseFolderName: string,
  subfolder: ExtensionDataSubfolder
): string {
  return path.join(rootDir, `.${baseFolderName.toLowerCase()}`, subfolder);
}

export interface ResolveExtensionDataRootOptions {
  homePath: string;
  workspacePath?: string;
  isPersonal: boolean;
  subfolder: ExtensionDataSubfolder;
  extensionDataFolder: string;
  baseFolderName: string;
  pathHasContent: (dirPath: string) => boolean;
}

/**
 * Resolves the active read/write root for Kanban or Notepads.
 * Prefers `.cursortoys/` when it has content; otherwise falls back to legacy `.{baseFolder}/`.
 * When both are empty, returns the canonical extension data path for new files.
 */
export function resolveExtensionDataSubfolderRoot(
  options: ResolveExtensionDataRootOptions
): string {
  const rootDir = options.isPersonal
    ? options.homePath
    : (options.workspacePath ?? options.homePath);

  const canonicalPath = buildExtensionDataSubfolderPath(
    rootDir,
    options.extensionDataFolder,
    options.subfolder
  );
  const legacyPath = buildLegacySubfolderPath(
    rootDir,
    options.baseFolderName,
    options.subfolder
  );
  const legacyCursorPath = buildLegacySubfolderPath(rootDir, 'cursor', options.subfolder);

  if (options.pathHasContent(canonicalPath)) {
    return canonicalPath;
  }
  if (options.pathHasContent(legacyPath)) {
    return legacyPath;
  }
  if (
    options.baseFolderName.toLowerCase() !== 'cursor' &&
    options.pathHasContent(legacyCursorPath)
  ) {
    return legacyCursorPath;
  }

  return canonicalPath;
}

/**
 * Returns true when the path is under extension data or legacy notepad/kanban folders.
 */
export function isExtensionDataSubfolderPath(
  filePath: string,
  subfolder: ExtensionDataSubfolder,
  extensionDataFolder: string,
  baseFolderName: string
): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const extFolder = normalizeExtensionDataFolderName(extensionDataFolder);
  const base = baseFolderName.toLowerCase();

  return (
    normalized.includes(`/.${extFolder}/${subfolder}/`) ||
    normalized.includes(`/.${base}/${subfolder}/`) ||
    normalized.includes(`/.cursor/${subfolder}/`)
  );
}
