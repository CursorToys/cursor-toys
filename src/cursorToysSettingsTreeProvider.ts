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

const SETTINGS_ITEMS: CursorToysSettingsTreeItem[] = [
  {
    id: 'general',
    label: 'General',
    kind: 'category',
    iconId: 'settings-gear',
    children: [
      {
        id: 'show-menu',
        label: 'Quick Actions Menu',
        kind: 'action',
        iconId: 'list-selection',
        commandId: 'cursor-toys.showMenu',
        description: 'Import, skills, tools',
      },
      {
        id: 'whats-new',
        label: "What's New",
        kind: 'action',
        iconId: 'megaphone',
        commandId: 'cursor-toys.showReleaseNotes',
      },
      {
        id: 'base-folder',
        label: 'Base Folder',
        kind: 'setting',
        iconId: 'folder',
        settingKey: 'cursorToys.baseFolder',
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
        id: 'deepspec-enable',
        label: 'Toggle DeepSpec Panel',
        kind: 'action',
        iconId: 'checklist',
        commandId: 'cursor-toys.settings.toggleDeepspec',
        description: 'Experimental spec-driven tasks',
      },
      {
        id: 'deepspec-setting',
        label: 'DeepSpec Setting',
        kind: 'setting',
        iconId: 'settings',
        settingKey: 'cursorToys.experimental.deepspec',
      },
      {
        id: 'deepspec-initialize',
        label: 'Initialize DeepSpec',
        kind: 'action',
        iconId: 'rocket',
        commandId: 'cursor-toys.deepspec.initialize',
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
];

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

/**
 * Toggles experimental DeepSpec panel visibility.
 */
export async function toggleDeepspecPanelSetting(): Promise<void> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const current = config.get<boolean>('experimental.deepspec', false);
  await config.update('experimental.deepspec', !current, vscode.ConfigurationTarget.Global);
  const label = !current ? 'enabled' : 'disabled';
  void vscode.window.showInformationMessage(`DeepSpec panel ${label}. Reload the window if the view does not update.`);
}
