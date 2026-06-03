import * as vscode from 'vscode';
import { DEFAULT_EXPLORER_SIDEBAR_VIEWS } from './sidebarVisibility';
import { DEFAULT_GEMINI_MODEL, GEMINI_MODEL_OPTIONS } from './geminiModels';

const SIDEBAR_SECTION_OPTIONS = [
  { key: 'notepads', label: 'Notepads' },
  { key: 'kanban', label: 'Kanban' },
  { key: 'clipboard', label: 'Clipboard' },
  { key: 'commands', label: 'Commands' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'plans', label: 'Plans' },
  { key: 'skills', label: 'Skills' },
  { key: 'hooks', label: 'Hooks' },
  { key: 'mcpb', label: 'MCPB' },
  { key: 'http', label: 'HTTP' },
] as const;

const ALLOWED_EXTENSION_OPTIONS = [
  { key: 'md', label: 'Markdown (.md)' },
  { key: 'mdc', label: 'Cursor rules (.mdc)' },
  { key: 'txt', label: 'Text (.txt)' },
  { key: 'json', label: 'JSON (.json)' },
  { key: 'req', label: 'HTTP request (.req)' },
  { key: 'request', label: 'HTTP request (.request)' },
] as const;

async function updateGlobalSetting(key: string, value: unknown): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  await config.update(key, value, vscode.ConfigurationTarget.Global);
}

async function pickBoolean(
  settingKey: string,
  defaultValue: boolean,
  labels?: { on: string; off: string }
): Promise<boolean | undefined> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<boolean>(settingKey, defaultValue);
  const picked = await vscode.window.showQuickPick(
    [
      { label: labels?.on ?? 'Enable', value: true },
      { label: labels?.off ?? 'Disable', value: false },
    ],
    { placeHolder: `Current: ${current ? 'enabled' : 'disabled'}` }
  );
  if (!picked) {
    return undefined;
  }
  await updateGlobalSetting(settingKey, picked.value);
  return picked.value;
}

async function pickNumber(
  settingKey: string,
  defaultValue: number,
  prompt: string,
  validate?: (n: number) => string | null
): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<number>(settingKey, defaultValue);
  const nextRaw = await vscode.window.showInputBox({
    prompt,
    value: String(current),
    validateInput: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        return 'Enter a number';
      }
      if (validate) {
        return validate(n);
      }
      return null;
    },
  });
  if (nextRaw === undefined) {
    return;
  }
  await updateGlobalSetting(settingKey, Number(nextRaw));
}

async function pickString(
  settingKey: string,
  defaultValue: string,
  prompt: string,
  validate?: (v: string) => string | null
): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<string>(settingKey, defaultValue);
  const next = await vscode.window.showInputBox({
    prompt,
    value: current,
    validateInput: validate,
  });
  if (next === undefined) {
    return;
  }
  await updateGlobalSetting(settingKey, next.trim());
}

async function pickMultiSectionKeys(
  settingKey: string,
  defaultValue: readonly string[],
  placeHolder: string
): Promise<void> {
  const config = vscode.workspace.getConfiguration();
  const current = config.get<string[]>(settingKey, [...defaultValue]);

  const picked = await vscode.window.showQuickPick(
    SIDEBAR_SECTION_OPTIONS.map((o) => ({
      label: o.label,
      picked: current.includes(o.key),
      description: o.key,
    })),
    { canPickMany: true, placeHolder }
  );

  if (!picked) {
    return;
  }
  const next = picked.map((p) => p.description!).filter(Boolean);
  await updateGlobalSetting(settingKey, next);
}

async function pickAllowedExtensions(): Promise<void> {
  const settingKey = 'cursorToys.allowedExtensions';
  const config = vscode.workspace.getConfiguration();
  const current = config.get<string[]>(settingKey, ['md', 'mdc']);

  const picked = await vscode.window.showQuickPick(
    ALLOWED_EXTENSION_OPTIONS.map((o) => ({
      label: o.label,
      picked: current.includes(o.key),
      description: o.key,
    })),
    { canPickMany: true, placeHolder: 'Extensions for commands, rules, prompts (md, mdc, …)' }
  );

  if (!picked) {
    return;
  }
  const next = picked.map((p) => p.description!).filter(Boolean);
  await updateGlobalSetting(settingKey, next);
}

/**
 * Edits a CursorToys setting via Quick Pick / Input (no Settings UI).
 */
export async function editCursorToysSetting(settingKey: string): Promise<void> {
  const config = vscode.workspace.getConfiguration();

  switch (settingKey) {
    case 'cursorToys.baseFolder': {
      const current = config.get<string>(settingKey, 'cursor');
      const next = await vscode.window.showInputBox({
        prompt: 'Base folder name (e.g. cursor, vscode, ai)',
        value: current,
        validateInput: (v) => {
          if (!v || !v.trim()) {
            return 'Value cannot be empty';
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(v.trim())) {
            return 'Use only letters, numbers, _ or -';
          }
          return null;
        },
      });
      if (next === undefined) {
        return;
      }
      await updateGlobalSetting(settingKey, next.trim());
      return;
    }

    case 'cursorToys.linkType': {
      const current = config.get<string>(settingKey, 'deeplink');
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'deeplink', description: 'cursor:// protocol' },
          { label: 'web', description: 'https://cursor.com/link/' },
          { label: 'custom', description: 'Uses cursorToys.customBaseUrl' },
        ],
        { placeHolder: `Current: ${current}` }
      );
      if (!picked) {
        return;
      }
      await updateGlobalSetting(settingKey, picked.label);
      return;
    }

    case 'cursorToys.customBaseUrl':
      await pickString(settingKey, '', 'Custom deeplink base URL (when linkType is custom)');
      return;

    case 'cursorToys.allowedExtensions':
      await pickAllowedExtensions();
      return;

    case 'cursorToys.commandsFolder': {
      const current = config.get<string>(settingKey, 'cursor');
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'cursor', description: '.cursor/commands' },
          { label: 'claude', description: '.claude/commands' },
        ],
        { placeHolder: `Current: ${current}` }
      );
      if (!picked) {
        return;
      }
      await updateGlobalSetting(settingKey, picked.label);
      return;
    }

    case 'cursorToys.sidebar.hiddenViews':
      await pickMultiSectionKeys(settingKey, [], 'Select sections to hide in the sidebar');
      return;

    case 'cursorToys.sidebar.explorerViews':
      await pickMultiSectionKeys(
        settingKey,
        DEFAULT_EXPLORER_SIDEBAR_VIEWS,
        'Select sections to also show in the Explorer'
      );
      return;

    case 'cursorToys.personalCommandsView': {
      const current = config.get<string>(settingKey, 'both');
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'both', description: 'Show .cursor and .claude' },
          { label: 'cursor', description: 'Show .cursor only' },
          { label: 'claude', description: 'Show .claude only' },
        ],
        { placeHolder: `Current: ${current}` }
      );
      if (!picked) {
        return;
      }
      await updateGlobalSetting(settingKey, picked.label);
      return;
    }

    case 'cursorToys.httpRequestTimeout':
      await pickNumber(settingKey, 10, 'HTTP request timeout (seconds)', (n) =>
        n <= 0 ? 'Must be > 0' : null
      );
      return;

    case 'cursorToys.httpRequestSaveFile':
      await pickBoolean(settingKey, false);
      return;

    case 'cursorToys.httpRequestResponseView': {
      const current = config.get<string>(settingKey, 'panel');
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'panel', description: 'Reusable response panel' },
          { label: 'editor', description: 'Open each response in editor' },
        ],
        { placeHolder: `Current: ${current}` }
      );
      if (!picked) {
        return;
      }
      await updateGlobalSetting(settingKey, picked.label);
      return;
    }

    case 'cursorToys.httpAssertionsEnabled':
      await pickBoolean(settingKey, true);
      return;

    case 'cursorToys.httpAssertionsShowInline':
      await pickBoolean(settingKey, true);
      return;

    case 'cursorToys.httpAssertionsFailOnError':
      await pickBoolean(settingKey, false);
      return;

    case 'cursorToys.httpDefaultEnvironment':
      await pickString(settingKey, 'dev', 'Default HTTP environment name', (v) =>
        !v || !v.trim() ? 'Value cannot be empty' : null
      );
      return;

    case 'cursorToys.geminiModel': {
      const current = config.get<string>(settingKey, DEFAULT_GEMINI_MODEL);
      const picked = await vscode.window.showQuickPick(
        GEMINI_MODEL_OPTIONS.map((option) => ({
          label: option.id,
          description: option.label,
        })),
        { placeHolder: `Current: ${current}` }
      );
      if (!picked) {
        return;
      }
      await updateGlobalSetting(settingKey, picked.label);
      return;
    }

    case 'cursorToys.cli.cursortoysPackageSpec':
      await pickString(settingKey, '@latest', 'CursorToys CLI npm spec (e.g. @latest, 2026.5.30)', (v) => {
        const trimmed = v.trim();
        if (!trimmed) {
          return 'Value cannot be empty';
        }
        if (/\s/.test(trimmed)) {
          return 'Must not contain spaces';
        }
        return null;
      });
      return;

    case 'cursorToys.geminiRefinePrompt':
      await pickString(
        settingKey,
        'You must return ONLY the refined text, nothing else.\n\nFix typos, improve clarity, and enhance the flow of the following text:',
        'Gemini refine prompt template (paste full prompt)'
      );
      return;

    case 'cursorToys.geminiRequestTimeout':
      await pickNumber(settingKey, 30, 'Gemini API timeout (seconds)', (n) =>
        n <= 0 ? 'Must be > 0' : null
      );
      return;

    case 'cursorToys.gistDefaultVisibility': {
      const current = config.get<string>(settingKey, 'ask');
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'ask', description: 'Ask each time' },
          { label: 'public', description: 'Always public gists' },
          { label: 'private', description: 'Always private gists' },
        ],
        { placeHolder: `Current: ${current}` }
      );
      if (!picked) {
        return;
      }
      await updateGlobalSetting(settingKey, picked.label);
      return;
    }

    case 'cursorToys.recommendationsEnabled':
      await pickBoolean(settingKey, true, { on: 'Enable recommendations', off: 'Disable recommendations' });
      return;

    case 'cursorToys.recommendationsCheckOnStartup':
      await pickBoolean(settingKey, true, {
        on: 'Check on workspace open',
        off: 'Skip startup check',
      });
      return;

    case 'cursorToys.recommendationsSuggestInterval':
      await pickNumber(settingKey, 7, 'Days between recommendation prompts', (n) =>
        n < 1 ? 'Minimum 1 day' : null
      );
      return;

    case 'cursorToys.skillsRegistryUrl':
      await pickString(
        settingKey,
        'https://raw.githubusercontent.com/tech-leads-club/agent-skills/refs/heads/main/packages/skills-catalog/skills-registry.json',
        'Agent Skills registry URL'
      );
      return;

    case 'cursorToys.mcpb.useOfficialCli':
      await pickBoolean(settingKey, true, {
        on: 'Use official MCPB CLI (npx)',
        off: 'Built-in unpack only',
      });
      return;

    case 'cursorToys.clipboard.enabled':
      await pickBoolean(settingKey, true, {
        on: 'Enable clipboard history',
        off: 'Disable clipboard history',
      });
      return;

    case 'cursorToys.clipboard.bindStandardKeys':
      await pickBoolean(settingKey, true, {
        on: 'Ctrl+C / Ctrl+X add to history',
        off: 'Use palette commands only',
      });
      return;

    case 'cursorToys.clipboard.maxEntries':
      await pickNumber(settingKey, 30, 'Max clipboard history entries', (n) => {
        if (n < 1) {
          return 'Minimum 1';
        }
        if (n > 200) {
          return 'Maximum 200';
        }
        return null;
      });
      return;

    case 'cursorToys.clipboard.maxEntryChars':
      await pickNumber(settingKey, 100_000, 'Max characters per history entry', (n) =>
        n < 100 ? 'Minimum 100' : null
      );
      return;

    case 'cursorToys.clipboard.syncWithSystem':
      await pickBoolean(settingKey, true, {
        on: 'Sync picks to system clipboard',
        off: 'Do not update system clipboard on paste',
      });
      return;

    case 'cursorToys.clipboard.previewChars':
      await pickNumber(settingKey, 80, 'Quick Pick preview length', (n) => {
        if (n < 20) {
          return 'Minimum 20';
        }
        if (n > 500) {
          return 'Maximum 500';
        }
        return null;
      });
      return;

    case 'cursorToys.minify.preserveComments':
      await pickBoolean(settingKey, false);
      return;

    case 'cursorToys.minify.outputSuffix':
      await pickString(settingKey, '.min', 'Minified file suffix (e.g. .min)');
      return;

    case 'cursorToys.spending.enabled':
      await pickBoolean(settingKey, true, {
        on: 'Show usage in status bar',
        off: 'Hide spending indicator',
      });
      return;

    case 'cursorToys.spending.autoDetectToken':
      await pickBoolean(settingKey, true, {
        on: 'Auto-detect from Cursor state.vscdb',
        off: 'Manual session token only',
      });
      return;

    case 'cursorToys.spending.refreshInterval':
      await pickNumber(settingKey, 20, 'Spending refresh interval (minutes)', (n) => {
        if (n < 1) {
          return 'Minimum 1 minute';
        }
        if (n > 1440) {
          return 'Maximum 1440 minutes (24h)';
        }
        return null;
      });
      return;

    case 'cursorToys.codeAnchors.enabled':
      await pickBoolean(settingKey, true, {
        on: 'Enable code anchors',
        off: 'Disable code anchors',
      });
      return;

    case 'cursorToys.codeAnchors.showStatusBar':
      await pickBoolean(settingKey, true, {
        on: 'Show status bar navigation',
        off: 'Hide status bar navigation',
      });
      return;

    case 'cursorToys.kanban.showStatusBar':
      await pickBoolean(settingKey, false, {
        on: 'Show Kanban icon in status bar',
        off: 'Hide Kanban icon from status bar',
      });
      return;

    default:
      void vscode.window.showWarningMessage(
        `Unknown setting "${settingKey}". Use the items in the CursorToys Settings tree to edit options.`
      );
  }
}
