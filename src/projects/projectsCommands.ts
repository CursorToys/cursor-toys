import * as fs from 'fs';
import * as vscode from 'vscode';
import { PROJECT_COLOR_PRESETS, ProjectColor, ProjectEntry } from './types';
import { detectProjectPathKind } from './projectPathUtils';
import {
  ProjectRegistry,
  getCurrentWorkspaceRecordPath,
} from './projectRegistry';
import { isProjectsEnabled, shouldOpenProjectInNewWindow } from './projectsConfig';
import { ProjectsDashboardPanel } from './projectsDashboardPanel';
import { hashProjectPathKind, trackProjectsEvent } from './projectsTelemetry';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function toOpenUri(pathValue: string): vscode.Uri {
  if (
    pathValue.startsWith('file://') ||
    pathValue.startsWith('vscode-remote://') ||
    pathValue.startsWith('vscode-local://')
  ) {
    return vscode.Uri.parse(pathValue);
  }
  return vscode.Uri.file(pathValue);
}

export async function openProjectEntry(entry: ProjectEntry): Promise<boolean> {
  const exists = await pathExists(entry.path);
  if (!exists && !entry.path.startsWith('vscode-remote://')) {
    trackProjectsEvent('projects_error', { reason: 'missing_path', kind: hashProjectPathKind(entry.pathKind) });
    const action = await vscode.window.showErrorMessage(
      `Project path not found: ${entry.label}`,
      'Remove'
    );
    if (action === 'Remove') {
      await ProjectRegistry.getInstance().removeProject(entry.id);
    }
    return false;
  }

  const uri = toOpenUri(entry.path);
  const forceNewWindow = shouldOpenProjectInNewWindow();
  try {
    await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow });
    trackProjectsEvent('projects_open', { kind: hashProjectPathKind(entry.pathKind) });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    trackProjectsEvent('projects_error', { reason: 'exception', kind: hashProjectPathKind(entry.pathKind) });
    vscode.window.showErrorMessage(`Could not open project: ${message}`);
    return false;
  }
}

interface ColorPickItem extends vscode.QuickPickItem {
  value?: ProjectColor;
}

async function pickColor(
  current?: ProjectColor
): Promise<'cancel' | ProjectColor | undefined> {
  const items: ColorPickItem[] = PROJECT_COLOR_PRESETS.map((color) => ({
    label: color,
    value: color,
  }));
  items.unshift({ label: 'None', value: undefined });
  const picked = await vscode.window.showQuickPick(items, {
    title: 'Project color',
    placeHolder: current ? `Current: ${current}` : 'Choose a color',
  });
  if (!picked) {
    return 'cancel';
  }
  return picked.value;
}

async function collectMetadata(existing?: ProjectEntry): Promise<{
  label: string;
  category?: string;
  color?: ProjectColor;
  notes?: string;
} | undefined> {
  const label = await vscode.window.showInputBox({
    title: existing ? 'Edit project' : 'Pin project',
    prompt: 'Display label',
    value: existing?.label ?? '',
    validateInput: (value) => (value.trim().length > 0 ? undefined : 'Label is required'),
  });
  if (label === undefined) {
    return undefined;
  }
  const category = await vscode.window.showInputBox({
    title: existing ? 'Edit project' : 'Pin project',
    prompt: 'Category (optional)',
    value: existing?.category ?? '',
  });
  if (category === undefined) {
    return undefined;
  }
  const colorResult = await pickColor(existing?.color);
  if (colorResult === 'cancel') {
    return undefined;
  }
  const notes = await vscode.window.showInputBox({
    title: existing ? 'Edit project' : 'Pin project',
    prompt: 'Notes (optional)',
    value: existing?.notes ?? '',
  });
  if (notes === undefined) {
    return undefined;
  }
  return {
    label: label.trim(),
    category: category.trim() || undefined,
    color: colorResult,
    notes: notes.trim() || undefined,
  };
}

export async function pinCurrentWorkspace(): Promise<void> {
  if (!isProjectsEnabled()) {
    vscode.window.showInformationMessage(
      'Enable Projects in CursorToys Settings to pin workspaces.'
    );
    return;
  }
  const currentPath = getCurrentWorkspaceRecordPath();
  if (!currentPath) {
    vscode.window.showWarningMessage('Open a workspace folder before pinning.');
    return;
  }
  const metadata = await collectMetadata();
  if (!metadata) {
    return;
  }
  const registry = ProjectRegistry.getInstance();
  await registry.pinProject({ path: currentPath, ...metadata });
  trackProjectsEvent('projects_pin', { source: 'current' });
  vscode.window.showInformationMessage(`Pinned workspace: ${metadata.label}`);
}

export async function addProjectFromFolder(): Promise<void> {
  if (!isProjectsEnabled()) {
    vscode.window.showInformationMessage(
      'Enable Projects in CursorToys Settings to add workspaces.'
    );
    return;
  }
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Add Project',
    filters: { 'VS Code workspace': ['code-workspace'] },
  });
  const uri = picked?.[0];
  if (!uri) {
    return;
  }
  const metadata = await collectMetadata();
  if (!metadata) {
    return;
  }
  const registry = ProjectRegistry.getInstance();
  await registry.pinProject({ path: uri.fsPath, ...metadata });
  trackProjectsEvent('projects_pin', { source: 'picker' });
  vscode.window.showInformationMessage(`Pinned project: ${metadata.label}`);
}

export async function editProjectById(projectId: string): Promise<void> {
  const registry = ProjectRegistry.getInstance();
  const existing = registry.findById(projectId);
  if (!existing) {
    vscode.window.showWarningMessage('Project not found.');
    return;
  }
  const metadata = await collectMetadata(existing);
  if (!metadata) {
    return;
  }
  await registry.editProject(projectId, metadata);
  vscode.window.showInformationMessage(`Updated project: ${metadata.label}`);
}

export function registerProjectsCommands(
  context: vscode.ExtensionContext,
  onRegistryChange: () => void
): void {
  const registry = ProjectRegistry.getInstance();

  context.subscriptions.push(
    registry.onDidChange(onRegistryChange),
    vscode.commands.registerCommand('cursor-toys.projects.openDashboard', async () => {
      if (!isProjectsEnabled()) {
        vscode.window.showInformationMessage(
          'Enable Projects in CursorToys Settings to open the dashboard.'
        );
        return;
      }
      await ProjectsDashboardPanel.createOrShow();
    }),
    vscode.commands.registerCommand('cursor-toys.projects.pinCurrent', () => pinCurrentWorkspace()),
    vscode.commands.registerCommand('cursor-toys.projects.addFromFolder', () => addProjectFromFolder()),
    vscode.commands.registerCommand('cursor-toys.projects.open', async (entry?: ProjectEntry) => {
      if (!entry) {
        return;
      }
      await openProjectEntry(entry);
    }),
    vscode.commands.registerCommand('cursor-toys.projects.edit', async (entry?: ProjectEntry) => {
      if (!entry?.id) {
        return;
      }
      await editProjectById(entry.id);
    }),
    vscode.commands.registerCommand('cursor-toys.projects.unpin', async (entry?: ProjectEntry) => {
      if (!entry?.id) {
        return;
      }
      const ok = await registry.unpinProject(entry.id);
      if (ok) {
        vscode.window.showInformationMessage(`Unpinned: ${entry.label}`);
      }
    }),
    vscode.commands.registerCommand('cursor-toys.projects.remove', async (entry?: ProjectEntry) => {
      if (!entry?.id) {
        return;
      }
      const confirm = await vscode.window.showWarningMessage(
        `Remove "${entry.label}" from Projects?`,
        { modal: true },
        'Remove'
      );
      if (confirm === 'Remove') {
        await registry.removeProject(entry.id);
      }
    }),
    vscode.commands.registerCommand('cursor-toys.projects.pinEntry', async (entry?: ProjectEntry) => {
      if (!entry) {
        return;
      }
      const metadata = await collectMetadata(entry);
      if (!metadata) {
        return;
      }
      await registry.pinProject({ path: entry.path, ...metadata });
      trackProjectsEvent('projects_pin', { source: 'entry' });
    }),
    vscode.commands.registerCommand('cursor-toys.projects.refresh', () => {
      onRegistryChange();
    }),
    vscode.commands.registerCommand('cursor-toys.projects.clearRecent', async () => {
      const confirm = await vscode.window.showWarningMessage(
        'Clear all recent projects?',
        { modal: true },
        'Clear'
      );
      if (confirm === 'Clear') {
        await registry.clearRecent();
      }
    })
  );
}

export async function recordCurrentWorkspaceIfEnabled(): Promise<void> {
  if (!isProjectsEnabled()) {
    return;
  }
  const registry = ProjectRegistry.getInstance();
  await registry.initialize();
  await registry.recordWorkspaceOpen(getCurrentWorkspaceRecordPath());
}
