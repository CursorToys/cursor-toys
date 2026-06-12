/** HTTP request file extensions supported by CursorToys. */
export const HTTP_REQUEST_EXTENSIONS = ['req', 'request', 'http', 'rest'] as const;

export type HttpRequestExtension = (typeof HTTP_REQUEST_EXTENSIONS)[number];

/**
 * Returns true when the extension is a supported HTTP request file type.
 */
export function isHttpRequestExtension(ext: string): boolean {
  return (HTTP_REQUEST_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

/**
 * Maps a request extension to its response sidecar extension.
 */
export function getHttpResponseExtension(requestExt: string): string {
  const ext = requestExt.toLowerCase();
  switch (ext) {
    case 'req':
      return 'res';
    case 'request':
      return 'response';
    case 'http':
      return 'http.res';
    case 'rest':
      return 'rest.res';
    default:
      return 'res';
  }
}
