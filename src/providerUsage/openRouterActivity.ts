import { OPENROUTER_ACTIVITY_URL } from './constants';
import { mapCreditsHttpStatus, OpenRouterCreditsError } from './openRouterCredits';

export interface OpenRouterActivityItem {
  date: string;
  model: string;
  modelPermaslug: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  usageUsd: number;
}

export interface OpenRouterModelUsage {
  model: string;
  modelPermaslug: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  usageUsd: number;
}

export interface OpenRouterActivitySummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  models: OpenRouterModelUsage[];
}

export interface OpenRouterActivityResponseBody {
  data?: Array<{
    date?: string;
    model?: string;
    model_permaslug?: string;
    requests?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    usage?: number;
  }>;
  error?: {
    message?: string;
  };
}

export function parseOpenRouterActivityItems(body: OpenRouterActivityResponseBody): OpenRouterActivityItem[] {
  if (!Array.isArray(body.data)) {
    throw new OpenRouterCreditsError('invalid_response', 'Activity response missing data array.');
  }

  return body.data
    .filter(
      (row) =>
        typeof row.model === 'string' &&
        typeof row.model_permaslug === 'string' &&
        typeof row.requests === 'number'
    )
    .map((row) => ({
      date: typeof row.date === 'string' ? row.date : '',
      model: row.model as string,
      modelPermaslug: row.model_permaslug as string,
      requests: row.requests as number,
      promptTokens: typeof row.prompt_tokens === 'number' ? row.prompt_tokens : 0,
      completionTokens: typeof row.completion_tokens === 'number' ? row.completion_tokens : 0,
      usageUsd: typeof row.usage === 'number' ? row.usage : 0,
    }));
}

export function aggregateActivityByModel(items: OpenRouterActivityItem[]): OpenRouterActivitySummary {
  const byModel = new Map<string, OpenRouterModelUsage>();

  for (const item of items) {
    const existing = byModel.get(item.modelPermaslug);
    if (existing) {
      existing.requests += item.requests;
      existing.promptTokens += item.promptTokens;
      existing.completionTokens += item.completionTokens;
      existing.usageUsd += item.usageUsd;
      continue;
    }
    byModel.set(item.modelPermaslug, {
      model: item.model,
      modelPermaslug: item.modelPermaslug,
      requests: item.requests,
      promptTokens: item.promptTokens,
      completionTokens: item.completionTokens,
      usageUsd: item.usageUsd,
    });
  }

  const models = [...byModel.values()].sort((a, b) => b.usageUsd - a.usageUsd || b.requests - a.requests);

  return {
    totalRequests: items.reduce((sum, item) => sum + item.requests, 0),
    totalPromptTokens: items.reduce((sum, item) => sum + item.promptTokens, 0),
    totalCompletionTokens: items.reduce((sum, item) => sum + item.completionTokens, 0),
    models,
  };
}

export async function fetchOpenRouterActivity(apiKey: string): Promise<OpenRouterActivitySummary> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new OpenRouterCreditsError('missing_key', 'OpenRouter API key is not configured.');
  }

  let response: Response;
  try {
    response = await fetch(OPENROUTER_ACTIVITY_URL, {
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

  let body: OpenRouterActivityResponseBody;
  try {
    body = JSON.parse(bodyText) as OpenRouterActivityResponseBody;
  } catch {
    throw new OpenRouterCreditsError('invalid_response', 'Invalid JSON from OpenRouter activity API.');
  }

  const items = parseOpenRouterActivityItems(body);
  return aggregateActivityByModel(items);
}
