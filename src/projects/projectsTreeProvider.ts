import * as vscode from 'vscode';
import { ProjectEntry } from './types';
import { ProjectRegistry } from './projectRegistry';
import { isProjectsEnabled } from './projectsConfig';

export type ProjectsTreeElement =
  | { kind: 'section'; id: string; label: string }
  | { kind: 'category'; id: string; label: string }
  | { kind: 'project'; entry: ProjectEntry }
  | { kind: 'action'; id: string; label: string; commandId: string; description?: string }
  | { kind: 'hint'; id: string; label: string };

function formatRelativeOpened(iso: string): string {
  const opened = new Date(iso).getTime();
  if (Number.isNaN(opened)) {
    return '';
  }
  const diffMs = Date.now() - opened;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function colorThemeIcon(color?: ProjectEntry['color']): vscode.ThemeIcon {
  if (!color) {
    return new vscode.ThemeIcon('folder');
  }
  const colorMap: Record<string, string> = {
    blue: 'symbol-color',
    green: 'pass-filled',
    orange: 'flame',
    purple: 'symbol-misc',
    red: 'error',
    teal: 'debug-alt',
    yellow: 'star-full',
    gray: 'circle-outline',
  };
  return new vscode.ThemeIcon(colorMap[color] ?? 'folder');
}

export class ProjectsTreeProvider implements vscode.TreeDataProvider<ProjectsTreeElement> {
  private readonly changeEmitter = new vscode.EventEmitter<ProjectsTreeElement | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly registry: ProjectRegistry) {}

  refresh(): void {
    this.changeEmitter.fire(undefined);
  }

  getTreeItem(element: ProjectsTreeElement): vscode.TreeItem {
    if (element.kind === 'section') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = element.id;
      return item;
    }
    if (element.kind === 'category') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Expanded);
      item.id = element.id;
      item.contextValue = 'projectsCategory';
      return item;
    }
    if (element.kind === 'action' || element.kind === 'hint') {
      const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      item.id = element.id;
      if (element.kind === 'action') {
        item.command = { command: element.commandId, title: element.label };
      }
      if (element.kind === 'action') {
        item.description = element.description;
      }
      item.iconPath = new vscode.ThemeIcon(
        element.kind === 'action' ? 'add' : 'info'
      );
      return item;
    }

    const { entry } = element;
    const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
    item.id = entry.id;
    item.description = formatRelativeOpened(entry.lastOpenedAt);
    item.tooltip = `${entry.path}${entry.notes ? `\n\n${entry.notes}` : ''}`;
    item.iconPath = colorThemeIcon(entry.color);
    item.contextValue = entry.pinned ? 'projectsPinnedItem' : 'projectsRecentItem';
    item.command = {
      command: 'cursor-toys.projects.open',
      title: 'Open Project',
      arguments: [entry],
    };
    return item;
  }

  async getChildren(element?: ProjectsTreeElement): Promise<ProjectsTreeElement[]> {
    if (!isProjectsEnabled()) {
      return [
        {
          kind: 'hint',
          id: 'disabled',
          label: 'Enable Projects in CursorToys Settings',
        },
      ];
    }

    if (!element) {
      return this.buildRoot();
    }

    if (element.kind === 'section') {
      return this.buildSectionChildren(element.id);
    }

    if (element.kind === 'category') {
      const group = this.registry
        .getPinnedByCategory()
        .find((item) => `category:${item.category}` === element.id);
      return (group?.entries ?? []).map((entry) => ({ kind: 'project' as const, entry }));
    }

    return [];
  }

  private buildRoot(): ProjectsTreeElement[] {
    const snapshot = this.registry.getSnapshot();
    const hasEntries = snapshot.pinned.length > 0 || snapshot.recent.length > 0;
    const items: ProjectsTreeElement[] = [
      {
        kind: 'action',
        id: 'pin-current',
        label: 'Pin Current Workspace',
        commandId: 'cursor-toys.projects.pinCurrent',
      },
      {
        kind: 'action',
        id: 'add-folder',
        label: 'Add Project from Folder…',
        commandId: 'cursor-toys.projects.addFromFolder',
      },
      {
        kind: 'action',
        id: 'open-dashboard',
        label: 'Open Projects Dashboard',
        commandId: 'cursor-toys.projects.openDashboard',
      },
    ];

    if (!hasEntries) {
      items.push({
        kind: 'hint',
        id: 'empty-hint',
        label: 'Pin workspaces to see them here',
      });
      return items;
    }

    items.push({ kind: 'section', id: 'pinned', label: 'Pinned' });
    if (this.registry.getPinnedByCategory().some((group) => group.category !== 'Uncategorized')) {
      items.push({ kind: 'section', id: 'categories', label: 'Categories' });
    }
    items.push({ kind: 'section', id: 'recent', label: 'Recent' });
    return items;
  }

  private buildSectionChildren(sectionId: string): ProjectsTreeElement[] {
    if (sectionId === 'pinned') {
      const uncategorized = this.registry
        .getPinned()
        .filter((entry) => !entry.category?.trim())
        .sort((a, b) => a.label.localeCompare(b.label));
      if (uncategorized.length === 0) {
        return [
          {
            kind: 'hint',
            id: 'pinned-empty',
            label: 'Pinned items with categories appear under Categories',
          },
        ];
      }
      return uncategorized.map((entry) => ({ kind: 'project' as const, entry }));
    }

    if (sectionId === 'categories') {
      return this.registry
        .getPinnedByCategory()
        .filter((group) => group.category !== 'Uncategorized')
        .map((group) => ({
          kind: 'category' as const,
          id: `category:${group.category}`,
          label: group.category,
        }));
    }

    if (sectionId === 'recent') {
      const recent = this.registry.getRecent();
      if (recent.length === 0) {
        return [{ kind: 'hint', id: 'recent-empty', label: 'No recent workspaces yet' }];
      }
      const children: ProjectsTreeElement[] = recent.map((entry) => ({
        kind: 'project' as const,
        entry,
      }));
      children.push({
        kind: 'action',
        id: 'clear-recent',
        label: 'Clear Recent',
        commandId: 'cursor-toys.projects.clearRecent',
      });
      return children;
    }

    return [];
  }
}
