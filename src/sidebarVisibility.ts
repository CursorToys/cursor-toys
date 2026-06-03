import * as vscode from 'vscode';

/** Resource keys matching `cursorToys.sidebar.hiddenViews` enum items. */
export type SidebarResourceKey =
  | 'notepads'
  | 'kanban'
  | 'clipboard'
  | 'commands'
  | 'prompts'
  | 'plans'
  | 'skills'
  | 'hooks'
  | 'mcpb'
  | 'http';

/** Default sections duplicated in the Explorer sidebar (Files) on first install. */
export const DEFAULT_EXPLORER_SIDEBAR_VIEWS: readonly SidebarResourceKey[] = ['skills', 'plans'] as const;

export const ALL_SIDEBAR_RESOURCE_KEYS: readonly SidebarResourceKey[] = [
  'notepads',
  'kanban',
  'clipboard',
  'commands',
  'prompts',
  'plans',
  'skills',
  'hooks',
  'mcpb',
  'http',
] as const;

const SIDEBAR_RESOURCE_KEY_SET = new Set<string>(ALL_SIDEBAR_RESOURCE_KEYS);

/** VS Code context keys used in `package.json` view `when` clauses. */
const VISIBILITY_CONTEXT_KEYS: Record<SidebarResourceKey, string> = {
  notepads: 'cursorToys.sidebar.notepadsVisible',
  kanban: 'cursorToys.sidebar.kanbanVisible',
  clipboard: 'cursorToys.sidebar.clipboardVisible',
  commands: 'cursorToys.sidebar.commandsVisible',
  prompts: 'cursorToys.sidebar.promptsVisible',
  plans: 'cursorToys.sidebar.plansVisible',
  skills: 'cursorToys.sidebar.skillsVisible',
  hooks: 'cursorToys.sidebar.hooksVisible',
  mcpb: 'cursorToys.sidebar.mcpbVisible',
  http: 'cursorToys.sidebar.httpVisible',
};

/** VS Code context keys to optionally show views in Explorer. */
const EXPLORER_CONTEXT_KEYS: Record<SidebarResourceKey, string> = {
  notepads: 'cursorToys.explorer.notepadsVisible',
  kanban: 'cursorToys.explorer.kanbanVisible',
  clipboard: 'cursorToys.explorer.clipboardVisible',
  commands: 'cursorToys.explorer.commandsVisible',
  prompts: 'cursorToys.explorer.promptsVisible',
  plans: 'cursorToys.explorer.plansVisible',
  skills: 'cursorToys.explorer.skillsVisible',
  hooks: 'cursorToys.explorer.hooksVisible',
  mcpb: 'cursorToys.explorer.mcpbVisible',
  http: 'cursorToys.explorer.httpVisible',
};

/**
 * Reads and normalizes `cursorToys.sidebar.hiddenViews` (lowercase, known keys only).
 */
export function getHiddenSidebarViews(): SidebarResourceKey[] {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const raw = config.get<unknown>('sidebar.hiddenViews', []);
  if (!Array.isArray(raw)) {
    return [];
  }
  const hidden: SidebarResourceKey[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue;
    }
    const key = item.trim().toLowerCase();
    if (SIDEBAR_RESOURCE_KEY_SET.has(key) && !hidden.includes(key as SidebarResourceKey)) {
      hidden.push(key as SidebarResourceKey);
    }
  }
  return hidden;
}

/**
 * Returns whether a sidebar resource view is configured as hidden.
 */
export function isSidebarResourceHidden(key: SidebarResourceKey): boolean {
  return getHiddenSidebarViews().includes(key);
}

/**
 * Updates VS Code context keys so explorer views show or hide per settings.
 */
export async function syncSidebarViewVisibility(): Promise<void> {
  const hidden = new Set(getHiddenSidebarViews());
  for (const key of ALL_SIDEBAR_RESOURCE_KEYS) {
    const visible = !hidden.has(key);
    await vscode.commands.executeCommand('setContext', VISIBILITY_CONTEXT_KEYS[key], visible);
  }
}

/**
 * Reads and normalizes `cursorToys.sidebar.explorerViews` (lowercase, known keys only).
 */
export function getExplorerSidebarViews(): SidebarResourceKey[] {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const raw = config.get<unknown>('sidebar.explorerViews', [...DEFAULT_EXPLORER_SIDEBAR_VIEWS]);
  if (!Array.isArray(raw)) {
    return [];
  }
  const enabled: SidebarResourceKey[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') {
      continue;
    }
    const key = item.trim().toLowerCase();
    if (SIDEBAR_RESOURCE_KEY_SET.has(key) && !enabled.includes(key as SidebarResourceKey)) {
      enabled.push(key as SidebarResourceKey);
    }
  }
  return enabled;
}

/**
 * Updates VS Code context keys so resource views can also be shown in Explorer.
 * A view must be visible AND enabled in explorerViews.
 */
export async function syncExplorerViewVisibility(): Promise<void> {
  const enabled = new Set(getExplorerSidebarViews());
  const hidden = new Set(getHiddenSidebarViews());

  for (const key of ALL_SIDEBAR_RESOURCE_KEYS) {
    const visible = !hidden.has(key);
    const showInExplorer = visible && enabled.has(key);
    await vscode.commands.executeCommand('setContext', EXPLORER_CONTEXT_KEYS[key], showInExplorer);
  }
}
