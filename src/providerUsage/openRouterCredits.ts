import { OPENROUTER_CREDITS_URL } from './constants';

export interface OpenRouterCredits {
  totalCredits: number;
  totalUsage: number;
  remaining: number;
}

export type OpenRouterCreditsErrorCode =
  | 'missing_key'
  | 'unauthorized'
  | 'forbidden'
  | 'network'
  | 'invalid_response'
  | 'server_error';

export class OpenRouterCreditsError extends Error {
  readonly code: OpenRouterCreditsErrorCode;

  constructor(code: OpenRouterCreditsErrorCode, message: string) {
    super(message);
    this.name = 'OpenRouterCreditsError';
    this.code = code;
  }
}

export interface OpenRouterCreditsResponseBody {
  data?: {
    total_credits?: number;
    total_usage?: number;
  };
  error?: {
    message?: string;
  };
}

export function parseOpenRouterCreditsBody(body: OpenRouterCreditsResponseBody): OpenRouterCredits {
  const totalCredits = body.data?.total_credits;
  const totalUsage = body.data?.total_usage;
  if (typeof totalCredits !== 'number' || typeof totalUsage !== 'number') {
    throw new OpenRouterCreditsError('invalid_response', 'Credits response missing data fields.');
  }
  const remaining = Math.max(0, totalCredits - totalUsage);
  return { totalCredits, totalUsage, remaining };
}

export function mapCreditsHttpStatus(status: number, bodyText: string): OpenRouterCreditsError {
  let message = bodyText;
  try {
    const parsed = JSON.parse(bodyText) as OpenRouterCreditsResponseBody;
    if (parsed.error?.message) {
      message = parsed.error.message;
    }
  } catch {
    // keep raw body
  }

  if (status === 401) {
    return new OpenRouterCreditsError('unauthorized', message || 'Unauthorized');
  }
  if (status === 403) {
    return new OpenRouterCreditsError(
      'forbidden',
      message ||
        'Forbidden. Credits may require a management API key (sk-mgmt-…).'
    );
  }
  if (status >= 500) {
    return new OpenRouterCreditsError('server_error', message || `Server error (${status})`);
  }
  return new OpenRouterCreditsError('invalid_response', message || `Unexpected status ${status}`);
}

export async function fetchOpenRouterCredits(apiKey: string): Promise<OpenRouterCredits> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new OpenRouterCreditsError('missing_key', 'OpenRouter API key is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_CREDITS_URL, {
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

  let body: OpenRouterCreditsResponseBody;
  try {
    body = JSON.parse(bodyText) as OpenRouterCreditsResponseBody;
  } catch {
    throw new OpenRouterCreditsError('invalid_response', 'Invalid JSON from OpenRouter credits API.');
  }

  return parseOpenRouterCreditsBody(body);
}
