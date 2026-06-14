import * as fs from 'fs';
import * as path from 'path';
import { createGitIgnoreFilterForPath, GitIgnoreFilter, findGitRoot } from './gitignoreTreeFilter';
import { parseInlineAnnotations, ParsedInlineAnnotation } from './inlineAnnotationParser';

import { InlineAnnotationMarker } from './inlineAnnotationStore';

export type { InlineAnnotationMarker };

export interface ScanFileOptions {
  tags: string[];
  fileExtensions: string[];
  scanIncludePaths: string[];
}

/**
 * Converts a glob pattern to a RegExp (supports *, **, ?).
 */
export function globPatternToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  let regex = '';
  let index = 0;

  while (index < normalized.length) {
    if (normalized.startsWith('**/', index)) {
      regex += '(?:.*/)?';
      index += 3;
      continue;
    }
    if (normalized.startsWith('**', index)) {
      regex += '.*';
      index += 2;
      continue;
    }

    const char = normalized[index];
    if (char === '*') {
      regex += '[^/]*';
    } else if (char === '?') {
      regex += '[^/]';
    } else if (/[+^${}()|[\]\\]/.test(char)) {
      regex += `\\${char}`;
    } else {
      regex += char;
    }
    index += 1;
  }

  return new RegExp(`^${regex}$`);
}

/**
 * Returns true when a relative path matches any include override pattern.
 */
export function matchesAnyIncludePattern(relativePath: string, includePatterns: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  for (const pattern of includePatterns) {
    if (!pattern.trim()) {
      continue;
    }
    if (globPatternToRegExp(pattern.trim()).test(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true when any include pattern may match files under a directory.
 */
export function couldMatchIncludedDescendant(relativeDir: string, includePatterns: string[]): boolean {
  const normalized = relativeDir.replace(/\\/g, '/').replace(/\/$/, '');
  if (!normalized) {
    return includePatterns.length > 0;
  }

  for (const pattern of includePatterns) {
    const trimmed = pattern.trim().replace(/\\/g, '/');
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith(`${normalized}/`) || trimmed === normalized) {
      return true;
    }
    if (trimmed.includes(`${normalized}/`)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns true when a path or any ancestor directory is gitignored.
 */
export function isPathIgnoredIncludingParents(relativePath: string, gitFilter: GitIgnoreFilter): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  if (gitFilter.shouldIgnore(normalized, false)) {
    return true;
  }

  const parts = normalized.split('/').filter(Boolean);
  for (let index = 1; index < parts.length; index += 1) {
    const parentPath = parts.slice(0, index).join('/');
    if (gitFilter.shouldIgnore(parentPath, true)) {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether a file should be scanned, honoring gitignore with include overrides.
 */
export function shouldScanRelativePath(
  relativePath: string,
  gitFilter: GitIgnoreFilter,
  includePatterns: string[]
): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  const ignored = isPathIgnoredIncludingParents(normalized, gitFilter);
  if (!ignored) {
    return true;
  }
  return matchesAnyIncludePattern(normalized, includePatterns);
}

function hasAllowedExtension(filePath: string, extensions: string[]): boolean {
  const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
  return extensions.includes(ext);
}

function toMarker(filePath: string, parsed: ParsedInlineAnnotation): InlineAnnotationMarker {
  return {
    id: `${filePath}:${parsed.line}:${parsed.tag}`,
    tag: parsed.tag,
    filePath,
    line: parsed.line,
    column: parsed.column,
    preview: parsed.preview,
  };
}

/**
 * Parses markers from a file on disk.
 */
export function scanFileAtPath(filePath: string, options: ScanFileOptions): InlineAnnotationMarker[] {
  if (!hasAllowedExtension(filePath, options.fileExtensions)) {
    return [];
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  return parseInlineAnnotations(content, options.tags).map((parsed) => toMarker(filePath, parsed));
}

/**
 * Recursively collects scannable file paths under a directory root.
 */
export function collectScannableFiles(
  workspaceRoot: string,
  options: ScanFileOptions
): string[] {
  const rootResolved = path.resolve(workspaceRoot);
  const gitRoot = findGitRoot(rootResolved) ?? rootResolved;
  const gitFilter = createGitIgnoreFilterForPath(gitRoot);
  const files: string[] = [];

  const walk = (currentDir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      const relativeToGit = path.relative(gitRoot, absolutePath).replace(/\\/g, '/');
      if (!relativeToGit || relativeToGit.startsWith('..')) {
        continue;
      }

      if (entry.isDirectory()) {
        const dirIgnored = gitFilter.shouldIgnore(relativeToGit, true);
        if (
          dirIgnored &&
          !couldMatchIncludedDescendant(relativeToGit, options.scanIncludePaths) &&
          !matchesAnyIncludePattern(relativeToGit, options.scanIncludePaths)
        ) {
          continue;
        }
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!shouldScanRelativePath(relativeToGit, gitFilter, options.scanIncludePaths)) {
        continue;
      }

      if (!hasAllowedExtension(absolutePath, options.fileExtensions)) {
        continue;
      }

      files.push(absolutePath);
    }
  };

  walk(rootResolved);
  return files;
}

/**
 * Scans a workspace folder and returns all inline annotation markers.
 */
export function scanWorkspaceFolder(
  workspaceRoot: string,
  options: ScanFileOptions
): InlineAnnotationMarker[] {
  const files = collectScannableFiles(workspaceRoot, options);
  const markers: InlineAnnotationMarker[] = [];

  for (const filePath of files) {
    markers.push(...scanFileAtPath(filePath, options));
  }

  return markers;
}
