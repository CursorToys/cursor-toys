import * as vscode from 'vscode';
import { z } from 'zod';
import { fetchConsolidatedUsage } from '../../cursorUsage';
import { refreshSpending } from '../../spendingStatusBar';
import { fetchAllProviderUsage } from '../../providerUsage/usageFetcher';
import { refreshUsageMonitorPanelIfOpen, refreshUsageMonitorStatusBar } from '../../providerUsage';
import { setProviderApiKey, clearProviderApiKey } from '../../providerUsage/secrets';
import type { UsageProviderId } from '../../providerUsage/constants';
import type { McpHostContext } from '../types';

export function buildUsageToolHandlers(
  ctx: McpHostContext
): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    spending_get: async () => {
      const config = vscode.workspace.getConfiguration('cursorToys');
      const manualToken = (config.get<string>('spending.sessionToken', '') || '').trim();
      const data = await fetchConsolidatedUsage(manualToken);
      return {
        planUsage: data?.planUsage ?? null,
        includedRequests: data?.includedRequests ?? null,
        note: 'Session token is never returned',
      };
    },
    spending_refresh: async () => {
      refreshSpending();
      const config = vscode.workspace.getConfiguration('cursorToys');
      const manualToken = (config.get<string>('spending.sessionToken', '') || '').trim();
      const data = await fetchConsolidatedUsage(manualToken);
      return { refreshed: true, planUsage: data?.planUsage ?? null };
    },
    usage_monitor_get: async () => {
      const snapshots = await fetchAllProviderUsage(ctx.extensionContext);
      return {
        providers: snapshots.map((s) => ({
          provider: s.provider,
          configured: s.configured,
          error: s.error,
          openRouter: s.openRouter,
          deepInfra: s.deepInfra,
        })),
      };
    },
    usage_monitor_refresh: async () => {
      refreshUsageMonitorStatusBar();
      await refreshUsageMonitorPanelIfOpen();
      const snapshots = await fetchAllProviderUsage(ctx.extensionContext);
      return { refreshed: true, providers: snapshots.map((s) => s.provider) };
    },
    configure_openrouter_key: async (args) => {
      const apiKey = String(args.apiKey ?? '').trim();
      if (!apiKey) {
        throw new Error('apiKey is required (set only)');
      }
      await setProviderApiKey(ctx.extensionContext, 'openRouter', apiKey);
      return { configured: true, provider: 'openRouter' };
    },
    configure_deepinfra_key: async (args) => {
      const apiKey = String(args.apiKey ?? '').trim();
      if (!apiKey) {
        throw new Error('apiKey is required (set only)');
      }
      await setProviderApiKey(ctx.extensionContext, 'deepInfra', apiKey);
      return { configured: true, provider: 'deepInfra' };
    },
    remove_openrouter_key: async () => {
      await clearProviderApiKey(ctx.extensionContext, 'openRouter' as UsageProviderId);
      return { removed: true };
    },
    remove_deepinfra_key: async () => {
      await clearProviderApiKey(ctx.extensionContext, 'deepInfra' as UsageProviderId);
      return { removed: true };
    },
  };
}

export function buildUsageToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  return [
    { name: 'spending_get', description: 'Get Cursor spending snapshot (no token)', inputSchema: {} },
    { name: 'spending_refresh', description: 'Refresh Cursor spending data', inputSchema: {} },
    { name: 'usage_monitor_get', description: 'Get OpenRouter/DeepInfra usage snapshot', inputSchema: {} },
    { name: 'usage_monitor_refresh', description: 'Refresh usage monitor data', inputSchema: {} },
    {
      name: 'configure_openrouter_key',
      description: 'Set OpenRouter API key (write-only)',
      inputSchema: { apiKey: z.string() },
    },
    {
      name: 'configure_deepinfra_key',
      description: 'Set DeepInfra API key (write-only)',
      inputSchema: { apiKey: z.string() },
    },
    { name: 'remove_openrouter_key', description: 'Remove OpenRouter API key', inputSchema: {} },
    { name: 'remove_deepinfra_key', description: 'Remove DeepInfra API key', inputSchema: {} },
  ];
}
