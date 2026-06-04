import * as vscode from 'vscode';
import { providerDisplayName, setProviderApiKey } from './secrets';
import type { UsageProviderId } from './constants';

/**
 * Prompts for an API key and stores it in extension SecretStorage (never touches vscdb).
 */
export async function configureProviderApiKey(
  context: vscode.ExtensionContext,
  provider: UsageProviderId
): Promise<boolean> {
  const name = providerDisplayName(provider);
  const apiKey = await vscode.window.showInputBox({
    title: `Configure ${name} API Key`,
    prompt: `Enter your ${name} API key (stored securely in CursorToys)`,
    placeHolder: provider === 'openRouter' ? 'sk-or-v1-…' : '…',
    password: true,
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value?.trim()) {
        return 'API key is required.';
      }
      return undefined;
    },
  });

  if (apiKey === undefined) {
    return false;
  }

  await setProviderApiKey(context, provider, apiKey);
  await vscode.window.showInformationMessage(`CursorToys: ${name} API key saved.`);
  return true;
}
