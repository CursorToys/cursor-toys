import { readLocalCredentials, userIdFromJwt } from './auth';
import {
  getCurrentPeriodUsage,
  getCurrentPeriodUsageWithCookie,
  getUsageSummary,
  getUsageSummaryWithCookie,
} from './api';
import { buildSessionCookieValue } from './headers';
import { logDebug, logWarn } from './logger';
import { consolidateUsage } from './consolidate';
import type { ConsolidatedUsage, CursorCredentials } from './types';

export type {
  ConsolidatedUsage,
  CursorCredentials,
  IncludedRequests,
  OnDemandUsage,
  PlanUsage,
} from './types';
export { getCursorGlobalStoragePath, getStateVscdbPath } from './paths';
export { userIdFromJwt } from './auth';

const CREDENTIALS_CACHE_MS = 5 * 60 * 1000;
const JWT_REGEX = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const COOKIE_SEPARATOR = '%3A%3A';

let cachedCredentials: CursorCredentials | null | undefined;
let cachedCredentialsAt = 0;

/**
 * Reads and caches local Cursor credentials from state.vscdb.
 */
export async function resolveLocalCredentials(): Promise<CursorCredentials | null> {
  const now = Date.now();
  if (cachedCredentials !== undefined && now - cachedCredentialsAt < CREDENTIALS_CACHE_MS) {
    return cachedCredentials;
  }
  cachedCredentials = readLocalCredentials();
  cachedCredentialsAt = now;
  return cachedCredentials;
}

/**
 * Clears in-memory credential cache (e.g. after manual token change).
 */
export function clearCredentialsCache(): void {
  cachedCredentials = undefined;
  cachedCredentialsAt = 0;
}

/**
 * Resolves WorkosCursorSessionToken cookie body from manual setting and/or local DB.
 */
export async function resolveSessionCookieValue(manualToken: string): Promise<string | null> {
  const trimmed = manualToken.trim();
  if (trimmed.includes(COOKIE_SEPARATOR)) {
    return trimmed;
  }
  if (JWT_REGEX.test(trimmed)) {
    const userId = userIdFromJwt(trimmed);
    if (userId) {
      return buildSessionCookieValue(userId, trimmed);
    }
    logWarn('Manual JWT missing sub; cannot build session cookie');
    return null;
  }
  if (trimmed.length > 0) {
    return trimmed;
  }

  const creds = await resolveLocalCredentials();
  if (!creds) {
    return null;
  }
  return buildSessionCookieValue(creds.userId, creds.jwt);
}

function parseCookieToCredentials(cookieValue: string): CursorCredentials | null {
  if (!cookieValue.includes(COOKIE_SEPARATOR)) {
    if (JWT_REGEX.test(cookieValue)) {
      const userId = userIdFromJwt(cookieValue);
      return userId ? { userId, jwt: cookieValue } : null;
    }
    return null;
  }
  const [userId, jwt] = cookieValue.split(COOKIE_SEPARATOR);
  if (!userId || !jwt || !JWT_REGEX.test(jwt)) {
    return null;
  }
  return { userId, jwt };
}

/**
 * Fetches consolidated usage using local or manual session auth.
 */
export async function fetchConsolidatedUsage(
  manualToken?: string
): Promise<ConsolidatedUsage | null> {
  const cookieValue = await resolveSessionCookieValue(manualToken ?? '');
  if (!cookieValue) {
    return null;
  }

  const creds = parseCookieToCredentials(cookieValue);
  let period;
  let summary;

  if (creds) {
    logDebug('Fetching usage with resolved credentials');
    [period, summary] = await Promise.all([
      getCurrentPeriodUsage(creds.userId, creds.jwt),
      getUsageSummary(creds.userId, creds.jwt),
    ]);
  } else {
    [period, summary] = await Promise.all([
      getCurrentPeriodUsageWithCookie(cookieValue),
      getUsageSummaryWithCookie(cookieValue),
    ]);
  }

  const consolidated = consolidateUsage(period, summary);
  if (!consolidated.planUsage && !consolidated.includedRequests) {
    return null;
  }
  return consolidated;
}
