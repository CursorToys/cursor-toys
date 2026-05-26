import * as vscode from 'vscode';

/** Resource keys matching `cursorToys.sidebar.hiddenViews` enum items. */
export type SidebarResourceKey =
  | 'notepads'
  | 'commands'
  | 'prompts'
  | 'plans'
  | 'skills'
  | 'hooks'
  | 'mcpb';

export const ALL_SIDEBAR_RESOURCE_KEYS: readonly SidebarResourceKey[] = [
  'notepads',
  'commands',
  'prompts',
  'plans',
  'skills',
  'hooks',
  'mcpb',
] as const;

const SIDEBAR_RESOURCE_KEY_SET = new Set<string>(ALL_SIDEBAR_RESOURCE_KEYS);

/** VS Code context keys used in `package.json` view `when` clauses. */
const VISIBILITY_CONTEXT_KEYS: Record<SidebarResourceKey, string> = {
  notepads: 'cursorToys.sidebar.notepadsVisible',
  commands: 'cursorToys.sidebar.commandsVisible',
  prompts: 'cursorToys.sidebar.promptsVisible',
  plans: 'cursorToys.sidebar.plansVisible',
  skills: 'cursorToys.sidebar.skillsVisible',
  hooks: 'cursorToys.sidebar.hooksVisible',
  mcpb: 'cursorToys.sidebar.mcpbVisible',
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
