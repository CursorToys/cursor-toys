const DASHBOARD_ORIGIN = 'https://cursor.com';
const DASHBOARD_REFERER = 'https://cursor.com/dashboard?tab=spending';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.2 Safari/605.1.15';

/**
 * Full WorkosCursorSessionToken cookie value (userId%3A%3Ajwt).
 */
export function buildSessionCookieValue(userId: string, jwt: string): string {
  return `${userId}%3A%3A${jwt}`;
}

/**
 * Headers for cursor.com dashboard API calls.
 */
export function buildCursorAuthHeaders(
  userId: string,
  jwt: string,
  options?: { forPost?: boolean }
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent': USER_AGENT,
    Cookie: `WorkosCursorSessionToken=${buildSessionCookieValue(userId, jwt)}`,
  };
  if (options?.forPost) {
    headers['Content-Type'] = 'application/json';
    headers.Origin = DASHBOARD_ORIGIN;
    headers.Referer = DASHBOARD_REFERER;
  }
  return headers;
}

/**
 * Builds headers when the cookie value is already the full WorkosCursorSessionToken body.
 */
export function buildCursorAuthHeadersFromCookie(
  cookieValue: string,
  options?: { forPost?: boolean }
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'User-Agent': USER_AGENT,
    Cookie: `WorkosCursorSessionToken=${cookieValue}`,
  };
  if (options?.forPost) {
    headers['Content-Type'] = 'application/json';
    headers.Origin = DASHBOARD_ORIGIN;
    headers.Referer = DASHBOARD_REFERER;
  }
  return headers;
}
