import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { z } from 'zod';
import type { McpHostContext } from '../types';

interface SettingProperty {
  key: string;
  description?: string;
  type?: string;
  default?: unknown;
}

function loadCursorToysSettings(extensionPath: string): SettingProperty[] {
  const raw = fs.readFileSync(path.join(extensionPath, 'package.json'), 'utf8');
  const pkg = JSON.parse(raw) as {
    contributes?: { configuration?: Array<{ properties?: Record<string, unknown> }> };
  };
  const properties = pkg.contributes?.configuration?.[0]?.properties ?? {};
  return Object.entries(properties)
    .filter(([key]) => key.startsWith('cursorToys.'))
    .map(([key, meta]) => {
      const m = meta as Record<string, unknown>;
      return {
        key,
        description: m.description as string | undefined,
        type: m.type as string | undefined,
        default: m.default,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function buildSettingsToolHandlers(
  ctx: McpHostContext
): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
  return {
    settings_get: async (args) => {
      const key = String(args.key ?? '').trim();
      if (!key.startsWith('cursorToys.')) {
        throw new Error('key must start with cursorToys.');
      }
      const config = vscode.workspace.getConfiguration('cursorToys');
      const subKey = key.replace(/^cursorToys\./, '');
      const value = config.get(subKey);
      return { key, value };
    },
    settings_set: async (args) => {
      const key = String(args.key ?? '').trim();
      if (!key.startsWith('cursorToys.')) {
        throw new Error('key must start with cursorToys.');
      }
      if (!('value' in args)) {
        throw new Error('value is required');
      }
      const config = vscode.workspace.getConfiguration('cursorToys');
      const subKey = key.replace(/^cursorToys\./, '');
      const target = args.global === true ? vscode.ConfigurationTarget.Global : vscode.ConfigurationTarget.Workspace;
      await config.update(subKey, args.value, target);
      return { key, value: args.value, target: args.global ? 'global' : 'workspace' };
    },
    settings_list: async () => {
      const settings = loadCursorToysSettings(ctx.extensionPath);
      return { count: settings.length, settings };
    },
    settings_configure_keys: async () => {
      await vscode.commands.executeCommand('cursor-toys.settings.configureKeys');
      return { opened: true };
    },
  };
}

export function buildSettingsToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}> {
  return [
    {
      name: 'settings_get',
      description: 'Get effective CursorToys setting value',
      inputSchema: { key: z.string() },
    },
    {
      name: 'settings_set',
      description: 'Set CursorToys setting',
      inputSchema: { key: z.string(), value: z.unknown(), global: z.boolean().optional() },
    },
    { name: 'settings_list', description: 'List all CursorToys settings keys', inputSchema: {} },
    { name: 'settings_configure_keys', description: 'Open API keys configuration wizard', inputSchema: {} },
  ];
}
