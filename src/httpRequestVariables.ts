import * as vscode from 'vscode';

const VAR_LINE_RE = /^#\s*@var\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:=\s*)?(.+)?$/i;

function cleanVarValue(raw: string | undefined): string {
  if (!raw) {
    return '';
  }
  return raw.trim().replace(/^["']|["']$/g, '');
}

function parseVarLine(line: string): { name: string; value: string } | null {
  const match = line.trim().match(VAR_LINE_RE);
  if (!match) {
    return null;
  }
  return { name: match[1], value: cleanVarValue(match[2]) };
}

export interface HttpVarDefinition {
  name: string;
  value: string;
  line: number;
  scope: 'file' | 'request';
}

/**
 * Returns the line range of the `###` block containing `line` (exclusive of separator lines).
 */
export function getRequestBlockRange(
  document: vscode.TextDocument,
  line: number
): { startLine: number; endLine: number } {
  let blockStart = 0;
  let blockEnd = document.lineCount - 1;

  for (let i = 0; i <= line && i < document.lineCount; i++) {
    if (document.lineAt(i).text.trim() === '###') {
      blockStart = i + 1;
    }
  }

  for (let i = line + 1; i < document.lineCount; i++) {
    if (document.lineAt(i).text.trim() === '###') {
      blockEnd = i - 1;
      break;
    }
    if (document.lineAt(i).text.trim().startsWith('##') && !document.lineAt(i).text.trim().startsWith('###')) {
      blockEnd = i - 1;
      break;
    }
  }

  return { startLine: blockStart, endLine: blockEnd };
}

/**
 * Global/file-level `# @var` entries before the first standalone `###` separator.
 */
export function extractGlobalFileVariables(document: vscode.TextDocument): Map<string, string> {
  const variables = new Map<string, string>();
  let globalEnd = document.lineCount;

  for (let i = 0; i < document.lineCount; i++) {
    if (document.lineAt(i).text.trim() === '###') {
      globalEnd = i;
      break;
    }
  }

  for (let i = 0; i < globalEnd; i++) {
    const line = document.lineAt(i).text.trim();
    if (line.startsWith('##')) {
      continue;
    }
    const parsed = parseVarLine(line);
    if (parsed) {
      variables.set(parsed.name, parsed.value);
    }
  }

  return variables;
}

/**
 * Cascaded `# @var` from completed `###` blocks before the current block.
 */
export function extractCascadedBlockVariables(
  document: vscode.TextDocument,
  beforeLine: number
): Map<string, string> {
  const variables = new Map<string, string>();
  let blockStart = 0;

  for (let i = 0; i < beforeLine; i++) {
    const trimmed = document.lineAt(i).text.trim();
    if (trimmed !== '###') {
      continue;
    }

    for (let j = blockStart; j < i; j++) {
      const parsed = parseVarLine(document.lineAt(j).text);
      if (parsed) {
        variables.set(parsed.name, parsed.value);
      }
    }
    blockStart = i + 1;
  }

  for (let j = blockStart; j < beforeLine; j++) {
    const parsed = parseVarLine(document.lineAt(j).text);
    if (parsed) {
      variables.set(parsed.name, parsed.value);
    }
  }

  return variables;
}

/**
 * Request-scoped `# @var` within the current `###` block only.
 */
export function extractRequestScopedVariables(
  document: vscode.TextDocument,
  startLine: number
): Map<string, string> {
  const { startLine: blockStart, endLine: blockEnd } = getRequestBlockRange(document, startLine);
  const variables = new Map<string, string>();

  for (let i = blockStart; i <= blockEnd && i < document.lineCount; i++) {
    const parsed = parseVarLine(document.lineAt(i).text);
    if (parsed) {
      variables.set(parsed.name, parsed.value);
    }
  }

  return variables;
}

/**
 * All custom variable definitions with source metadata (for hover / go-to-definition).
 */
export function listVariableDefinitions(document: vscode.TextDocument): HttpVarDefinition[] {
  const defs: HttpVarDefinition[] = [];
  let inBlock = false;
  let blockStart = 0;

  for (let i = 0; i < document.lineCount; i++) {
    const trimmed = document.lineAt(i).text.trim();

    if (trimmed === '###') {
      inBlock = true;
      blockStart = i + 1;
      continue;
    }

    const parsed = parseVarLine(trimmed);
    if (!parsed) {
      continue;
    }

    const scope: HttpVarDefinition['scope'] =
      inBlock && i >= blockStart ? 'request' : 'file';
    defs.push({ name: parsed.name, value: parsed.value, line: i, scope });
  }

  return defs;
}

/**
 * Merged map: global file vars → cascaded block vars → request-scoped vars (highest priority).
 */
export function mergeCustomVariables(
  document: vscode.TextDocument,
  startLine?: number
): Map<string, string> {
  const merged = extractGlobalFileVariables(document);

  if (startLine === undefined) {
    return merged;
  }

  for (const [k, v] of extractCascadedBlockVariables(document, startLine)) {
    merged.set(k, v);
  }
  for (const [k, v] of extractRequestScopedVariables(document, startLine)) {
    merged.set(k, v);
  }

  return merged;
}
