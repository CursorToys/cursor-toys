/**
 * Parsed inline annotation marker from a single source line.
 */
export interface ParsedInlineAnnotation {
  tag: string;
  line: number;
  column: number;
  preview: string;
}

/**
 * Result of matching a single line against inline annotation patterns.
 */
export interface InlineAnnotationLineMatch {
  tag: string;
  preview: string;
  column: number;
}

/**
 * Builds regex patterns for configured tags across supported comment styles.
 * Tags must appear in ALL CAPS in source (e.g. TODO, FIX, NOTE) to avoid
 * false positives such as Portuguese "todo" in markdown lists.
 */
function buildTagRegexes(tags: string[]): RegExp[] {
  const normalized = tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) {
    return [];
  }

  const escaped = normalized.map((tag) =>
    tag.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );
  const tagGroup = escaped.join('|');

  return [
    new RegExp(`^\\s*//\\s*(${tagGroup})\\b\\s*:?\\s*(.*)$`),
    new RegExp(`^\\s*#{1,6}\\s*(${tagGroup})\\b\\s*:?\\s*(.*)$`),
    new RegExp(`^\\s*[-*+]\\s+(${tagGroup})\\b\\s*:?\\s*(.*)$`),
    new RegExp(`^\\s*--\\s*(${tagGroup})\\b\\s*:?\\s*(.*)$`),
    new RegExp(`^\\s*;\\s*(${tagGroup})\\b\\s*:?\\s*(.*)$`),
    new RegExp(`^\\s*<!--\\s*(${tagGroup})\\b\\s*:?\\s*(.*?)(?:\\s*-->)?\\s*$`),
  ];
}

/**
 * Matches a single line against inline annotation patterns.
 */
export function matchInlineAnnotationLine(lineText: string, tags: string[]): InlineAnnotationLineMatch | null {
  for (const regex of buildTagRegexes(tags)) {
    const match = lineText.match(regex);
    if (!match) {
      continue;
    }

    const tag = match[1].toLowerCase();
    const message = (match[2] ?? '').trim();
    const column = lineText.indexOf(match[1]);

    return {
      tag,
      preview: message || lineText.trim(),
      column: column >= 0 ? column : 0,
    };
  }

  return null;
}

/**
 * Parses inline annotation markers from file content.
 * Supports //, #/## headings, markdown lists, --, ;, and HTML comments.
 * Source tags must be uppercase (TODO, FIX, NOTE); stored tags are lowercase.
 */
export function parseInlineAnnotations(content: string, tags: string[]): ParsedInlineAnnotation[] {
  const lines = content.split(/\r?\n/);
  const results: ParsedInlineAnnotation[] = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const match = matchInlineAnnotationLine(lines[lineIndex], tags);
    if (!match) {
      continue;
    }

    results.push({
      tag: match.tag,
      line: lineIndex,
      column: match.column,
      preview: match.preview,
    });
  }

  return results;
}
