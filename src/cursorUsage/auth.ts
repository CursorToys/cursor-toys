import { logDebug, logWarn } from './logger';
import { getStateVscdbPath } from './paths';
import { readItemTableValue } from './sqliteFsReader';
import type { CursorCredentials } from './types';

const ACCESS_TOKEN_KEY = 'cursorAuth/accessToken';
const EMAIL_KEY = 'cursorAuth/cachedEmail';
const JWT_REGEX = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const COOKIE_SEPARATOR = '%3A%3A';

/**
 * Extracts WorkOS user id from JWT payload `sub` (no signature verification).
 */
export function userIdFromJwt(jwt: string): string | null {
  const parts = jwt.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const json = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as {
      sub?: string;
    };
    return typeof json.sub === 'string' && json.sub.length > 0 ? json.sub : null;
  } catch {
    return null;
  }
}

function normalizeJwt(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.includes(COOKIE_SEPARATOR)) {
    const jwtPart = trimmed.split(COOKIE_SEPARATOR).pop();
    return jwtPart && JWT_REGEX.test(jwtPart) ? jwtPart : null;
  }
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const token =
        typeof obj.accessToken === 'string'
          ? obj.accessToken
          : typeof obj.token === 'string'
            ? obj.token
            : typeof obj.value === 'string'
              ? obj.value
              : null;
      return token && JWT_REGEX.test(token) ? token : null;
    } catch {
      return null;
    }
  }
  return JWT_REGEX.test(trimmed) ? trimmed : null;
}

/**
 * Reads local Cursor auth from state.vscdb ItemTable.
 */
export function readLocalCredentials(): CursorCredentials | null {
  const dbPath = getStateVscdbPath();
  const rawToken = readItemTableValue(dbPath, ACCESS_TOKEN_KEY);
  if (!rawToken) {
    logDebug('No access token in state.vscdb');
    return null;
  }

  const jwt = normalizeJwt(rawToken);
  if (!jwt) {
    logWarn('accessToken found but JWT could not be parsed');
    return null;
  }

  const userId = userIdFromJwt(jwt);
  if (!userId) {
    logWarn('JWT missing sub claim');
    return null;
  }

  const email = readItemTableValue(dbPath, EMAIL_KEY) ?? undefined;
  logDebug(`Local credentials resolved for user ${userId.slice(0, 12)}…`);
  return { userId, jwt, email };
}
