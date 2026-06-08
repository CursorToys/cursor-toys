import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createGitIgnoreFilterForPath, GitIgnoreFilter } from './gitignoreTreeFilter';

const MAX_DEPTH = 10;
const MAX_FILES = 1000;

interface TreeResult {
  tree: string;
  fileCount: number;
  folderCount: number;
}

interface TreeOptions {
  maxDepth?: number;
  maxFiles?: number;
  /** When true, include dotfiles not matched by .gitignore. Default: false */
  includeHidden?: boolean;
  /** When false, skip .gitignore and use minimal built-in exclusions only */
  useGitignore?: boolean;
}

/**
 * Generates a formatted tree representation of a directory
 * @param dirPath Directory path to generate tree from
 * @param options Generation options
 * @returns TreeResult containing the formatted tree and counts, or null on error
 */
export async function generateTree(
  dirPath: string,
  options: TreeOptions = {}
): Promise<TreeResult | null> {
  const {
    maxDepth = MAX_DEPTH,
    maxFiles = MAX_FILES,
    includeHidden = false,
    useGitignore = true,
  } = options;

  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      vscode.window.showErrorMessage('Path is not a directory');
      return null;
    }

    const rootName = path.basename(dirPath);
    const ignoreFilter = useGitignore ? createGitIgnoreFilterForPath(dirPath) : null;

    const lines: string[] = [rootName];

    const result = traverseDirectory(
      dirPath,
      '',
      0,
      maxDepth,
      maxFiles,
      includeHidden,
      ignoreFilter,
      lines
    );

    if (result.limited) {
      lines.push('');
      lines.push('[Tree truncated: file limit reached]');
    }

    if (result.depthLimited) {
      lines.push('');
      lines.push('[Tree truncated: depth limit reached]');
    }

    return {
      tree: lines.join('\n'),
      fileCount: result.fileCount,
      folderCount: result.folderCount,
    };
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating tree: ${error}`);
    return null;
  }
}

interface TraverseResult {
  fileCount: number;
  folderCount: number;
  limited: boolean;
  depthLimited: boolean;
}

function shouldSkipEntry(
  entry: string,
  entryPath: string,
  isDirectory: boolean,
  includeHidden: boolean,
  ignoreFilter: GitIgnoreFilter | null
): boolean {
  if (ignoreFilter) {
    const relativeToGit = path
      .relative(ignoreFilter.gitRoot, entryPath)
      .replace(/\\/g, '/');

    if (relativeToGit.startsWith('..')) {
      return !includeHidden && entry.startsWith('.');
    }

    return ignoreFilter.shouldIgnore(relativeToGit, isDirectory);
  }

  if (!includeHidden && entry.startsWith('.')) {
    return true;
  }

  return false;
}

function traverseDirectory(
  dirPath: string,
  prefix: string,
  depth: number,
  maxDepth: number,
  maxFiles: number,
  includeHidden: boolean,
  ignoreFilter: GitIgnoreFilter | null,
  lines: string[],
  totalProcessed: { count: number } = { count: 0 }
): TraverseResult {
  let fileCount = 0;
  let folderCount = 0;
  let limited = false;
  let depthLimited = false;

  if (depth >= maxDepth) {
    return { fileCount, folderCount, limited, depthLimited: true };
  }

  try {
    const entries = fs.readdirSync(dirPath);

    const filteredEntries = entries.filter((entry) => {
      const entryPath = path.join(dirPath, entry);
      let isDirectory = false;

      try {
        isDirectory = fs.statSync(entryPath).isDirectory();
      } catch {
        return false;
      }

      return !shouldSkipEntry(entry, entryPath, isDirectory, includeHidden, ignoreFilter);
    });

    const sortedEntries = filteredEntries.sort((a, b) => {
      const aPath = path.join(dirPath, a);
      const bPath = path.join(dirPath, b);
      const aIsDir = fs.statSync(aPath).isDirectory();
      const bIsDir = fs.statSync(bPath).isDirectory();

      if (aIsDir && !bIsDir) {
        return -1;
      }
      if (!aIsDir && bIsDir) {
        return 1;
      }
      return a.localeCompare(b);
    });

    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      const entryPath = path.join(dirPath, entry);
      const isLast = i === sortedEntries.length - 1;

      totalProcessed.count++;

      if (totalProcessed.count > maxFiles) {
        limited = true;
        break;
      }

      const isDirectory = fs.statSync(entryPath).isDirectory();

      const connector = isLast ? '└── ' : '├── ';
      const line = prefix + connector + entry;
      lines.push(line);

      if (isDirectory) {
        folderCount++;
        const childPrefix = prefix + (isLast ? '    ' : '│   ');
        const childResult = traverseDirectory(
          entryPath,
          childPrefix,
          depth + 1,
          maxDepth,
          maxFiles,
          includeHidden,
          ignoreFilter,
          lines,
          totalProcessed
        );
        fileCount += childResult.fileCount;
        folderCount += childResult.folderCount;
        limited = limited || childResult.limited;
        depthLimited = depthLimited || childResult.depthLimited;
      } else {
        fileCount++;
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return { fileCount, folderCount, limited, depthLimited };
}

/**
 * Generates tree from a VS Code URI and copies to clipboard
 * @param uri VS Code URI (from context menu)
 * @returns true if successful
 */
export async function generateTreeFromUri(uri: vscode.Uri): Promise<boolean> {
  if (!uri) {
    vscode.window.showErrorMessage('No folder selected');
    return false;
  }

  const result = await generateTree(uri.fsPath);

  if (!result) {
    return false;
  }

  try {
    await vscode.env.clipboard.writeText(result.tree);
    vscode.window.showInformationMessage(
      `Tree copied! ${result.fileCount} files, ${result.folderCount} folders`
    );
    return true;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to copy to clipboard: ${error}`);
    return false;
  }
}
