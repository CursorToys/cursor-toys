import * as vscode from 'vscode';
import { debounce } from './debounce';
import { isExtensionPausedForSettingsUi } from './settingsUiGuard';

export type CursorToysSettingsItemKind = 'category' | 'action' | 'setting';

export interface CursorToysSettingsTreeItem {
  id: string;
  label: string;
  kind: CursorToysSettingsItemKind;
  description?: string;
  iconId?: string;
  /** VS Code settings query (e.g. cursorToys.baseFolder). */
  settingKey?: string;
  /** Command id for action items. */
  commandId?: string;
  children?: CursorToysSettingsTreeItem[];
}

export const SETTINGS_ITEMS: CursorToysSettingsTreeItem[] = [
  {
    id: 'general',
    label: 'General',
    kind: 'category',
    iconId: 'settings-gear',
    children: [
      {
        id: 'show-menu',
        label: 'CursorToys Command Palette',
        kind: 'action',
        iconId: 'list-selection',
        commandId: 'cursor-toys.showMenu',
        description: 'Ctrl+T / Cmd+T',
      },
      {
        id: 'whats-new',
        label: "What's New",
        kind: 'action',
        iconId: 'megaphone',
        commandId: 'cursor-toys.showReleaseNotes',
      },
      {
        id: 'release-notes-startup',
        label: "Show What's New on startup",
        kind: 'setting',
        iconId: 'megaphone',
        settingKey: 'cursorToys.releaseNotes.showOnStartup',
        description: 'After install or extension update',
      },
      {
        id: 'base-folder',
        label: 'Base Folder',
        kind: 'setting',
        iconId: 'folder',
        settingKey: 'cursorToys.baseFolder',
        description: 'Cursor AI assets (commands, rules, …)',
      },
      {
        id: 'extension-data-folder',
        label: 'Extension Data Folder',
        kind: 'setting',
        iconId: 'archive',
        settingKey: 'cursorToys.extensionDataFolder',
        description: 'Kanban, Notepads (.cursortoys)',
      },
      {
        id: 'link-type',
        label: 'Deeplink Type',
        kind: 'setting',
        iconId: 'link',
        settingKey: 'cursorToys.linkType',
      },
      {
        id: 'custom-base-url',
        label: 'Custom Base URL',
        kind: 'setting',
        iconId: 'globe',
        settingKey: 'cursorToys.customBaseUrl',
        description: 'When link type is custom',
      },
      {
        id: 'allowed-extensions',
        label: 'Allowed Extensions',
        kind: 'setting',
        iconId: 'file-code',
        settingKey: 'cursorToys.allowedExtensions',
        description: 'md, mdc, …',
      },
      {
        id: 'commands-folder',
        label: 'Personal Commands Folder',
        kind: 'setting',
        iconId: 'folder-library',
        settingKey: 'cursorToys.commandsFolder',
        description: 'cursor or claude',
      },
      {
        id: 'configure-keys',
        label: 'Configure API Keys',
        kind: 'action',
        iconId: 'key',
        commandId: 'cursor-toys.settings.configureKeys',
        description: 'Gemini, GitHub',
      },
    ],
  },
  {
    id: 'sidebar',
    label: 'Explorer Sidebar',
    kind: 'category',
    iconId: 'layout-sidebar-left',
    children: [
      {
        id: 'hidden-views',
        label: 'Hidden Sections',
        kind: 'setting',
        iconId: 'eye-closed',
        settingKey: 'cursorToys.sidebar.hiddenViews',
        description: 'Notepads, commands, HTTP, …',
      },
      {
        id: 'explorer-views',
        label: 'Show Also in Explorer',
        kind: 'setting',
        iconId: 'explorer-view-icon',
        settingKey: 'cursorToys.sidebar.explorerViews',
        description: 'Default: skills, plans',
      },
      {
        id: 'personal-commands',
        label: 'Personal Commands Source',
        kind: 'setting',
        iconId: 'terminal',
        settingKey: 'cursorToys.personalCommandsView',
      },
    ],
  },
  {
    id: 'code-anchors',
    label: 'Code Anchors',
    kind: 'category',
    iconId: 'bookmark',
    children: [
      {
        id: 'code-anchors-enabled',
        label: 'Enabled',
        kind: 'setting',
        iconId: 'check',
        settingKey: 'cursorToys.codeAnchors.enabled',
        description: 'Bookmarks on code lines',
      },
      {
        id: 'code-anchors-status-bar',
        label: 'Status Bar Navigation',
        kind: 'setting',
        iconId: 'arrow-both',
        settingKey: 'cursorToys.codeAnchors.showStatusBar',
        description: 'Forward/backward controls',
      },
    ],
  },
  {
    id: 'inline-annotations',
    label: 'Inline Annotations',
    kind: 'category',
    iconId: 'comment-discussion',
    children: [
      {
        id: 'inline-annotations-enabled',
        label: 'Enabled',
        kind: 'setting',
        iconId: 'check',
        settingKey: 'cursorToys.inlineAnnotations.enabled',
        description: 'Index //TODO, ##NOTE, //FIX comments (uppercase in source)',
      },
      {
        id: 'inline-annotations-highlight',
        label: 'Highlight Comments',
        kind: 'setting',
        iconId: 'symbol-color',
        settingKey: 'cursorToys.inlineAnnotations.highlightComments',
        description: 'Color comment lines by tag',
      },
      {
        id: 'inline-annotations-update-on-type',
        label: 'Update While Typing',
        kind: 'setting',
        iconId: 'sync',
        settingKey: 'cursorToys.inlineAnnotations.updateOnType',
        description: 'Debounced index refresh',
      },
      {
        id: 'inline-annotations-scan-include',
        label: 'Scan Include Paths',
        kind: 'setting',
        iconId: 'folder-opened',
        settingKey: 'cursorToys.inlineAnnotations.scanIncludePaths',
        description: 'Globs to scan despite .gitignore',
      },
    ],
  },
  {
    id: 'http',
    label: 'HTTP',
    kind: 'category',
    iconId: 'globe',
    children: [
      {
        id: 'http-timeout',
        label: 'Request Timeout',
        kind: 'setting',
        iconId: 'watch',
        settingKey: 'cursorToys.httpRequestTimeout',
      },
      {
        id: 'http-response-view',
        label: 'Response View',
        kind: 'setting',
        iconId: 'output',
        settingKey: 'cursorToys.httpRequestResponseView',
      },
      {
        id: 'http-compact-mode',
        label: 'Compact Mode',
        kind: 'setting',
        iconId: 'layout',
        settingKey: 'cursorToys.httpRequestEditor.compactMode',
      },
      {
        id: 'http-response-layout',
        label: 'Response Layout',
        kind: 'setting',
        iconId: 'split-horizontal',
        settingKey: 'cursorToys.httpRequestEditor.responseLayout',
      },
      {
        id: 'http-env',
        label: 'Default Environment',
        kind: 'setting',
        iconId: 'layers',
        settingKey: 'cursorToys.httpDefaultEnvironment',
      },
      {
        id: 'http-save-file',
        label: 'Save Response to File',
        kind: 'setting',
        iconId: 'save',
        settingKey: 'cursorToys.httpRequestSaveFile',
      },
      {
        id: 'http-assertions',
        label: 'Assertions',
        kind: 'setting',
        iconId: 'check',
        settingKey: 'cursorToys.httpAssertionsEnabled',
      },
      {
        id: 'http-assertions-inline',
        label: 'Assertions Inline',
        kind: 'setting',
        iconId: 'comment-discussion',
        settingKey: 'cursorToys.httpAssertionsShowInline',
      },
      {
        id: 'http-assertions-fail',
        label: 'Fail on Assertion Error',
        kind: 'setting',
        iconId: 'error',
        settingKey: 'cursorToys.httpAssertionsFailOnError',
      },
    ],
  },
  {
    id: 'chat',
    label: 'Chat',
    kind: 'category',
    iconId: 'comment-discussion',
    children: [
      {
        id: 'chat-auto-submit',
        label: 'Auto-submit on Send to Chat',
        kind: 'setting',
        iconId: 'send',
        settingKey: 'cursorToys.chat.autoSubmit',
        description: 'Paste only when off; you send manually',
      },
    ],
  },
  {
    id: 'secrets',
    label: 'API Keys',
    kind: 'category',
    iconId: 'key',
    children: [
      {
        id: 'gemini-key',
        label: 'Set Gemini API Key',
        kind: 'action',
        iconId: 'sparkle',
        commandId: 'cursor-toys.configureGeminiApiKey',
      },
      {
        id: 'gemini-key-remove',
        label: 'Remove Gemini API Key',
        kind: 'action',
        iconId: 'trash',
        commandId: 'cursor-toys.removeGeminiApiKey',
      },
      {
        id: 'github-token',
        label: 'Set GitHub Token',
        kind: 'action',
        iconId: 'github',
        commandId: 'cursor-toys.configureGitHubToken',
      },
      {
        id: 'github-token-remove',
        label: 'Remove GitHub Token',
        kind: 'action',
        iconId: 'trash',
        commandId: 'cursor-toys.removeGitHubToken',
      },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    kind: 'category',
    iconId: 'sparkle',
    children: [
      {
        id: 'gemini-model',
        label: 'Model',
        kind: 'setting',
        iconId: 'symbol-class',
        settingKey: 'cursorToys.geminiModel',
      },
      {
        id: 'gemini-prompt',
        label: 'Refine Prompt',
        kind: 'setting',
        iconId: 'edit',
        settingKey: 'cursorToys.geminiRefinePrompt',
      },
      {
        id: 'gemini-timeout',
        label: 'Request Timeout',
        kind: 'setting',
        iconId: 'watch',
        settingKey: 'cursorToys.geminiRequestTimeout',
      },
    ],
  },
  {
    id: 'github',
    label: 'GitHub',
    kind: 'category',
    iconId: 'github',
    children: [
      {
        id: 'gist-visibility',
        label: 'Gist Default Visibility',
        kind: 'setting',
        iconId: 'eye',
        settingKey: 'cursorToys.gistDefaultVisibility',
      },
    ],
  },
  {
    id: 'cli',
    label: 'CLI',
    kind: 'category',
    iconId: 'terminal',
    children: [
      {
        id: 'cli-cursortoys-spec',
        label: 'CursorToys Package Spec',
        kind: 'setting',
        iconId: 'package',
        settingKey: 'cursorToys.cli.cursortoysPackageSpec',
        description: 'npx cursortoys@… (default @latest)',
      },
    ],
  },
  {
    id: 'recommendations',
    label: 'Recommendations',
    kind: 'category',
    iconId: 'lightbulb',
    children: [
      {
        id: 'rec-enabled',
        label: 'Enabled',
        kind: 'setting',
        iconId: 'check',
        settingKey: 'cursorToys.recommendationsEnabled',
      },
      {
        id: 'rec-startup',
        label: 'Check on Startup',
        kind: 'setting',
        iconId: 'rocket',
        settingKey: 'cursorToys.recommendationsCheckOnStartup',
      },
      {
        id: 'rec-interval',
        label: 'Suggest Interval (days)',
        kind: 'setting',
        iconId: 'calendar',
        settingKey: 'cursorToys.recommendationsSuggestInterval',
      },
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    kind: 'category',
    iconId: 'mortar-board',
    children: [
      {
        id: 'skills-registry',
        label: 'Registry URL',
        kind: 'setting',
        iconId: 'link',
        settingKey: 'cursorToys.skillsRegistryUrl',
      },
    ],
  },
  {
    id: 'mcp',
    label: 'MCP Server',
    kind: 'category',
    iconId: 'server-environment',
    children: [
      {
        id: 'mcp-enabled',
        label: 'Enable MCP Server',
        kind: 'setting',
        iconId: 'radio-tower',
        settingKey: 'cursorToys.mcp.enabled',
        description: 'Agents control CursorToys via MCP',
      },
      {
        id: 'mcp-auto-register',
        label: 'Auto-register in mcp.json',
        kind: 'setting',
        iconId: 'json',
        settingKey: 'cursorToys.mcp.autoRegister',
        description: '~/.cursor/mcp.json',
      },
      {
        id: 'mcp-open-config',
        label: 'Open Cursor mcp.json',
        kind: 'action',
        iconId: 'go-to-file',
        commandId: 'cursor-toys.mcp.openMcpJson',
        description: 'Global MCP config file',
      },
      {
        id: 'mcp-register-now',
        label: 'Register Server Now',
        kind: 'action',
        iconId: 'add',
        commandId: 'cursor-toys.mcp.registerInCursor',
        description: 'Add cursor-toys entry to mcp.json',
      },
      {
        id: 'mcp-install-skill',
        label: 'Install MCP Skill',
        kind: 'action',
        iconId: 'book',
        commandId: 'cursor-toys.mcp.installSkill',
        description: 'cursor-toys-mcp → skills folder',
      },
      {
        id: 'mcp-allow-destructive',
        label: 'Allow Destructive Without Confirm',
        kind: 'setting',
        iconId: 'warning',
        settingKey: 'cursorToys.mcp.allowDestructiveWithoutConfirm',
        description: 'Not recommended',
      },
      {
        id: 'mcp-disable-clipboard',
        label: 'Disable Clipboard via MCP',
        kind: 'setting',
        iconId: 'clippy',
        settingKey: 'cursorToys.mcp.disableClipboardViaMcp',
      },
      {
        id: 'mcp-audit-log',
        label: 'Audit Log',
        kind: 'setting',
        iconId: 'output',
        settingKey: 'cursorToys.mcp.auditLogEnabled',
        description: '.cursortoys/mcp-audit.log',
      },
      {
        id: 'mcp-port',
        label: 'HTTP Port (reserved)',
        kind: 'setting',
        iconId: 'plug',
        settingKey: 'cursorToys.mcp.port',
        description: '0 = auto; stdio uses IPC',
      },
    ],
  },
  {
    id: 'mcpb',
    label: 'MCPB',
    kind: 'category',
    iconId: 'package',
    children: [
      {
        id: 'mcpb-cli',
        label: 'Use Official CLI',
        kind: 'setting',
        iconId: 'terminal',
        settingKey: 'cursorToys.mcpb.useOfficialCli',
      },
    ],
  },
  {
    id: 'clipboard',
    label: 'Clipboard',
    kind: 'category',
    iconId: 'clippy',
    children: [
      {
        id: 'clipboard-enabled',
        label: 'History Enabled',
        kind: 'setting',
        iconId: 'history',
        settingKey: 'cursorToys.clipboard.enabled',
      },
      {
        id: 'clipboard-bind-keys',
        label: 'Bind Ctrl+C / Ctrl+X',
        kind: 'setting',
        iconId: 'keyboard',
        settingKey: 'cursorToys.clipboard.bindStandardKeys',
        description: 'Capture standard copy/cut keys',
      },
      {
        id: 'clipboard-max-entries',
        label: 'Max History Entries',
        kind: 'setting',
        iconId: 'list-ordered',
        settingKey: 'cursorToys.clipboard.maxEntries',
      },
      {
        id: 'clipboard-sync',
        label: 'Sync with System Clipboard',
        kind: 'setting',
        iconId: 'sync',
        settingKey: 'cursorToys.clipboard.syncWithSystem',
      },
    ],
  },
  {
    id: 'minify',
    label: 'Minify',
    kind: 'category',
    iconId: 'fold',
    children: [
      {
        id: 'minify-comments',
        label: 'Preserve Comments',
        kind: 'setting',
        iconId: 'comment',
        settingKey: 'cursorToys.minify.preserveComments',
      },
      {
        id: 'minify-suffix',
        label: 'Output Suffix',
        kind: 'setting',
        iconId: 'file',
        settingKey: 'cursorToys.minify.outputSuffix',
      },
    ],
  },
  {
    id: 'deepspec',
    label: 'DeepSpec',
    kind: 'category',
    iconId: 'layers-active',
    children: [
      {
        id: 'deepspec-install',
        label: 'Install DeepSpec Extension',
        kind: 'action',
        iconId: 'cloud-download',
        commandId: 'cursor-toys.installDeepSpecExtension',
        description: 'Spec-driven tasks moved to a dedicated extension',
      },
    ],
  },
  {
    id: 'spending',
    label: 'Spending',
    kind: 'category',
    iconId: 'graph',
    children: [
      {
        id: 'spending-enabled',
        label: 'Status Bar Usage',
        kind: 'setting',
        iconId: 'pulse',
        settingKey: 'cursorToys.spending.enabled',
      },
      {
        id: 'spending-token',
        label: 'Configure Session Token',
        kind: 'action',
        iconId: 'key',
        commandId: 'cursor-toys.spending.openTokenSetup',
      },
      {
        id: 'spending-auto-token',
        label: 'Auto-detect Token',
        kind: 'setting',
        iconId: 'search',
        settingKey: 'cursorToys.spending.autoDetectToken',
      },
      {
        id: 'spending-refresh',
        label: 'Refresh Interval',
        kind: 'setting',
        iconId: 'refresh',
        settingKey: 'cursorToys.spending.refreshInterval',
        description: 'Minutes',
      },
    ],
  },
  {
    id: 'usage-monitor',
    label: 'Usage Monitor',
    kind: 'category',
    iconId: 'graph',
    children: [
      {
        id: 'usage-monitor-open',
        label: 'Open Usage Monitor',
        kind: 'action',
        iconId: 'dashboard',
        commandId: 'cursor-toys.usageMonitor.open',
        description: 'OpenRouter & DeepInfra balances',
      },
      {
        id: 'usage-monitor-refresh-interval',
        label: 'Refresh Interval',
        kind: 'setting',
        iconId: 'refresh',
        settingKey: 'cursorToys.usageMonitor.refreshIntervalMinutes',
        description: 'Minutes (status bar)',
      },
      {
        id: 'usage-monitor-openrouter',
        label: 'OpenRouter',
        kind: 'category',
        iconId: 'cloud',
        children: [
          {
            id: 'usage-monitor-or-key',
            label: 'Configure API Key',
            kind: 'action',
            iconId: 'key',
            commandId: 'cursor-toys.usageMonitor.configureOpenRouter',
          },
          {
            id: 'usage-monitor-or-statusbar',
            label: 'Show in Status Bar',
            kind: 'setting',
            iconId: 'pulse',
            settingKey: 'cursorToys.usageMonitor.openRouter.showInStatusBar',
          },
        ],
      },
      {
        id: 'usage-monitor-deepinfra',
        label: 'DeepInfra',
        kind: 'category',
        iconId: 'server',
        children: [
          {
            id: 'usage-monitor-di-key',
            label: 'Configure API Key',
            kind: 'action',
            iconId: 'key',
            commandId: 'cursor-toys.usageMonitor.configureDeepInfra',
          },
          {
            id: 'usage-monitor-di-statusbar',
            label: 'Show in Status Bar',
            kind: 'setting',
            iconId: 'pulse',
            settingKey: 'cursorToys.usageMonitor.deepInfra.showInStatusBar',
          },
        ],
      },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    kind: 'category',
    iconId: 'root-folder-opened',
    children: [
      {
        id: 'projects-enabled',
        label: 'Enable Projects',
        kind: 'setting',
        iconId: 'check',
        settingKey: 'cursorToys.projects.enabled',
        description: 'Workspace launcher sidebar and dashboard',
      },
      {
        id: 'projects-recent-limit',
        label: 'Recent List Limit',
        kind: 'setting',
        iconId: 'history',
        settingKey: 'cursorToys.projects.recentLimit',
      },
      {
        id: 'projects-open-dashboard',
        label: 'Open Projects Dashboard',
        kind: 'action',
        iconId: 'layout',
        commandId: 'cursor-toys.projects.openDashboard',
      },
      {
        id: 'projects-open-new-window',
        label: 'Open in New Window',
        kind: 'setting',
        iconId: 'window',
        settingKey: 'cursorToys.projects.openInNewWindow',
      },
      {
        id: 'projects-dashboard-startup',
        label: 'Open Dashboard on Startup',
        kind: 'setting',
        iconId: 'rocket',
        settingKey: 'cursorToys.projects.openDashboardOnStartup',
      },
    ],
  },
  {
    id: 'kanban',
    label: 'Kanban',
    kind: 'category',
    iconId: 'tasklist',
    children: [
      {
        id: 'kanban-show-statusbar',
        label: 'Show Status Bar Icon',
        kind: 'setting',
        iconId: 'eye',
        settingKey: 'cursorToys.kanban.showStatusBar',
        description: 'Quick access to Kanban board',
      },
    ],
  },
  {
    id: 'cursor-pet',
    label: 'Cursor Pet',
    kind: 'category',
    iconId: 'heart',
    children: [
      {
        id: 'cursor-pet-enabled',
        label: 'Enable Cursor Pet',
        kind: 'setting',
        iconId: 'check',
        settingKey: 'cursorToys.cursorPet.enabled',
        description: 'Companion that hatches from an egg and stays healthy as you use Cursor',
      },
      {
        id: 'cursor-pet-statusbar',
        label: 'Show Pet in Status Bar',
        kind: 'setting',
        iconId: 'pulse',
        settingKey: 'cursorToys.cursorPet.showStatusBar',
        description: 'Live hunger/happiness or incubation progress in the status bar',
      },
      {
        id: 'cursor-pet-open',
        label: 'Open Cursor Pet',
        kind: 'action',
        iconId: 'heart',
        commandId: 'cursor-toys.cursorPet.open',
      },
    ],
  },
  {
    id: 'notepads',
    label: 'Notepads',
    kind: 'category',
    iconId: 'note',
    children: [
      {
        id: 'notepads-show-statusbar',
        label: 'Show Status Bar Icon',
        kind: 'setting',
        iconId: 'eye',
        settingKey: 'cursorToys.notepads.showStatusBar',
        description: 'Focus Notepads sidebar view',
      },
    ],
  },
];

export interface ControlSettingsItem {
  id: string;
  label: string;
  kind: CursorToysSettingsItemKind;
  description?: string;
  commandId?: string;
  settingKey?: string;
  /** Present for kind=setting when resolved from workspace config. */
  settingType?: 'boolean' | 'number' | 'string' | 'array';
  boolValue?: boolean;
  children?: ControlSettingsItem[];
}

/** Settings categories hidden from the Control Config tab (managed elsewhere). */
const CONFIG_EXCLUDED_CATEGORY_IDS = new Set(['spending', 'usage-monitor']);

/**
 * Serializes the settings tree for the Control webview Config tab.
 */
export function toControlSettingsItems(
  items: CursorToysSettingsTreeItem[] = SETTINGS_ITEMS
): ControlSettingsItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    kind: item.kind,
    description: item.description,
    commandId: item.commandId,
    settingKey: item.settingKey,
    children: item.children?.length ? toControlSettingsItems(item.children) : undefined,
  }));
}

function enrichSettingsWithValues(
  items: ControlSettingsItem[],
  cfg: vscode.WorkspaceConfiguration
): ControlSettingsItem[] {
  return items.map((item) => {
    if (item.kind === 'setting' && item.settingKey) {
      const subKey = item.settingKey.replace(/^cursorToys\./, '');
      const inspected = cfg.inspect(subKey);
      let value = cfg.get<unknown>(subKey);
      if (value === undefined && inspected !== undefined) {
        value =
          inspected.globalValue ??
          inspected.workspaceValue ??
          inspected.workspaceFolderValue ??
          inspected.defaultValue;
      }
      const enriched: ControlSettingsItem = { ...item };
      if (typeof value === 'boolean') {
        enriched.settingType = 'boolean';
        enriched.boolValue = value;
      } else if (typeof value === 'number') {
        enriched.settingType = 'number';
      } else if (Array.isArray(value)) {
        enriched.settingType = 'array';
      } else {
        enriched.settingType = 'string';
      }
      return enriched;
    }
    if (item.children?.length) {
      return { ...item, children: enrichSettingsWithValues(item.children, cfg) };
    }
    return item;
  });
}

/**
 * Builds the settings tree for the Control Config tab with live values.
 */
export function buildConfigSettingsItems(
  cfg: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('cursorToys')
): ControlSettingsItem[] {
  const filtered = SETTINGS_ITEMS.filter((item) => !CONFIG_EXCLUDED_CATEGORY_IDS.has(item.id));
  return enrichSettingsWithValues(toControlSettingsItems(filtered), cfg);
}

export interface ControlSettingsAction {
  id: string;
  label: string;
  description?: string;
  commandId: string;
}

/**
 * Flattens settings tree action items for the Control webview.
 */
export function flattenSettingsActions(
  items: CursorToysSettingsTreeItem[] = SETTINGS_ITEMS
): ControlSettingsAction[] {
  const out: ControlSettingsAction[] = [];
  for (const item of items) {
    if (item.kind === 'action' && item.commandId) {
      out.push({
        id: item.id,
        label: item.label,
        description: item.description,
        commandId: item.commandId,
      });
    }
    if (item.children?.length) {
      out.push(...flattenSettingsActions(item.children));
    }
  }
  return out;
}

/**
 * Tree data provider for CursorToys settings shortcuts in the activity bar panel.
 * Does not read workspace configuration during render (avoids feedback loops with Settings UI).
 */
export class CursorToysSettingsTreeProvider implements vscode.TreeDataProvider<CursorToysSettingsTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    CursorToysSettingsTreeItem | undefined | null | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly debouncedFireTreeChange = debounce(() => {
    this._onDidChangeTreeData.fire();
  }, 150);

  refresh(): void {
    if (isExtensionPausedForSettingsUi()) {
      return;
    }
    this.debouncedFireTreeChange();
  }

  getTreeItem(element: CursorToysSettingsTreeItem): vscode.TreeItem {
    const collapsible =
      element.kind === 'category'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None;

    const item = new vscode.TreeItem(element.label, collapsible);
    item.description = element.description;
    item.id = element.id;

    if (element.iconId) {
      item.iconPath = new vscode.ThemeIcon(element.iconId);
    }

    if (element.kind === 'category') {
      item.contextValue = 'cursorToysSettingsCategory';
      return item;
    }

    if (element.kind === 'setting' && element.settingKey) {
      item.contextValue = 'cursorToysSettingsSetting';
      item.command = {
        command: 'cursor-toys.settings.editSetting',
        title: 'Edit Setting',
        arguments: [element.settingKey],
      };
      return item;
    }

    if (element.kind === 'action' && element.commandId) {
      item.contextValue = 'cursorToysSettingsAction';
      item.command = {
        command: element.commandId,
        title: element.label,
      };
      return item;
    }

    return item;
  }

  getChildren(element?: CursorToysSettingsTreeItem): CursorToysSettingsTreeItem[] {
    if (!element) {
      return SETTINGS_ITEMS;
    }
    return element.children ?? [];
  }
}

