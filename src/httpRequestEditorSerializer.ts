import { parseHttpRequest } from './httpRequestParse';
import type { HttpRequestBlock } from './httpRequestParser';
import type { HttpRequestFormData } from './httpRequestEditorTypes';

const HTTP_METHOD_LINE =
  /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i;

/**
 * Locates the first runnable request lines inside a block range (0-based, inclusive).
 */
export function findRequestLineRange(
  lines: string[],
  startLine: number,
  endLine: number
): { requestStart: number; requestEnd: number } | null {
  let requestStart = -1;

  for (let i = startLine; i <= endLine && i < lines.length; i++) {
    const text = lines[i].trim();
    if (text.startsWith('###')) {
      break;
    }
    if (text.startsWith('##')) {
      continue;
    }
    if (text.startsWith('/*')) {
      break;
    }
    if (!text) {
      continue;
    }
    if (text.toLowerCase().startsWith('curl')) {
      let end = i;
      for (let j = i; j <= endLine && j < lines.length; j++) {
        end = j;
        if (!lines[j].trim().endsWith('\\')) {
          break;
        }
      }
      return { requestStart: i, requestEnd: end };
    }
    if (HTTP_METHOD_LINE.test(text)) {
      requestStart = i;
      break;
    }
  }

  if (requestStart < 0) {
    return null;
  }

  let requestEnd = requestStart;
  for (let i = requestStart + 1; i <= endLine && i < lines.length; i++) {
    const text = lines[i].trim();
    if (text.startsWith('###') || text.startsWith('##') || text.startsWith('/*')) {
      break;
    }
    if (HTTP_METHOD_LINE.test(text)) {
      break;
    }
    requestEnd = i;
  }

  return { requestStart, requestEnd };
}

/**
 * Extracts request text from a block (REST Client or curl), matching executor extraction rules.
 */
export function extractRequestTextFromBlock(
  lines: string[],
  block: Pick<HttpRequestBlock, 'startLine' | 'endLine'>
): string | null {
  const chunk: string[] = [];

  for (let i = block.startLine; i <= block.endLine && i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('###')) {
      break;
    }
    if (!trimmed.startsWith('##')) {
      chunk.push(lines[i].replace(/\\\s*$/, '').trimEnd());
    }
  }

  const joined = chunk
    .map((l) => l.trim())
    .filter((l, idx, arr) => {
      if (l !== '') {
        return true;
      }
      return arr.slice(idx).some((x) => x !== '' && !x.startsWith('/*'));
    })
    .join('\n')
    .trim();

  if (!joined) {
    return null;
  }

  if (joined.toLowerCase().startsWith('curl')) {
    return joined.replace(/\s+/g, ' ').trim();
  }

  const original: string[] = [];
  for (let i = block.startLine; i <= block.endLine && i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('###')) {
      break;
    }
    if (!trimmed.startsWith('##')) {
      original.push(lines[i]);
    }
  }

  return original.join('\n').trim() || null;
}

/**
 * Builds form fields from a block's request content.
 */
export function formFromFileBlock(
  fileContent: string,
  block: Pick<HttpRequestBlock, 'startLine' | 'endLine'>
): HttpRequestFormData {
  const lines = fileContent.split('\n');
  const requestText = extractRequestTextFromBlock(lines, block);
  if (!requestText) {
    return emptyForm();
  }

  const config = parseHttpRequest(requestText);
  if (!config) {
    return emptyForm();
  }

  const headers = Object.entries(config.headers ?? {}).map(([key, value]) => ({
    key,
    value,
  }));

  let body = '';
  if (config.body !== undefined && config.body !== null) {
    body =
      typeof config.body === 'string'
        ? config.body
        : JSON.stringify(config.body, null, 2);
  }

  return {
    method: (config.method ?? 'GET').toUpperCase(),
    url: config.url,
    headers,
    body,
  };
}

/**
 * Serializes form data to REST Client request lines (no section header).
 */
export function serializeRestClientRequest(form: HttpRequestFormData): string {
  const method = (form.method || 'GET').trim().toUpperCase() || 'GET';
  const url = form.url.trim() || 'https://example.com';
  const lines: string[] = [`${method} ${url}`];

  for (const header of form.headers) {
    const key = header.key.trim();
    if (!key) {
      continue;
    }
    lines.push(`${key}: ${header.value}`);
  }

  const body = form.body ?? '';
  if (body.trim()) {
    lines.push('');
    lines.push(body);
  }

  return lines.join('\n');
}

/**
 * Replaces only the request lines inside a block; preserves ## title, comments, and assertions.
 */
export function mergeRequestFormIntoFile(
  fileContent: string,
  block: Pick<HttpRequestBlock, 'startLine' | 'endLine'>,
  form: HttpRequestFormData
): string {
  const lines = fileContent.split('\n');
  const range = findRequestLineRange(lines, block.startLine, block.endLine);
  const newRequestLines = serializeRestClientRequest(form).split('\n');

  if (!range) {
    const insertAt = block.endLine + 1;
    const before = lines.slice(0, insertAt);
    const after = lines.slice(insertAt);
    const merged = [...before, ...newRequestLines, ...after];
    return merged.join('\n');
  }

  const merged = [
    ...lines.slice(0, range.requestStart),
    ...newRequestLines,
    ...lines.slice(range.requestEnd + 1),
  ];
  return merged.join('\n');
}

function emptyForm(): HttpRequestFormData {
  return {
    method: 'GET',
    url: 'https://example.com',
    headers: [{ key: 'Accept', value: 'application/json' }],
    body: '',
  };
}
