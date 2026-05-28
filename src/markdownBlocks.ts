import { escapeHtml, inlineMarkdown } from './markdownLite';

export type MarkdownBlock =
  | { kind: 'lines'; startLine: number; endLine: number }
  | { kind: 'table'; startLine: number; endLine: number; lines: string[] }
  | { kind: 'mermaid'; startLine: number; endLine: number; content: string }
  | { kind: 'fenced'; startLine: number; endLine: number; lang: string; content: string };

/**
 * Splits markdown source into renderable blocks (tables, mermaid, fences, plain lines).
 */
export function parseMarkdownBlocks(sourceLines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < sourceLines.length) {
    const trimmed = sourceLines[i].trim();
    const fenceOpen = trimmed.match(/^(`{3,}|~{3,})(.*)$/);

    if (fenceOpen) {
      const marker = fenceOpen[1];
      const info = (fenceOpen[2] || '').trim().toLowerCase();
      const lang = info.split(/\s+/)[0] || '';
      const startLine = i + 1;
      i++;
      const body: string[] = [];
      while (i < sourceLines.length) {
        const closeLine = sourceLines[i].trim();
        if (closeLine === marker || closeLine.startsWith(marker)) {
          break;
        }
        body.push(sourceLines[i]);
        i++;
      }
      const endLine = i + 1;
      if (lang === 'mermaid') {
        blocks.push({ kind: 'mermaid', startLine, endLine, content: body.join('\n') });
      } else {
        blocks.push({
          kind: 'fenced',
          startLine,
          endLine: i,
          lang,
          content: body.join('\n'),
        });
      }
      i++;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const startLine = i + 1;
      const tableLines: string[] = [];
      while (i < sourceLines.length && sourceLines[i].trim().startsWith('|')) {
        tableLines.push(sourceLines[i]);
        i++;
      }
      blocks.push({ kind: 'table', startLine, endLine: i, lines: tableLines });
      continue;
    }

    const startLine = i + 1;
    while (i < sourceLines.length) {
      const t = sourceLines[i].trim();
      if (/^(`{3,}|~{3,})/.test(t) || t.startsWith('|')) {
        break;
      }
      i++;
    }
    blocks.push({ kind: 'lines', startLine, endLine: i });
  }

  return blocks;
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|')) {
    return [];
  }
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return inner.split('|').map((c) => c.trim());
}

function isTableSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{3,}:?$/.test(c));
}

function renderTableCell(cell: string): string {
  return inlineMarkdown(escapeHtml(cell));
}

/**
 * Renders a GitHub-style markdown table as HTML.
 */
export function renderMarkdownTable(tableLines: string[]): string {
  const parsed = tableLines.map(parseTableCells).filter((cells) => cells.length > 0);
  if (parsed.length === 0) {
    return `<pre class="md-fallback">${escapeHtml(tableLines.join('\n'))}</pre>`;
  }

  let headerRow: string[] | undefined;
  const bodyRows: string[][] = [];
  for (const cells of parsed) {
    if (isTableSeparatorRow(cells)) {
      continue;
    }
    if (!headerRow) {
      headerRow = cells;
    } else {
      bodyRows.push(cells);
    }
  }

  if (!headerRow) {
    return `<pre class="md-fallback">${escapeHtml(tableLines.join('\n'))}</pre>`;
  }

  const thead = `<thead><tr>${headerRow.map((c) => `<th>${renderTableCell(c)}</th>`).join('')}</tr></thead>`;
  const tbody = bodyRows.length
    ? `<tbody>${bodyRows
        .map(
          (row) =>
            `<tr>${row
              .map((c) => `<td>${renderTableCell(c)}</td>`)
              .join('')}</tr>`
        )
        .join('')}</tbody>`
    : '';

  return `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`;
}

/**
 * Mermaid diagram container (initialized by mermaid.js in the webview).
 */
export function renderMermaidBlock(content: string): string {
  const safe = escapeHtml(content.trim());
  return `<div class="md-mermaid-wrap"><pre class="mermaid">${safe}</pre></div>`;
}

/**
 * Fenced code block (non-mermaid).
 */
export function renderFencedCodeBlock(content: string, lang: string): string {
  const label = lang ? `<div class="md-code-lang">${escapeHtml(lang)}</div>` : '';
  return `<div class="md-fenced-wrap">${label}<pre class="md-fenced"><code>${escapeHtml(content)}</code></pre></div>`;
}
