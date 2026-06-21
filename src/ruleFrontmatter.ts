export type RuleApplyMode = 'always' | 'intelligent' | 'globs' | 'manual';

export interface RuleFrontmatter {
  alwaysApply?: boolean;
  description?: string;
  globs?: string | string[];
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Maps UI apply modes to Cursor rule frontmatter fields.
 */
export function applyModeToFrontmatter(
  mode: RuleApplyMode,
  options?: { description?: string; globs?: string | string[] }
): RuleFrontmatter {
  switch (mode) {
    case 'always':
      return { alwaysApply: true };
    case 'intelligent':
      return { alwaysApply: false, description: options?.description ?? '' };
    case 'globs':
      return { alwaysApply: false, globs: options?.globs ?? [] };
    case 'manual':
    default:
      return { alwaysApply: false };
  }
}

/**
 * Parses YAML frontmatter and body from a rule file.
 */
export function parseRuleFile(content: string): { frontmatter: RuleFrontmatter; body: string } {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: content.trimStart() };
  }
  const frontmatter = parseSimpleYaml(match[1]);
  return { frontmatter, body: match[2] ?? '' };
}

/**
 * Composes a .mdc rule file from frontmatter and body.
 */
export function composeRuleFile(frontmatter: RuleFrontmatter, body: string): string {
  const lines: string[] = ['---'];
  if (frontmatter.alwaysApply === true) {
    lines.push('alwaysApply: true');
  } else if (frontmatter.alwaysApply === false) {
    lines.push('alwaysApply: false');
  }
  if (frontmatter.description !== undefined) {
    lines.push(`description: ${yamlQuote(String(frontmatter.description))}`);
  }
  if (frontmatter.globs !== undefined) {
    const globs = Array.isArray(frontmatter.globs) ? frontmatter.globs : [frontmatter.globs];
    if (globs.length === 1) {
      lines.push(`globs: ${yamlQuote(globs[0])}`);
    } else if (globs.length > 1) {
      lines.push('globs:');
      for (const g of globs) {
        lines.push(`  - ${yamlQuote(g)}`);
      }
    }
  }
  lines.push('---');
  const trimmedBody = body.replace(/^\n+/, '');
  return `${lines.join('\n')}\n${trimmedBody}`;
}

/**
 * Normalizes legacy .md content to .mdc with default manual apply mode.
 */
export function normalizeRuleContent(content: string, mode: RuleApplyMode = 'manual'): string {
  const parsed = parseRuleFile(content);
  const hasFrontmatter =
    parsed.frontmatter.alwaysApply !== undefined ||
    parsed.frontmatter.description !== undefined ||
    parsed.frontmatter.globs !== undefined;
  const frontmatter = hasFrontmatter ? parsed.frontmatter : applyModeToFrontmatter(mode);
  return composeRuleFile(frontmatter, parsed.body || '# Rule\n\n');
}

function yamlQuote(value: string): string {
  if (/[:#\n"'\\]/.test(value) || value.trim() !== value) {
    return JSON.stringify(value);
  }
  return value.includes(' ') ? JSON.stringify(value) : value;
}

function parseSimpleYaml(yaml: string): RuleFrontmatter {
  const result: RuleFrontmatter = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      i += 1;
      continue;
    }
    const kv = /^(\w+):\s*(.*)$/.exec(trimmed);
    if (!kv) {
      i += 1;
      continue;
    }
    const key = kv[1];
    let value = kv[2].trim();
    if (key === 'globs' && !value) {
      const globs: string[] = [];
      i += 1;
      while (i < lines.length && /^\s+-\s+/.test(lines[i])) {
        globs.push(stripYamlQuotes(lines[i].replace(/^\s+-\s+/, '').trim()));
        i += 1;
      }
      result.globs = globs;
      continue;
    }
    if (key === 'alwaysApply') {
      result.alwaysApply = value === 'true';
    } else if (key === 'description') {
      result.description = stripYamlQuotes(value);
    } else if (key === 'globs') {
      result.globs = stripYamlQuotes(value);
    }
    i += 1;
  }
  return result;
}

function stripYamlQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
