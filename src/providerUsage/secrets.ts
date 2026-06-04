import * as vscode from 'vscode';
import {
  DEEPINFRA_CONFIG,
  OPENROUTER_CONFIG,
  SECRET_DEEPINFRA_KEY,
  SECRET_OPENROUTER_KEY,
  type UsageProviderId,
} from './constants';

function secretKeyFor(provider: UsageProviderId): string {
  return provider === 'openRouter' ? SECRET_OPENROUTER_KEY : SECRET_DEEPINFRA_KEY;
}

export async function getProviderApiKey(
  context: vscode.ExtensionContext,
  provider: UsageProviderId
): Promise<string | null> {
  const value = await context.secrets.get(secretKeyFor(provider));
  if (value?.trim()) {
    return value.trim();
  }
  // Legacy secret from earlier OpenRouter experiment
  if (provider === 'openRouter') {
    const legacy = await context.secrets.get('cursorToys.openRouter.apiKey');
    if (legacy?.trim()) {
      await context.secrets.store(secretKeyFor(provider), legacy.trim());
      return legacy.trim();
    }
  }
  return null;
}

export async function setProviderApiKey(
  context: vscode.ExtensionContext,
  provider: UsageProviderId,
  apiKey: string
): Promise<void> {
  await context.secrets.store(secretKeyFor(provider), apiKey.trim());
}

export async function clearProviderApiKey(
  context: vscode.ExtensionContext,
  provider: UsageProviderId
): Promise<void> {
  await context.secrets.delete(secretKeyFor(provider));
}

export async function hasProviderApiKey(
  context: vscode.ExtensionContext,
  provider: UsageProviderId
): Promise<boolean> {
  return (await getProviderApiKey(context, provider)) !== null;
}

export function providerDisplayName(provider: UsageProviderId): string {
  return provider === 'openRouter' ? 'OpenRouter' : 'DeepInfra';
}

export function configSubKey(provider: UsageProviderId): string {
  return provider === 'openRouter' ? OPENROUTER_CONFIG : DEEPINFRA_CONFIG;
}
