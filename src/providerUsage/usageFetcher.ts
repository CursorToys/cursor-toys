import * as vscode from 'vscode';
import { fetchDeepInfraBilling, type DeepInfraBilling } from './deepInfraBilling';
import {
  fetchOpenRouterActivity,
  type OpenRouterActivitySummary,
} from './openRouterActivity';
import { fetchOpenRouterCredits, type OpenRouterCredits } from './openRouterCredits';
import { fetchOpenRouterKeyInfo, type OpenRouterKeyInfo } from './openRouterKeyInfo';
import { getProviderApiKey } from './secrets';
import type { UsageProviderId } from './constants';

export interface OpenRouterDashboard {
  credits: OpenRouterCredits;
  keyInfo?: OpenRouterKeyInfo;
  keyInfoError?: string;
  activity?: OpenRouterActivitySummary;
  activityError?: string;
}

export interface ProviderUsageSnapshot {
  provider: UsageProviderId;
  configured: boolean;
  loading: boolean;
  error?: string;
  openRouter?: OpenRouterCredits;
  openRouterDashboard?: OpenRouterDashboard;
  deepInfra?: DeepInfraBilling;
}

async function fetchOpenRouterDashboard(apiKey: string): Promise<OpenRouterDashboard> {
  const credits = await fetchOpenRouterCredits(apiKey);

  const dashboard: OpenRouterDashboard = { credits };

  const [keyResult, activityResult] = await Promise.allSettled([
    fetchOpenRouterKeyInfo(apiKey),
    fetchOpenRouterActivity(apiKey),
  ]);

  if (keyResult.status === 'fulfilled') {
    dashboard.keyInfo = keyResult.value;
  } else {
    dashboard.keyInfoError =
      keyResult.reason instanceof Error ? keyResult.reason.message : String(keyResult.reason);
  }

  if (activityResult.status === 'fulfilled') {
    dashboard.activity = activityResult.value;
  } else {
    dashboard.activityError =
      activityResult.reason instanceof Error
        ? activityResult.reason.message
        : String(activityResult.reason);
  }

  return dashboard;
}

export async function fetchProviderUsage(
  context: vscode.ExtensionContext,
  provider: UsageProviderId
): Promise<ProviderUsageSnapshot> {
  const apiKey = await getProviderApiKey(context, provider);
  if (!apiKey) {
    return { provider, configured: false, loading: false };
  }

  try {
    if (provider === 'openRouter') {
      const openRouterDashboard = await fetchOpenRouterDashboard(apiKey);
      return {
        provider,
        configured: true,
        loading: false,
        openRouter: openRouterDashboard.credits,
        openRouterDashboard,
      };
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
