import * as path from 'path';

export interface HttpFolderFileEntry {
  filePath: string;
  fileName: string;
  /** Relative folder path from the HTTP root; empty string for root-level files. */
  folderPath: string;
}

export interface HttpFolderTreeNode {
  name: string;
  relativePath: string;
  entries: HttpFolderTreeEntry[];
}

export type HttpFolderTreeEntry =
  | { kind: 'file'; file: HttpFolderFileEntry }
  | { kind: 'folder'; node: HttpFolderTreeNode };

interface MutableFolderNode {
  name: string;
  relativePath: string;
  files: HttpFolderFileEntry[];
  children: Map<string, MutableFolderNode>;
}

/**
 * Builds a nested folder tree from flat HTTP file entries.
 */
export function buildHttpFolderTree(files: HttpFolderFileEntry[]): HttpFolderTreeEntry[] {
  const root: MutableFolderNode = {
    name: '',
    relativePath: '',
    files: [],
    children: new Map(),
  };

  for (const file of files) {
    const segments = (file.folderPath || '').split('/').filter(Boolean);
    if (segments.length === 0) {
      root.files.push(file);
      continue;
    }

    let node = root;
    let accumulated = '';
    for (const segment of segments) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      if (!node.children.has(segment)) {
        node.children.set(segment, {
          name: segment,
          relativePath: accumulated,
          files: [],
          children: new Map(),
        });
      }
      node = node.children.get(segment)!;
    }
    node.files.push(file);
  }

  return materializeFolderEntries(root);
}

function materializeFolderEntries(node: MutableFolderNode): HttpFolderTreeEntry[] {
  const result: HttpFolderTreeEntry[] = [];

  const sortedFiles = [...node.files].sort((a, b) => a.fileName.localeCompare(b.fileName));
  for (const file of sortedFiles) {
    result.push({ kind: 'file', file });
  }

  const sortedFolders = [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const child of sortedFolders) {
    result.push({
      kind: 'folder',
      node: {
        name: child.name,
        relativePath: child.relativePath,
        entries: materializeFolderEntries(child),
      },
    });
  }

  return result;
}

/**
 * Returns a display label for an HTTP file, including its folder when nested.
 */
export function httpFileDisplayName(fileName: string, folderPath?: string): string {
  if (!folderPath) {
    return fileName;
  }
  return path.posix.join(folderPath.replace(/\\/g, '/'), fileName);
}

/**
 * Collects unique folder paths from HTTP file entries (for grouped UI lists).
 */
export function groupHttpFilesByFolder(
  files: HttpFolderFileEntry[]
): Array<{ folderPath: string; files: HttpFolderFileEntry[] }> {
  const byFolder = new Map<string, HttpFolderFileEntry[]>();
  for (const file of files) {
    const key = file.folderPath || '';
    if (!byFolder.has(key)) {
      byFolder.set(key, []);
    }
    byFolder.get(key)!.push(file);
  }

  return [...byFolder.entries()]
    .sort(([a], [b]) => {
      if (!a) {
        return -1;
      }
      if (!b) {
        return 1;
      }
      return a.localeCompare(b);
    })
    .map(([folderPath, folderFiles]) => ({
      folderPath,
      files: folderFiles.sort((a, b) => a.fileName.localeCompare(b.fileName)),
    }));
}
