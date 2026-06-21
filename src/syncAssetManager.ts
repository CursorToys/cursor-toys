import * as path from 'path';
import * as vscode from 'vscode';
import { backupBeforeWrite } from './backupManager';
import {
  computeSyncDiffSummary,
  resolveSyncPaths,
  type SyncAssetCategory,
} from './syncAssetCore';
import {
  getBaseFolderName,
  getGlobalCursorRoot,
} from './utils';
import { listAgentFiles } from './agentsManager';

function getWorkspacePath(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getPersonalRootForCategory(_category: SyncAssetCategory): string {
  return getGlobalCursorRoot();
}

function getWorkspaceRootForCategory(_category: SyncAssetCategory, workspacePath: string): string {
  return path.join(workspacePath, `.${getBaseFolderName()}`);
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    return Buffer.from(raw).toString('utf8');
  } catch {
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

async function copyPath(sourcePath: string, targetPath: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetPath)));
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(sourcePath));
  if (stat.type === vscode.FileType.Directory) {
    await copyDirectory(sourcePath, targetPath);
    return;
  }
  await vscode.workspace.fs.copy(vscode.Uri.file(sourcePath), vscode.Uri.file(targetPath), {
    overwrite: true,
  });
}

async function copyDirectory(source: string, dest: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(dest));
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(source));
  for (const [name, type] of entries) {
    const from = path.join(source, name);
    const to = path.join(dest, name);
    if (type === vscode.FileType.Directory) {
      await copyDirectory(from, to);
    } else {
      await vscode.workspace.fs.copy(vscode.Uri.file(from), vscode.Uri.file(to), { overwrite: true });
    }
  }
}

export interface SyncAssetResult {
  category: SyncAssetCategory;
  name: string;
  sourcePath: string;
  targetPath: string;
  dryRun: boolean;
  wouldOverwrite: boolean;
  backupPath?: string | null;
  diffSummary: string;
  copied: boolean;
}

export async function syncAssetToWorkspace(args: Record<string, unknown>): Promise<SyncAssetResult> {
  return syncAsset('toWorkspace', args);
}

export async function syncAssetToGlobal(args: Record<string, unknown>): Promise<SyncAssetResult> {
  return syncAsset('toGlobal', args);
}

async function syncAsset(
  direction: 'toWorkspace' | 'toGlobal',
  args: Record<string, unknown>
): Promise<SyncAssetResult> {
  const category = String(args.category ?? '') as SyncAssetCategory;
  const name = String(args.name ?? '').trim();
  const dryRun = Boolean(args.dryRun);
  const workspacePath = (args.workspacePath as string | undefined) ?? getWorkspacePath();

  if (!name) {
    throw new Error('name is required');
  }
  if (!workspacePath) {
    throw new Error('No workspace folder open');
  }

  const personalRoot = getPersonalRootForCategory(category);
  const workspaceRoot = getWorkspaceRootForCategory(category, workspacePath);
  const paths = resolveSyncPaths(category, name, personalRoot, workspaceRoot, direction);

  if (!(await pathExists(paths.sourcePath))) {
    throw new Error(`Source not found: ${paths.sourcePath}`);
  }

  const sourceIsDir = (await vscode.workspace.fs.stat(vscode.Uri.file(paths.sourcePath))).type ===
    vscode.FileType.Directory;
  let diffSummary = 'Directory copy.';
  let wouldOverwrite = await pathExists(paths.targetPath);

  if (!sourceIsDir) {
    const incoming = await readFileIfExists(paths.sourcePath);
    const existing = await readFileIfExists(paths.targetPath);
    const diff = computeSyncDiffSummary(existing, incoming ?? '');
    diffSummary = diff.diffSummary;
    wouldOverwrite = diff.wouldOverwrite;
  }

  if (dryRun) {
    return {
      category,
      name,
      sourcePath: paths.sourcePath,
      targetPath: paths.targetPath,
      dryRun: true,
      wouldOverwrite,
      diffSummary,
      copied: false,
    };
  }

  if (wouldOverwrite && !args.confirm) {
    throw new Error('confirm: true required to overwrite an existing target (use dryRun: true to preview)');
  }

  let backupPath: string | null = null;
  if (wouldOverwrite && (await pathExists(paths.targetPath))) {
    backupPath = await backupBeforeWrite(paths.targetPath, 'sync');
  }

  await copyPath(paths.sourcePath, paths.targetPath);

  return {
    category,
    name,
    sourcePath: paths.sourcePath,
    targetPath: paths.targetPath,
    dryRun: false,
    wouldOverwrite,
    backupPath,
    diffSummary,
    copied: true,
  };
}

export async function listSyncableAgentNames(): Promise<string[]> {
  const files = await listAgentFiles();
  return files.map((f) => path.basename(f, path.extname(f)));
}
