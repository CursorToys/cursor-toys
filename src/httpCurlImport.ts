import { isCurlCommand, normalizeCurlInput, parseHttpRequest } from './httpRequestParse';
import type { HttpRequestFormData } from './httpRequestEditorTypes';

/**
 * Converts a pasted cURL command into editor form fields (Postman/Insomnia-style import).
 */
export function curlToFormData(text: string): HttpRequestFormData | null {
  if (!isCurlCommand(text)) {
    return null;
  }

  const config = parseHttpRequest(normalizeCurlInput(text));
  if (!config?.url) {
    return null;
  }

  const headers = Object.entries(config.headers ?? {}).map(([key, value]) => ({
    key,
    value,
  }));

  if (headers.length === 0) {
    headers.push({ key: 'Accept', value: 'application/json' });
  }

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
