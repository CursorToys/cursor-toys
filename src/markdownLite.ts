/**
 * Lightweight markdown helpers for webviews (single-line and inline patterns).
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function inlineMarkdown(escaped: string): string {
  return escaped
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_m, alt, url) => {
      const safeUrl = url.replace(/&quot;/g, '"');
      return `<img src="${safeUrl}" alt="${alt}" loading="lazy" />`;
    })
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_m, text, url) => {
      const safeUrl = url.replace(/&quot;/g, '"');
      return `<a href="${safeUrl}">${text}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/**
 * Renders one source line as HTML (headings, lists, blockquote, fences, inline).
 */
export function renderMarkdownLine(line: string): string {
  const trimmed = line.trimEnd();
  if (!trimmed.trim()) {
    return '<span class="md-empty">&nbsp;</span>';
  }

  const fence = trimmed.match(/^(`{3,}|~{3,})(\w*)$/);
  if (fence) {
    return `<pre class="md-fence"><code>${escapeHtml(trimmed)}</code></pre>`;
  }

  const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    const text = inlineMarkdown(escapeHtml(heading[2]));
    return `<h${level} class="md-heading">${text}</h${level}>`;
  }

  if (/^>\s?/.test(trimmed)) {
    const text = inlineMarkdown(escapeHtml(trimmed.replace(/^>\s?/, '')));
    return `<blockquote class="md-quote">${text}</blockquote>`;
  }

  if (/^[-*+]\s+/.test(trimmed)) {
    const text = inlineMarkdown(escapeHtml(trimmed.replace(/^[-*+]\s+/, '')));
    return `<div class="md-list-item"><span class="md-bullet">•</span> ${text}</div>`;
  }

  if (/^\d+\.\s+/.test(trimmed)) {
    const m = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (m) {
      const text = inlineMarkdown(escapeHtml(m[2]));
      return `<div class="md-list-item"><span class="md-bullet">${m[1]}.</span> ${text}</div>`;
    }
  }

  if (/^[-*_]{3,}\s*$/.test(trimmed)) {
    return '<hr class="md-hr" />';
  }

  if (trimmed.startsWith('|')) {
    return `<div class="md-table-line"><code>${escapeHtml(trimmed)}</code></div>`;
  }

  return `<p class="md-para">${inlineMarkdown(escapeHtml(trimmed))}</p>`;
}

/**
 * True when the line is inside a fenced code block (odd count of opening fences above).
 */
export function isInsideCodeFence(lines: string[], lineIndex: number): boolean {
  let open = false;
  for (let i = 0; i <= lineIndex; i++) {
    const t = lines[i]?.trim() ?? '';
    if (/^(`{3,}|~{3,})\s*\w*$/.test(t)) {
      open = !open;
    }
  }
  return open;
}
