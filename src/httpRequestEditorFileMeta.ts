/**
 * File-level HTTP metadata (# @env, # @var) read/write for the request editor.
 */

export interface FileVariableEntry {
  key: string;
  value: string;
  line: number;
}

/**
 * Parses `# @var` entries from the file header (before the first `##` section).
 */
export function parseFileHeaderVariables(lines: string[]): FileVariableEntry[] {
  const entries: FileVariableEntry[] = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('##')) {
      break;
    }
    const match = trimmed.match(/^#\s*@var\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*)?(.+)?$/i);
    if (match) {
      const value = match[2] ? match[2].trim().replace(/^["']|["']$/g, '') : '';
      entries.push({ key: match[1], value, line: i });
    }
  }
  return entries;
}

/**
 * Reads global `# @env` from the file header.
 */
export function parseFileGlobalEnv(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('##')) {
      break;
    }
    const match = trimmed.match(/^#\s*@env\s+(\w+)/i);
    if (match) {
      return match[1];
    }
  }
  return null;
}

/**
 * Sets or clears global `# @env` in file content.
 */
export function setFileGlobalEnv(content: string, envName: string | null): string {
  const lines = content.split('\n');
  let envLine = -1;
  let firstSection = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('##') && firstSection === lines.length) {
      firstSection = i;
    }
    if (trimmed.match(/^#\s*@env\s+/i)) {
      envLine = i;
      break;
    }
  }

  if (!envName) {
    if (envLine >= 0) {
      lines.splice(envLine, 1);
    }
    return lines.join('\n');
  }

  const newLine = `# @env ${envName}`;
  if (envLine >= 0) {
    lines[envLine] = newLine;
  } else {
    lines.splice(firstSection > 0 ? firstSection : 0, 0, newLine, '');
  }
  return lines.join('\n');
}

/**
 * Adds, updates, or removes a `# @var` line in the file header.
 */
export function upsertFileVariable(
  content: string,
  key: string,
  value: string | null
): string {
  const lines = content.split('\n');
  const entries = parseFileHeaderVariables(lines);
  const existing = entries.find((e) => e.key.toLowerCase() === key.toLowerCase());

  if (value === null) {
    if (existing) {
      lines.splice(existing.line, 1);
    }
    return lines.join('\n');
  }

  const newLine = `# @var ${key}=${value}`;
  if (existing) {
    lines[existing.line] = newLine;
  } else {
    let insertAt = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('##')) {
        insertAt = i;
        break;
      }
      insertAt = i + 1;
    }
    lines.splice(insertAt, 0, newLine);
  }
  return lines.join('\n');
}

/**
 * Sets `# @env` for a `##` section block (line after section header).
 */
export function setBlockEnvInFile(
  content: string,
  sectionStartLine: number,
  envName: string | null
): string {
  const lines = content.split('\n');
  let envLine = -1;
  let sectionEnd = lines.length;

  for (let i = sectionStartLine + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('##')) {
      sectionEnd = i;
      break;
    }
    if (trimmed.match(/^#\s*@env\s+/i)) {
      envLine = i;
    }
    if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i.test(trimmed)) {
      sectionEnd = i;
      break;
    }
  }

  if (!envName) {
    if (envLine >= 0) {
      lines.splice(envLine, 1);
    }
    return lines.join('\n');
  }

  const newLine = `# @env ${envName}`;
  if (envLine >= 0) {
    lines[envLine] = newLine;
  } else {
    lines.splice(sectionStartLine + 1, 0, newLine);
  }
  return lines.join('\n');
}
