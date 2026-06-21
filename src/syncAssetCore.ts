import * as path from 'path';

export type SyncAssetCategory = 'rules' | 'skills' | 'commands' | 'prompts' | 'agents' | 'hooks';

export interface SyncPathPair {
  sourcePath: string;
  targetPath: string;
  category: SyncAssetCategory;
  name: string;
}

/**
 * Builds a simple line-based diff summary for MCP dryRun responses.
 */
export function computeSyncDiffSummary(
  existingContent: string | null,
  incomingContent: string
): { wouldOverwrite: boolean; diffSummary: string } {
  if (existingContent === null) {
    return { wouldOverwrite: false, diffSummary: 'Target does not exist; copy only.' };
  }
  if (existingContent === incomingContent) {
    return { wouldOverwrite: false, diffSummary: 'Source and target are identical.' };
  }
  const oldLines = existingContent.split(/\r?\n/);
  const newLines = incomingContent.split(/\r?\n/);
  let changed = 0;
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i += 1) {
    if (oldLines[i] !== newLines[i]) {
      changed += 1;
    }
  }
  return {
    wouldOverwrite: true,
    diffSummary: `Lines differ: old=${oldLines.length}, new=${newLines.length}, changed~${changed}`,
  };
}

/**
 * Resolves subfolder name for a sync category under a cursor root.
 */
export function syncCategorySubfolder(category: SyncAssetCategory): string {
  if (category === 'hooks') {
    return '';
  }
  return category;
}

/**
 * Resolves personal and workspace paths for a named asset sync operation.
 */
export function resolveSyncPaths(
  category: SyncAssetCategory,
  name: string,
  personalRoot: string,
  workspaceRoot: string,
  direction: 'toWorkspace' | 'toGlobal'
): SyncPathPair {
  const sanitized = name.replace(/[<>:"/\\|?*]/g, '-');
  let sourcePath: string;
  let targetPath: string;

  if (category === 'hooks') {
    if (sanitized === 'hooks.json' || sanitized.endsWith('.json')) {
      const file = sanitized.endsWith('.json') ? sanitized : 'hooks.json';
      sourcePath =
        direction === 'toWorkspace'
          ? path.join(personalRoot, file)
          : path.join(workspaceRoot, file);
      targetPath =
        direction === 'toWorkspace'
          ? path.join(workspaceRoot, file)
          : path.join(personalRoot, file);
    } else {
      const script = sanitized.includes('.') ? sanitized : `${sanitized}.sh`;
      sourcePath =
        direction === 'toWorkspace'
          ? path.join(personalRoot, 'hooks', script)
          : path.join(workspaceRoot, 'hooks', script);
      targetPath =
        direction === 'toWorkspace'
          ? path.join(workspaceRoot, 'hooks', script)
          : path.join(personalRoot, 'hooks', script);
    }
  } else if (category === 'skills') {
    sourcePath =
      direction === 'toWorkspace'
        ? path.join(personalRoot, 'skills', sanitized)
        : path.join(workspaceRoot, 'skills', sanitized);
    targetPath =
      direction === 'toWorkspace'
        ? path.join(workspaceRoot, 'skills', sanitized)
        : path.join(personalRoot, 'skills', sanitized);
  } else {
    const ext = category === 'rules' ? '.mdc' : '.md';
    const fileName = sanitized.includes('.') ? sanitized : `${sanitized}${ext}`;
    sourcePath =
      direction === 'toWorkspace'
        ? path.join(personalRoot, category, fileName)
        : path.join(workspaceRoot, category, fileName);
    targetPath =
      direction === 'toWorkspace'
        ? path.join(workspaceRoot, category, fileName)
        : path.join(personalRoot, category, fileName);
  }

  if (direction === 'toGlobal') {
    return { sourcePath: targetPath, targetPath: sourcePath, category, name: sanitized };
  }
  return { sourcePath, targetPath, category, name: sanitized };
}
