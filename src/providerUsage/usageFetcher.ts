import * as vscode from 'vscode';
import { fetchDeepInfraBilling, type DeepInfraBilling } from './deepInfraBilling';
import { fetchOpenRouterCredits, type OpenRouterCredits } from './openRouterCredits';
import { getProviderApiKey } from './secrets';
import type { UsageProviderId } from './constants';

export interface ProviderUsageSnapshot {
  provider: UsageProviderId;
  configured: boolean;
  loading: boolean;
  error?: string;
  openRouter?: OpenRouterCredits;
  deepInfra?: DeepInfraBilling;
}

export async function fetchProviderUsage(
  context: vscode.ExtensionContext,
  provider: UsageProviderId
): Promise<ProviderUsageSnapshot> {
  const apiKey = await getProviderApiKey(context, provider);
  if (!apiKey) {
    return { provider, configured: false, loading: false, error: 'API key not configured' };
  }

  try {
    if (provider === 'openRouter') {
      const openRouter = await fetchOpenRouterCredits(apiKey);
      return { provider, configured: true, loading: false, openRouter };
    }
    const deepInfra = await fetchDeepInfraBilling(apiKey);
    return { provider, configured: true, loading: false, deepInfra };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { provider, configured: true, loading: false, error: message };
  }
}

export async function fetchAllProviderUsage(
  context: vscode.ExtensionContext
): Promise<ProviderUsageSnapshot[]> {
  return Promise.all([
    fetchProviderUsage(context, 'openRouter'),
    fetchProviderUsage(context, 'deepInfra'),
  ]);
}
