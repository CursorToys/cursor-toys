import * as vscode from 'vscode';

/** A runnable HTTP block inside an HTTP request file (matches CodeLens send targets). */
export interface HttpRequestBlock {
  title: string;
  titleLine: number;
  startLine: number;
  endLine: number;
  envName: string | null;
  kind: 'section' | 'curl' | 'rest' | 'fallback';
}

const REST_METHOD_LINE =
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i;

/**
 * Splits a `##` section into per-request sub-blocks when multiple REST methods exist.
 */
export function expandSectionSubBlocks(
  document: vscode.TextDocument,
  section: HttpRequestBlock
): HttpRequestBlock[] {
  const lines = document.getText().split('\n');
  const methodLines: number[] = [];

  for (let i = section.startLine; i <= section.endLine; i++) {
    if (REST_METHOD_LINE.test(lines[i].trim())) {
      methodLines.push(i);
    }
  }

  if (methodLines.length <= 1) {
    return [section];
  }

  const subBlocks: HttpRequestBlock[] = [];

  for (let m = 0; m < methodLines.length; m++) {
    const startLine = methodLines[m];
    let titleLine = startLine;
    let title = section.title;

    for (let k = startLine - 1; k >= section.startLine; k--) {
      const t = lines[k].trim();
      if (t === '###') {
        continue;
      }
      const titleMatch = t.match(/^###\s+(.+)$/);
      if (titleMatch?.[1]?.trim()) {
        title = titleMatch[1].trim();
        titleLine = k;
        break;
      }
      if (REST_METHOD_LINE.test(t)) {
        break;
      }
    }

    let endLine = m + 1 < methodLines.length ? methodLines[m + 1] - 1 : section.endLine;
    for (let j = startLine + 1; j <= endLine; j++) {
      if (lines[j].trim() === '###') {
        endLine = j - 1;
        break;
      }
    }

    const methodMatch = lines[startLine].trim().match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)/i);
    const displayTitle =
      title !== section.title && title !== methodMatch?.[1]?.toUpperCase()
        ? title
        : `${section.title}${methodMatch ? ` (${methodMatch[1].toUpperCase()})` : ''}`;

    subBlocks.push({
      title: displayTitle,
      titleLine,
      startLine,
      endLine,
      envName: section.envName,
      kind: 'rest',
    });
  }

  return subBlocks;
}

/**
 * Reads the global `# @env` at the top of the file (before the first `##`).
 */
export function getGlobalHttpEnv(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('##')) {
      break;
    }
    const envMatch = line.match(/^#\s*@env\s+(\w+)/i);
    if (envMatch) {
      return envMatch[1];
    }
  }
  return null;
}

/**
 * Parses `##` section headers with cascading `# @env` support.
 */
export function parseRequestSections(document: vscode.TextDocument): HttpRequestBlock[] {
  const sections: HttpRequestBlock[] = [];
  const lines = document.getText().split('\n');
  const globalEnv = getGlobalHttpEnv(lines);

  let currentSection: HttpRequestBlock | null = null;
  let currentEnv: string | null = globalEnv;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    const envMatch = trimmedLine.match(/^#\s*@env\s+(\w+)/i);
    if (envMatch) {
      currentEnv = envMatch[1];
      continue;
    }

    const headerMatch = line.match(/^##\s+(.+)$/);
    if (headerMatch) {
      if (currentSection) {
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }

      currentSection = {
        title: headerMatch[1].trim(),
        titleLine: i,
        startLine: i,
        endLine: lines.length - 1,
        envName: currentEnv,
        kind: 'section',
      };
    }
  }

  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Returns true when the line range contains `{{variable}}` placeholders.
 */
export function rangeHasVariables(document: vscode.TextDocument, startLine: number, endLine: number): boolean {
  for (let i = startLine; i <= endLine && i < document.lineCount; i++) {
    const line = document.lineAt(i).text;
    if (line.match(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/)) {
      return true;
    }
  }
  return false;
}

function curlHasVariables(lines: string[], startIndex: number): boolean {
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/)) {
      return true;
    }
    if (!line.trim().endsWith('\\')) {
      break;
    }
  }
  return false;
}

/**
 * Standalone `curl` commands not covered by a `##` section.
 */
export function findStandaloneCurlBlocks(
  document: vscode.TextDocument,
  coveredLines: Set<number>
): HttpRequestBlock[] {
  const blocks: HttpRequestBlock[] = [];
  const lines = document.getText().split('\n');
  const globalEnv = getGlobalHttpEnv(lines);
  let currentEnv: string | null = globalEnv;

  for (let i = 0; i < lines.length; i++) {
    if (coveredLines.has(i)) {
      continue;
    }

    const line = lines[i].trim();

    const envMatch = line.match(/^#\s*@env\s+(\w+)/i);
    if (envMatch) {
      currentEnv = envMatch[1];
      continue;
    }

    if (!line.toLowerCase().startsWith('curl')) {
      continue;
    }

    let endLine = i;
    for (let j = i; j < lines.length; j++) {
      const curlLine = lines[j];
      if (!curlLine.trim().endsWith('\\')) {
        endLine = j;
        break;
      }
      endLine = j;
    }

    const hasVars = curlHasVariables(lines, i);
    blocks.push({
      title: 'curl',
      titleLine: i,
      startLine: i,
      endLine,
      envName: hasVars ? currentEnv : null,
      kind: 'curl',
    });
  }

  return blocks;
}

/**
 * REST Client method lines not inside a `##` section and not already covered.
 */
export function findStandaloneRestClientBlocks(
  document: vscode.TextDocument,
  coveredLines: Set<number>
): HttpRequestBlock[] {
  const blocks: HttpRequestBlock[] = [];
  const lines = document.getText().split('\n');
  const globalEnv = getGlobalHttpEnv(lines);
  let currentEnv: string | null = globalEnv;

  for (let i = 0; i < lines.length; i++) {
    if (coveredLines.has(i)) {
      continue;
    }

    const line = lines[i].trim();

    const envMatch = line.match(/^#\s*@env\s+(\w+)/i);
    if (envMatch) {
      currentEnv = envMatch[1];
      continue;
    }

    const restClientMatch = line.match(
      /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i
    );
    if (!restClientMatch) {
      continue;
    }

    let requestTitle: string | null = null;
    let titleLine = i;

    for (let k = i - 1; k >= 0; k--) {
      const prevLine = lines[k].trim();
      if (prevLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i)) {
        break;
      }
      if (prevLine.startsWith('##') && !prevLine.startsWith('###')) {
        break;
      }
      if (prevLine.startsWith('###')) {
        const titleMatch = prevLine.match(/^###\s+(.+)$/);
        if (titleMatch && titleMatch[1].trim()) {
          requestTitle = titleMatch[1].trim();
          titleLine = k;
        }
        break;
      }
    }

    let endLine = i;
    for (let j = i + 1; j < lines.length; j++) {
      const requestLine = lines[j].trim();
      if (requestLine.startsWith('###')) {
        endLine = j - 1;
        break;
      }
      if (requestLine.startsWith('##')) {
        endLine = j - 1;
        break;
      }
      if (requestLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i)) {
        endLine = j - 1;
        break;
      }
      endLine = j;
    }

    const hasVars = rangeHasVariables(document, i, endLine);
    blocks.push({
      title: requestTitle ?? restClientMatch[1].toUpperCase(),
      titleLine,
      startLine: i,
      endLine,
      envName: hasVars ? currentEnv : null,
      kind: 'rest',
    });
  }

  return blocks;
}

/**
 * Lists all HTTP request blocks that receive a Send Request action in the editor.
 */
export function getHttpRequestBlocks(document: vscode.TextDocument): HttpRequestBlock[] {
  const sections = parseRequestSections(document);
  const expandedSections: HttpRequestBlock[] = [];
  for (const section of sections) {
    expandedSections.push(...expandSectionSubBlocks(document, section));
  }

  const coveredLines = new Set<number>();

  for (const section of expandedSections) {
    for (let i = section.startLine; i <= section.endLine; i++) {
      coveredLines.add(i);
    }
  }

  const curls = findStandaloneCurlBlocks(document, coveredLines);
  const restBlocks = findStandaloneRestClientBlocks(document, coveredLines);

  const all = [...expandedSections, ...curls, ...restBlocks];

  if (all.length === 0) {
    return [
      {
        title: 'Send Request',
        titleLine: 0,
        startLine: 0,
        endLine: Math.max(0, document.lineCount - 1),
        envName: getGlobalHttpEnv(document.getText().split('\n')),
        kind: 'fallback',
      },
    ];
  }

  return all;
}

/**
 * Display label for a tree item or CodeLens title fragment.
 */
export function getHttpRequestBlockLabel(
  block: HttpRequestBlock,
  document: vscode.TextDocument
): string {
  if (block.kind === 'section') {
    return block.title;
  }
  if (block.kind === 'curl') {
    return 'curl';
  }
  if (block.kind === 'rest') {
    const line = document.lineAt(block.startLine).text.trim();
    const methodMatch = line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/i);
    if (block.title && block.title !== methodMatch?.[1]?.toUpperCase()) {
      return block.title;
    }
    return methodMatch ? methodMatch[1].toUpperCase() : block.title;
  }
  return block.title;
}

/**
 * Optional env suffix for tree description (when block uses variables).
 */
export function getHttpRequestBlockDescription(
  block: HttpRequestBlock,
  document: vscode.TextDocument
): string | undefined {
  if (!block.envName) {
    return undefined;
  }
  if (!rangeHasVariables(document, block.startLine, block.endLine)) {
    return undefined;
  }
  return block.envName;
}
