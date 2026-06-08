import * as fs from 'fs';
import * as path from 'path';

/** Always excluded from tree output regardless of .gitignore */
const ALWAYS_IGNORED = new Set(['.git']);

/** Fallback when no .gitignore exists at the repository root */
const FALLBACK_IGNORED = new Set([
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
]);

interface GitIgnoreRule {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
  rootAnchored: boolean;
}

export interface GitIgnoreFilter {
  gitRoot: string;
  shouldIgnore(relativePath: string, isDirectory: boolean): boolean;
}

/**
 * Walks up from startPath to find the nearest directory containing a .git folder.
 */
export function findGitRoot(startPath: string): string | null {
  let current = path.resolve(startPath);

  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function parseGitignoreLine(line: string): GitIgnoreRule | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  let pattern = trimmed;
  let negated = false;

  if (pattern.startsWith('!')) {
    negated = true;
    pattern = pattern.slice(1).trim();
    if (!pattern) {
      return null;
    }
  }

  let directoryOnly = false;
  if (pattern.endsWith('/')) {
    directoryOnly = true;
    pattern = pattern.slice(0, -1);
  }

  if (!pattern) {
    return null;
  }

  let rootAnchored = false;
  if (pattern.startsWith('/')) {
    rootAnchored = true;
    pattern = pattern.slice(1);
  }

  return { pattern, negated, directoryOnly, rootAnchored };
}

function parseGitignoreFile(filePath: string): GitIgnoreRule[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content
      .split(/\r?\n/)
      .map(parseGitignoreLine)
      .filter((rule): rule is GitIgnoreRule => rule !== null);
  } catch {
    return [];
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob: string): RegExp {
  let regex = '';
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];

    if (char === '*') {
      if (glob[i + 1] === '*') {
        regex += '.*';
        i++;
      } else {
        regex += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      regex += '[^/]';
      continue;
    }

    regex += escapeRegex(char);
  }

  return new RegExp(`^${regex}$`);
}

function pathSegments(value: string): string[] {
  return value.split('/').filter(Boolean);
}

function ruleMatches(rule: GitIgnoreRule, relativePath: string, isDirectory: boolean): boolean {
  if (rule.directoryOnly && !isDirectory) {
    return false;
  }

  const normalized = relativePath.replace(/\\/g, '/');
  const segments = pathSegments(normalized);
  const basename = segments[segments.length - 1] ?? normalized;
  const regex = globToRegExp(rule.pattern);

  if (rule.rootAnchored) {
    if (regex.test(normalized)) {
      return true;
    }

    return (
      normalized.startsWith(`${rule.pattern}/`) ||
      (isDirectory && normalized === rule.pattern)
    );
  }

  if (!rule.pattern.includes('/')) {
    for (const segment of segments) {
      if (regex.test(segment)) {
        return true;
      }
    }
  }

  if (regex.test(basename) || regex.test(normalized)) {
    return true;
  }

  for (let i = 0; i < segments.length; i++) {
    const suffix = segments.slice(i).join('/');
    if (regex.test(suffix)) {
      return true;
    }
  }

  return false;
}

function loadRulesAlongPath(gitRoot: string, absoluteDir: string): GitIgnoreRule[] {
  const rules: GitIgnoreRule[] = [];
  const gitRootResolved = path.resolve(gitRoot);
  const targetResolved = path.resolve(absoluteDir);

  let current = gitRootResolved;
  rules.push(...parseGitignoreFile(path.join(gitRootResolved, '.gitignore')));

  const relative = path.relative(gitRootResolved, targetResolved);
  if (!relative || relative === '.') {
    return rules;
  }

  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    const nestedRules = parseGitignoreFile(path.join(current, '.gitignore'));
    const prefix = path.relative(gitRootResolved, current).replace(/\\/g, '/');

    for (const rule of nestedRules) {
      rules.push({
        ...rule,
        pattern: prefix ? `${prefix}/${rule.pattern}` : rule.pattern,
        rootAnchored: rule.rootAnchored || Boolean(prefix),
      });
    }
  }

  return rules;
}

function evaluateRules(
  rules: GitIgnoreRule[],
  relativePath: string,
  isDirectory: boolean
): boolean {
  let ignored = false;

  for (const rule of rules) {
    if (!ruleMatches(rule, relativePath, isDirectory)) {
      continue;
    }

    ignored = !rule.negated;
  }

  return ignored;
}

/**
 * Builds a gitignore-based filter for paths relative to gitRoot.
 */
export function createGitIgnoreFilter(gitRoot: string): GitIgnoreFilter {
  const gitRootResolved = path.resolve(gitRoot);
  const rulesCache = new Map<string, GitIgnoreRule[]>();

  const getRulesForParent = (absoluteParentDir: string): GitIgnoreRule[] => {
    const cacheKey = path.resolve(absoluteParentDir);
    const cached = rulesCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const rules = loadRulesAlongPath(gitRootResolved, cacheKey);
    rulesCache.set(cacheKey, rules);
    return rules;
  };

  return {
    gitRoot: gitRootResolved,
    shouldIgnore(relativePath: string, isDirectory: boolean): boolean {
      const normalized = relativePath.replace(/\\/g, '/');
      const basename = path.posix.basename(normalized);

      if (ALWAYS_IGNORED.has(basename)) {
        return true;
      }

      const absolutePath = path.join(gitRootResolved, normalized);
      const parentDir = path.dirname(absolutePath);
      const rules = getRulesForParent(parentDir);

      if (rules.length === 0) {
        return FALLBACK_IGNORED.has(basename);
      }

      return evaluateRules(rules, normalized, isDirectory);
    },
  };
}

/**
 * Resolves the git root for a tree root and creates a filter.
 * Falls back to basename-only exclusions when not inside a git repository.
 */
export function createGitIgnoreFilterForPath(treeRoot: string): GitIgnoreFilter {
  const gitRoot = findGitRoot(treeRoot);
  if (!gitRoot) {
    return {
      gitRoot: path.resolve(treeRoot),
      shouldIgnore(_relativePath: string, isDirectory: boolean): boolean {
        const basename = path.posix.basename(_relativePath.replace(/\\/g, '/'));
        if (ALWAYS_IGNORED.has(basename)) {
          return true;
        }
        return isDirectory && FALLBACK_IGNORED.has(basename);
      },
    };
  }

  return createGitIgnoreFilter(gitRoot);
}
