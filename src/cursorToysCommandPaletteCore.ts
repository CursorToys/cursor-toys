export interface CursorToysMenuItem {
  id: string;
  label: string;
  description: string;
  detail: string;
  commandId: string;
}

interface MenuUsageRecord {
  count: number;
  lastUsed: number;
}

export type MenuUsageMap = Record<string, MenuUsageRecord>;

/** Default menu entries for the CursorToys Command Palette. */
export const CURSOR_TOYS_MENU_ITEMS: readonly CursorToysMenuItem[] = [
  {
    id: 'whats-new',
    label: "$(megaphone) What's New",
    description: 'View release notes and changelog',
    detail: 'Release notes',
    commandId: 'cursor-toys.showReleaseNotes',
  },
  {
    id: 'import-url',
    label: '$(cloud-download) Import from URL',
    description: 'Import command, prompt or rule from deeplink or Gist',
    detail: 'Import',
    commandId: 'cursor-toys.import',
  },
  {
    id: 'install-mcpb',
    label: '$(package) Install MCPB',
    description: 'Install MCP server from .mcpb package',
    detail: 'MCP',
    commandId: 'cursor-toys.installMcpb',
  },
  {
    id: 'new-notepad',
    label: '$(note) New Notepad',
    description: 'Create a new notepad for quick notes',
    detail: 'Notepads',
    commandId: 'cursor-toys.createNotepad',
  },
  {
    id: 'create-skill',
    label: '$(sparkle) Create Skill',
    description: 'Create a new skill template',
    detail: 'Skills',
    commandId: 'cursor-toys.createSkill',
  },
  {
    id: 'add-skill-remote',
    label: '$(repo-clone) Add Skill Remote',
    description: 'Discover and import skills from a GitHub repository URL',
    detail: 'Skills',
    commandId: 'cursor-toys.addSkillRemote',
  },
  {
    id: 'minify-file',
    label: '$(file-zip) Minify File',
    description: 'Minify current file (JSON, HTML, CSS, JS, etc)',
    detail: 'Tools',
    commandId: 'cursor-toys.minifyFile',
  },
  {
    id: 'trim-clipboard',
    label: '$(clippy) Trim Clipboard',
    description: 'Trim and minify clipboard content',
    detail: 'Tools',
    commandId: 'cursor-toys.trimClipboard',
  },
  {
    id: 'spending-refresh',
    label: '$(refresh) Refresh spending usage',
    description: 'Refresh Cursor API usage in status bar',
    detail: 'Spending',
    commandId: 'cursor-toys.spending.refresh',
  },
  {
    id: 'spending-token',
    label: '$(key) Configure spending token',
    description: 'Set session token for spending indicator',
    detail: 'Spending',
    commandId: 'cursor-toys.spending.openTokenSetup',
  },
  {
    id: 'open-kanban',
    label: '$(tasklist) Open Kanban Board',
    description: 'Open the Kanban board',
    detail: 'Kanban',
    commandId: 'cursor-toys.openKanbanBoard',
  },
  {
    id: 'focus-notepads',
    label: '$(note) Focus Notepads',
    description: 'Open the Notepads sidebar view',
    detail: 'Notepads',
    commandId: 'cursor-toys.focusNotepads',
  },
  {
    id: 'open-usage-monitor',
    label: '$(graph) Open Usage Monitor',
    description: 'OpenRouter and DeepInfra usage dashboard',
    detail: 'Usage Monitor',
    commandId: 'cursor-toys.usageMonitor.open',
  },
];

/**
 * Sorts menu items by usage count (desc), then last used (desc), then default order.
 */
export function sortMenuItemsByUsage(
  items: readonly CursorToysMenuItem[],
  usage: MenuUsageMap
): CursorToysMenuItem[] {
  const defaultOrder = new Map(items.map((item, index) => [item.id, index]));

  return [...items].sort((a, b) => {
    const ua = usage[a.id];
    const ub = usage[b.id];
    const countA = ua?.count ?? 0;
    const countB = ub?.count ?? 0;

    if (countA !== countB) {
      return countB - countA;
    }

    const lastA = ua?.lastUsed ?? 0;
    const lastB = ub?.lastUsed ?? 0;
    if (lastA !== lastB) {
      return lastB - lastA;
    }

    return (defaultOrder.get(a.id) ?? 0) - (defaultOrder.get(b.id) ?? 0);
  });
}
