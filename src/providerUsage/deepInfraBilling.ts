import { DEEPINFRA_CHECKLIST_URL } from './constants';

export interface DeepInfraBilling {
  /** USD credited on account (|stripe_balance| when negative). */
  balanceUsd: number;
  /** USD owed when stripe_balance is positive. */
  owedUsd: number;
  /** Usage since last invoice (USD). */
  recentUsageUsd: number;
  /** USD left to spend: balance minus usage since last invoice. */
  remainingUsd: number;
  /** Spending limit in USD, or null if unlimited. */
  spendingLimitUsd: number | null;
  stripeBalanceRaw: number;
}

export type DeepInfraBillingErrorCode =
  | 'missing_key'
  | 'unauthorized'
  | 'network'
  | 'invalid_response'
  | 'server_error';

export class DeepInfraBillingError extends Error {
  readonly code: DeepInfraBillingErrorCode;

  constructor(code: DeepInfraBillingErrorCode, message: string) {
    super(message);
    this.name = 'DeepInfraBillingError';
    this.code = code;
  }
}

export interface DeepInfraChecklistBody {
  stripe_balance?: number;
  recent?: number;
  limit?: number | null;
  detail?: string | Array<{ msg?: string }>;
}

/**
 * Negative stripe_balance = funds ready to spend (per DeepInfra API docs).
 */
export function parseDeepInfraChecklist(body: DeepInfraChecklistBody): DeepInfraBilling {
  if (typeof body.stripe_balance !== 'number') {
    throw new DeepInfraBillingError('invalid_response', 'Checklist missing stripe_balance.');
  }
  const recentUsageUsd = typeof body.recent === 'number' ? body.recent : 0;
  const raw = body.stripe_balance;
  const balanceUsd = raw < 0 ? -raw : 0;
  const owedUsd = raw > 0 ? raw : 0;
  const spendingLimitUsd = typeof body.limit === 'number' ? body.limit : null;
  const remainingUsd =
    owedUsd > 0 ? 0 : Math.max(0, Math.round((balanceUsd - recentUsageUsd) * 100) / 100);

  return {
    balanceUsd,
    owedUsd,
    recentUsageUsd,
    remainingUsd,
    spendingLimitUsd,
    stripeBalanceRaw: raw,
  };
}

function formatDeepInfraErrorDetail(detail: DeepInfraChecklistBody['detail']): string | undefined {
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d) => d.msg).filter(Boolean).join('; ');
  }
  return undefined;
}

export async function fetchDeepInfraBilling(apiKey: string): Promise<DeepInfraBilling> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new DeepInfraBillingError('missing_key', 'DeepInfra API key is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(DEEPINFRA_CHECKLIST_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${trimmed}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new DeepInfraBillingError('network', message);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    let message = bodyText;
    try {
      const parsed = JSON.parse(bodyText) as DeepInfraChecklistBody;
      const detailMsg = formatDeepInfraErrorDetail(parsed.detail);
      if (detailMsg) {
        message = detailMsg;
      }
    } catch {
      // keep raw
    }
    if (response.status === 401) {
      throw new DeepInfraBillingError('unauthorized', message || 'Unauthorized');
    }
    if (response.status >= 500) {
      throw new DeepInfraBillingError('server_error', message || `Server error (${response.status})`);
    }
    throw new DeepInfraBillingError('invalid_response', message || `Unexpected status ${response.status}`);
  }

  let body: DeepInfraChecklistBody;
  try {
    body = JSON.parse(bodyText) as DeepInfraChecklistBody;
  } catch {
    throw new DeepInfraBillingError('invalid_response', 'Invalid JSON from DeepInfra billing API.');
  }

  return parseDeepInfraChecklist(body);
}
