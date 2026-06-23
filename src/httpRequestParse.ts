/**
 * Pure HTTP request content parsing (no VS Code dependencies).
 */

export interface HttpRequestConfig {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | object;
}

/**
 * Parses REST Client format (HTTP Request File format).
 */
export function parseRestClientFormat(content: string): HttpRequestConfig | null {
  const trimmed = content.trim();

  const beforeSeparator = trimmed.split('###')[0].trim();
  if (!beforeSeparator) {
    return null;
  }

  const allLines = beforeSeparator.split('\n');
  let requestEndIndex = allLines.length;
  let foundFirstMethod = false;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i].trim();

    if (line.startsWith('#')) {
      continue;
    }

    const isHttpMethod = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+/i.test(line);

    if (isHttpMethod) {
      if (foundFirstMethod) {
        requestEndIndex = i;
        break;
      }
      foundFirstMethod = true;
      continue;
    }

    if (foundFirstMethod) {
      if (line.startsWith('/*') || line.startsWith('##')) {
        requestEndIndex = i;
        break;
      }
    }
  }

  const requestLines = allLines.slice(0, requestEndIndex);
  const firstRequest = requestLines.join('\n').trim();
  if (!firstRequest) {
    return null;
  }

  const rawLines = firstRequest.split('\n');
  const lines = rawLines.map((line) => line.trim());

  if (lines.length === 0) {
    return null;
  }

  let methodLineIndex = -1;
  let method: string | null = null;
  let url: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && !line.startsWith('#')) {
      const methodUrlMatch = line.match(/^(\w+)\s+(.+)$/);
      if (methodUrlMatch) {
        const potentialMethod = methodUrlMatch[1].toUpperCase();
        const potentialUrl = methodUrlMatch[2].trim().replace(/^["']|["']$/g, '');

        if (
          ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'].includes(
            potentialMethod
          ) &&
          (potentialUrl.match(/^https?:\/\//i) || potentialUrl.match(/\{\{/))
        ) {
          methodLineIndex = i;
          method = potentialMethod;
          url = potentialUrl;
          break;
        }
      }
    }
  }

  if (!method || !url || methodLineIndex === -1) {
    return null;
  }

  const headers: Record<string, string> = {};
  let bodyStartIndex = -1;

  for (let i = methodLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (line === '') {
      bodyStartIndex = i + 1;
      break;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const headerKey = line.substring(0, colonIndex).trim();
      const headerValue = line.substring(colonIndex + 1).trim();
      if (headerKey && headerValue) {
        headers[headerKey] = headerValue;
      }
    } else if (!line.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+https?:\/\/.+$/i)) {
      bodyStartIndex = i;
      break;
    }
  }

  let body: string | undefined;
  if (bodyStartIndex >= 0 && bodyStartIndex < rawLines.length) {
    const bodyLines = rawLines.slice(bodyStartIndex);
    body = bodyLines.join('\n').trim();
    if (body === '') {
      body = undefined;
    }
  }

  return {
    method,
    url,
    headers,
    body,
  };
}

export function isRestClientFormat(content: string): boolean {
  const trimmed = content.trim();
  const lines = trimmed.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const methodUrlMatch = trimmedLine.match(
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i
      );
      if (methodUrlMatch) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Collapses line continuations and extra whitespace in a pasted cURL command.
 */
export function normalizeCurlInput(text: string): string {
  return text
    .trim()
    .replace(/\\\r?\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true when the text looks like a cURL command (Postman/Insomnia paste).
 */
export function isCurlCommand(text: string): boolean {
  const normalized = normalizeCurlInput(text);
  return /^curl(\s|$)/i.test(normalized);
}

function parseCurlCommand(curlCommand: string): HttpRequestConfig | null {
  let command = normalizeCurlInput(curlCommand);

  if (command.toLowerCase().startsWith('curl')) {
    command = command.substring(4).trim();
  }

  const urlPatterns = [/['"]https?:\/\/[^'"]+['"]/i, /https?:\/\/[^\s"']+/i];

  let url: string | null = null;
  for (const pattern of urlPatterns) {
    const urlMatch = command.match(pattern);
    if (urlMatch) {
      url = urlMatch[0].replace(/['"]/g, '');
      break;
    }
  }

  if (!url) {
    return null;
  }

  const methodMatch = command.match(/(?:-X|--request)\s+(\w+)/i);

  const headers: Record<string, string> = {};
  const headerRegex = /(?:-H|--header)\s+(["'])((?:(?:\\.|(?!\1)[^\\])*))\1/gi;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(command)) !== null) {
    const headerLine = headerMatch[2];
    const colonIndex = headerLine.indexOf(':');
    if (colonIndex > 0) {
      const key = headerLine.substring(0, colonIndex).trim();
      const value = headerLine.substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }

  let body: string | undefined;
  const bodyPatterns = [
    /(?:--data-raw|--data-binary)\s+(["'])((?:(?:\\.|(?!\1)[^\\])*))\1/i,
    /(?:-d|--data)\s+(["'])((?:(?:\\.|(?!\1)[^\\])*))\1/i,
    /(?:--data-raw|--data-binary)\s+([^\s]+)/i,
    /(?:-d|--data)\s+([^\s]+)/i,
  ];

  for (const pattern of bodyPatterns) {
    const bodyMatch = command.match(pattern);
    if (bodyMatch) {
      body = bodyMatch[2] || bodyMatch[1];
      break;
    }
  }

  let method = methodMatch ? methodMatch[1].toUpperCase() : 'GET';
  if (!methodMatch && body) {
    method = /(?:^|\s)-G(?:\s|$)/i.test(command) ? 'GET' : 'POST';
  }

  return {
    method,
    url,
    headers,
    body,
  };
}

/**
 * Parses HTTP request file content (JSON, REST Client, or cURL).
 */
export function parseHttpRequest(content: string): HttpRequestConfig | null {
  const trimmed = content.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.url) {
        return {
          method: parsed.method || 'GET',
          url: parsed.url,
          headers: parsed.headers || {},
          body: parsed.body,
        };
      }
    } catch {
      // not JSON
    }
  }

  if (isRestClientFormat(trimmed)) {
    const restClientConfig = parseRestClientFormat(trimmed);
    if (restClientConfig) {
      return restClientConfig;
    }
  }

  return parseCurlCommand(trimmed);
}
