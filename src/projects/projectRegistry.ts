import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeExtensionDataFolderName } from '../extensionDataPaths';
import { getExtensionDataFolderName } from '../utils';
import {
  EditProjectInput,
  PinProjectInput,
  clearRecentInSnapshot,
  editProjectInSnapshot,
  findProjectById,
  groupPinnedByCategory,
  parseRegistrySnapshot,
  pinProjectInSnapshot,
  recordWorkspaceOpenInSnapshot,
  removeProjectFromSnapshot,
  unpinProjectInSnapshot,
} from './projectRegistryCore';
import { ProjectEntry, ProjectRegistrySnapshot, createEmptyRegistrySnapshot } from './types';

const SAVE_DEBOUNCE_MS = 200;

export function getProjectsRegistryFilePath(
  homePath: string,
  extensionDataFolder: string
): string {
  const folder = normalizeExtensionDataFolderName(extensionDataFolder);
  return path.join(homePath, `.${folder}`, 'projects', 'registry.json');
}

export function getProjectsRecentLimit(): number {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const limit = config.get<number>('projects.recentLimit', 15);
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 15;
}

export class ProjectRegistry {
  private static instance: ProjectRegistry | undefined;

  private snapshot: ProjectRegistrySnapshot = createEmptyRegistrySnapshot();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private loadWarningShown = false;

  readonly onDidChange = this.changeEmitter.event;

  private constructor(
    private readonly registryPath: string,
    private readonly homePath: string
  ) {}

  static getInstance(): ProjectRegistry {
    if (!ProjectRegistry.instance) {
      const homePath = process.env.HOME || process.env.USERPROFILE || '';
      const registryPath = getProjectsRegistryFilePath(homePath, getExtensionDataFolderName());
      ProjectRegistry.instance = new ProjectRegistry(registryPath, homePath);
    }
    return ProjectRegistry.instance;
  }

  static resetForTests(): void {
    ProjectRegistry.instance = undefined;
  }

  private registryWatcher: vscode.FileSystemWatcher | undefined;

  async initialize(): Promise<vscode.Disposable> {
    await this.load();
    this.registryWatcher?.dispose();
    this.registryWatcher = this.createWatcher();
    return new vscode.Disposable(() => this.registryWatcher?.dispose());
  }

  getSnapshot(): ProjectRegistrySnapshot {
    return {
      schemaVersion: this.snapshot.schemaVersion,
      pinned: [...this.snapshot.pinned],
      recent: [...this.snapshot.recent],
    };
  }

  getPinned(): ProjectEntry[] {
    return [...this.snapshot.pinned];
  }

  getRecent(): ProjectEntry[] {
    return [...this.snapshot.recent];
  }

  getPinnedByCategory(): { category: string; entries: ProjectEntry[] }[] {
    return groupPinnedByCategory(this.snapshot.pinned);
  }

  findById(projectId: string): ProjectEntry | undefined {
    return findProjectById(this.snapshot, projectId);
  }

  async pinProject(input: PinProjectInput): Promise<ProjectEntry> {
    const entry = pinProjectInSnapshot(this.snapshot, input);
    await this.persist();
    this.changeEmitter.fire();
    return entry;
  }

  async unpinProject(projectId: string): Promise<boolean> {
    const changed = unpinProjectInSnapshot(this.snapshot, projectId, getProjectsRecentLimit());
    if (!changed) {
      return false;
    }
    await this.persist();
    this.changeEmitter.fire();
    return true;
  }

  async editProject(projectId: string, input: EditProjectInput): Promise<ProjectEntry | undefined> {
    const updated = editProjectInSnapshot(this.snapshot, projectId, input);
    if (!updated) {
      return undefined;
    }
    await this.persist();
    this.changeEmitter.fire();
    return updated;
  }

  async removeProject(projectId: string): Promise<boolean> {
    const changed = removeProjectFromSnapshot(this.snapshot, projectId);
    if (!changed) {
      return false;
    }
    await this.persist();
    this.changeEmitter.fire();
    return true;
  }

  async clearRecent(): Promise<void> {
    clearRecentInSnapshot(this.snapshot);
    await this.persist();
    this.changeEmitter.fire();
  }

  async recordWorkspaceOpen(pathValue: string | undefined): Promise<ProjectEntry | undefined> {
    if (!pathValue) {
      return undefined;
    }
    const entry = recordWorkspaceOpenInSnapshot(
      this.snapshot,
      pathValue,
      getProjectsRecentLimit()
    );
    if (!entry) {
      return undefined;
    }
    await this.persist();
    this.changeEmitter.fire();
    return entry;
  }

  private async load(): Promise<void> {
    try {
      const dir = path.dirname(this.registryPath);
      await fs.promises.mkdir(dir, { recursive: true });
      if (!fs.existsSync(this.registryPath)) {
        this.snapshot = createEmptyRegistrySnapshot();
        return;
      }
      const rawText = await fs.promises.readFile(this.registryPath, 'utf8');
      const parsed = JSON.parse(rawText) as unknown;
      this.snapshot = parseRegistrySnapshot(parsed);
    } catch {
      this.snapshot = createEmptyRegistrySnapshot();
      if (!this.loadWarningShown) {
        this.loadWarningShown = true;
        void vscode.window.showWarningMessage(
          'CursorToys: Projects registry was reset because the file could not be read.'
        );
      }
    }
  }

  private async persist(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    await new Promise<void>((resolve) => {
      this.saveTimer = setTimeout(() => {
        void this.writeToDisk().finally(resolve);
      }, SAVE_DEBOUNCE_MS);
    });
  }

  private async writeToDisk(): Promise<void> {
    const dir = path.dirname(this.registryPath);
    await fs.promises.mkdir(dir, { recursive: true });
    const payload = JSON.stringify(this.snapshot, null, 2);
    const backupPath = `${this.registryPath}.bak`;
    if (fs.existsSync(this.registryPath)) {
      await fs.promises.copyFile(this.registryPath, backupPath);
    }
    const tempPath = `${this.registryPath}.tmp`;
    await fs.promises.writeFile(tempPath, payload, 'utf8');
    await fs.promises.rename(tempPath, this.registryPath);
  }

  private createWatcher(): vscode.FileSystemWatcher {
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(
        path.join(
          this.homePath,
          `.${normalizeExtensionDataFolderName(getExtensionDataFolderName())}`,
          'projects'
        )
      ),
      'registry.json'
    );
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    watcher.onDidChange(() => void this.load().then(() => this.changeEmitter.fire()));
    watcher.onDidCreate(() => void this.load().then(() => this.changeEmitter.fire()));
    return watcher;
  }
}

/**
 * Resolves the path of the currently open workspace for registry tracking.
 */
export function getCurrentWorkspaceRecordPath(): string | undefined {
  if (vscode.workspace.workspaceFile) {
    return vscode.workspace.workspaceFile.fsPath;
  }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0].uri.fsPath;
  }
  return folders[0].uri.fsPath;
}
