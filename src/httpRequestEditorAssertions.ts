import type { HttpRequestAssertionSummary } from './httpRequestEditorTypes';
import { findRequestLineRange } from './httpRequestEditorSerializer';

function escapeAssertString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function formatExpectedValue(expected: string): string {
  const trimmed = expected.trim();
  if (trimmed === '') {
    return '""';
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed;
  }
  if (trimmed === 'true' || trimmed === 'false') {
    return trimmed;
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed;
  }
  return `"${escapeAssertString(trimmed)}"`;
}

/**
 * Serializes assertions to a REST Client comment block.
 */
export function serializeAssertionBlock(
  assertions: HttpRequestAssertionSummary[]
): string {
  if (assertions.length === 0) {
    return '';
  }

  const lines = assertions.map((a) => {
    const desc = a.description?.trim();
    const expr = a.expression.trim();
    const op = a.operator.trim();
    const expected = a.expected?.trim() ?? '';

    if (desc && desc !== expr && expected) {
      return ` * @assert("${escapeAssertString(desc)}", "${escapeAssertString(expr)}", "${escapeAssertString(op)}", ${formatExpectedValue(expected)})`;
    }
    if (expected) {
      return ` * @assert("${escapeAssertString(expr)}", "${escapeAssertString(op)}", ${formatExpectedValue(expected)})`;
    }
    return ` * @assert("${escapeAssertString(expr)}", "${escapeAssertString(op)}")`;
  });

  return ['/*', ...lines, ' */'].join('\n');
}

/**
 * Replaces or inserts the assertion block for a request block in the file.
 */
export function mergeAssertionsIntoBlock(
  fileContent: string,
  block: { startLine: number; endLine: number },
  assertions: HttpRequestAssertionSummary[]
): string {
  const lines = fileContent.split('\n');

  let assertStart = -1;
  let assertEnd = -1;
  for (let i = block.startLine; i <= block.endLine && i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith('/*')) {
      continue;
    }
    let end = -1;
    for (let j = i; j <= block.endLine && j < lines.length; j++) {
      if (lines[j].trim().endsWith('*/')) {
        end = j;
        break;
      }
    }
    if (end < 0) {
      continue;
    }
    const chunk = lines.slice(i, end + 1).join('\n');
    if (chunk.includes('@assert')) {
      assertStart = i;
      assertEnd = end;
      break;
    }
  }

  const newBlock = serializeAssertionBlock(assertions);
  const newLines = newBlock ? newBlock.split('\n') : [];

  if (assertions.length === 0 && assertStart >= 0 && assertEnd >= assertStart) {
    const removeFrom = assertStart > 0 && lines[assertStart - 1].trim() === '' ? assertStart - 1 : assertStart;
    lines.splice(removeFrom, assertEnd - removeFrom + 1);
    return lines.join('\n');
  }

  if (assertStart >= 0 && assertEnd >= assertStart) {
    lines.splice(assertStart, assertEnd - assertStart + 1, ...newLines);
    return lines.join('\n');
  }

  if (newLines.length === 0) {
    return fileContent;
  }

  const range = findRequestLineRange(lines, block.startLine, block.endLine);
  let insertAt = range ? range.requestEnd + 1 : block.endLine + 1;
  while (insertAt < lines.length && lines[insertAt].trim() === '') {
    insertAt++;
  }
  lines.splice(insertAt, 0, '', ...newLines);
  return lines.join('\n');
}
