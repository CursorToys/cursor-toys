import {
  buildCursorAuthHeaders,
  buildCursorAuthHeadersFromCookie,
} from './headers';
import { logWarn } from './logger';
import type {
  CurrentPeriodUsageResponse,
  FilteredUsageEventsResponse,
  LegacyUsageResponse,
  StripeAuthResponse,
  UsageSummaryResponse,
} from './types';

const API_BASE = 'https://cursor.com';

async function apiFetch<T>(
  path: string,
  init: RequestInit & { headers: Record<string, string> }
): Promise<T | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, init);
    if (response.status === 401 || response.status === 403) {
      logWarn(`API ${path} returned ${response.status}`);
      return null;
    }
    if (!response.ok) {
      logWarn(`API ${path} returned ${response.status}`);
      return null;
    }
    return (await response.json()) as T;
  } catch {
    logWarn(`API ${path} request failed`);
    return null;
  }
}

function authHeaders(
  userId: string,
  jwt: string,
  forPost: boolean
): Record<string, string> {
  return buildCursorAuthHeaders(userId, jwt, { forPost });
}

function cookieHeaders(cookieValue: string, forPost: boolean): Record<string, string> {
  return buildCursorAuthHeadersFromCookie(cookieValue, { forPost });
}

export async function getStripeAuth(
  userId: string,
  jwt: string
): Promise<StripeAuthResponse | null> {
  return apiFetch<StripeAuthResponse>('/api/auth/stripe', {
    method: 'GET',
    headers: authHeaders(userId, jwt, false),
  });
}

export async function getUsageSummary(
  userId: string,
  jwt: string
): Promise<UsageSummaryResponse | null> {
  return apiFetch<UsageSummaryResponse>('/api/usage-summary', {
    method: 'GET',
    headers: authHeaders(userId, jwt, false),
  });
}

export async function getUsage(
  workosUserId: string,
  userId: string,
  jwt: string
): Promise<LegacyUsageResponse | null> {
  return apiFetch<LegacyUsageResponse>(
    `/api/usage?user=${encodeURIComponent(workosUserId)}`,
    {
      method: 'GET',
      headers: authHeaders(userId, jwt, false),
    }
  );
}

export async function getTeamSpend(
  teamId: number,
  userId: string,
  jwt: string
): Promise<unknown | null> {
  return apiFetch(`/api/dashboard/team-spend?teamId=${teamId}`, {
    method: 'GET',
    headers: authHeaders(userId, jwt, false),
  });
}

export async function getDailySpendByCategory(
  userId: string,
  jwt: string
): Promise<unknown | null> {
  return apiFetch('/api/dashboard/daily-spend-by-category', {
    method: 'GET',
    headers: authHeaders(userId, jwt, false),
  });
}

export async function getFilteredUsageEvents(
  userId: string,
  jwt: string,
  body: Record<string, unknown> = {}
): Promise<FilteredUsageEventsResponse | null> {
  return apiFetch<FilteredUsageEventsResponse>('/api/dashboard/get-filtered-usage-events', {
    method: 'POST',
    headers: authHeaders(userId, jwt, true),
    body: JSON.stringify(body),
  });
}

export async function getCurrentPeriodUsage(
  userId: string,
  jwt: string
): Promise<CurrentPeriodUsageResponse | null> {
  return apiFetch<CurrentPeriodUsageResponse>('/api/dashboard/get-current-period-usage', {
    method: 'POST',
    headers: authHeaders(userId, jwt, true),
    body: '{}',
  });
}

export async function getCurrentPeriodUsageWithCookie(
  cookieValue: string
): Promise<CurrentPeriodUsageResponse | null> {
  return apiFetch<CurrentPeriodUsageResponse>('/api/dashboard/get-current-period-usage', {
    method: 'POST',
    headers: cookieHeaders(cookieValue, true),
    body: '{}',
  });
}

export async function getUsageSummaryWithCookie(
  cookieValue: string
): Promise<UsageSummaryResponse | null> {
  return apiFetch<UsageSummaryResponse>('/api/usage-summary', {
    method: 'GET',
    headers: cookieHeaders(cookieValue, false),
  });
}
