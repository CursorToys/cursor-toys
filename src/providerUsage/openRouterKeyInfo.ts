import { OPENROUTER_KEY_INFO_URL } from './constants';
import { mapCreditsHttpStatus, OpenRouterCreditsError } from './openRouterCredits';

export interface OpenRouterKeyInfo {
  label: string;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  usage: number;
  usageDaily: number;
  usageWeekly: number;
  usageMonthly: number;
  isFreeTier: boolean;
}

export interface OpenRouterKeyInfoResponseBody {
  data?: {
    label?: string;
    limit?: number | null;
    limit_remaining?: number | null;
    limit_reset?: string | null;
    usage?: number;
    usage_daily?: number;
    usage_weekly?: number;
    usage_monthly?: number;
    is_free_tier?: boolean;
  };
  error?: {
    message?: string;
  };
}

export function parseOpenRouterKeyInfoBody(body: OpenRouterKeyInfoResponseBody): OpenRouterKeyInfo {
  const data = body.data;
  if (!data || typeof data.label !== 'string') {
    throw new OpenRouterCreditsError('invalid_response', 'Key info response missing data fields.');
  }

  return {
    label: data.label,
    limit: typeof data.limit === 'number' ? data.limit : data.limit === null ? null : null,
    limitRemaining:
      typeof data.limit_remaining === 'number'
        ? data.limit_remaining
        : data.limit_remaining === null
          ? null
          : null,
    limitReset: typeof data.limit_reset === 'string' ? data.limit_reset : null,
    usage: typeof data.usage === 'number' ? data.usage : 0,
    usageDaily: typeof data.usage_daily === 'number' ? data.usage_daily : 0,
    usageWeekly: typeof data.usage_weekly === 'number' ? data.usage_weekly : 0,
    usageMonthly: typeof data.usage_monthly === 'number' ? data.usage_monthly : 0,
    isFreeTier: Boolean(data.is_free_tier),
  };
}

export async function fetchOpenRouterKeyInfo(apiKey: string): Promise<OpenRouterKeyInfo> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new OpenRouterCreditsError('missing_key', 'OpenRouter API key is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_KEY_INFO_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${trimmed}`,
        Accept: 'application/json',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new OpenRouterCreditsError('network', message);
  }

  const bodyText = await response.text();
  if (!response.ok) {
    throw mapCreditsHttpStatus(response.status, bodyText);
  }

  let body: OpenRouterKeyInfoResponseBody;
  try {
    body = JSON.parse(bodyText) as OpenRouterKeyInfoResponseBody;
  } catch {
    throw new OpenRouterCreditsError('invalid_response', 'Invalid JSON from OpenRouter key API.');
  }

  return parseOpenRouterKeyInfoBody(body);
}
