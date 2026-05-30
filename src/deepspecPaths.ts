import * as vscode from 'vscode';
import * as path from 'path';

export type DeepSpecStage = 'drafts' | 'active' | 'archive';

export const DEEPSPEC_STAGES: readonly DeepSpecStage[] = ['drafts', 'active', 'archive'] as const;

/** Workspace-relative path to the DeepSpec Cursor skill. */
export const DEEPSPEC_SKILL_RELATIVE_PATH = '.cursor/skills/deep-spec/SKILL.md';

export type AbcFileKind = 'APPROACH' | 'BUSINESS_CONTEXT' | 'COMPLETION_REPORT';

export const ABC_FILE_KINDS: readonly AbcFileKind[] = [
  'APPROACH',
  'BUSINESS_CONTEXT',
  'COMPLETION_REPORT',
] as const;

export const ABC_FILE_NAMES: Record<AbcFileKind, string> = {
  APPROACH: 'APPROACH.md',
  BUSINESS_CONTEXT: 'BUSINESS_CONTEXT.md',
  COMPLETION_REPORT: 'COMPLETION_REPORT.md',
};

const TASK_FOLDER_REGEX = /^\d{2,}-[\w-]+$/;

export interface DeepSpecTaskInfo {
  folderName: string;
  taskId: string;
  folderUri: vscode.Uri;
  stage: DeepSpecStage;
  sortNum: number;
}

export interface ParsedTaskFolder {
  num: number;
  slug: string;
}

/**
 * Parses a DeepSpec task folder name (e.g. `01-deep-spec-ui`).
 */
export function parseTaskFolderName(name: string): ParsedTaskFolder | null {
  if (!TASK_FOLDER_REGEX.test(name)) {
    return null;
  }
  const dash = name.indexOf('-');
  const numStr = name.slice(0, dash);
  const num = parseInt(numStr, 10);
  if (Number.isNaN(num)) {
    return null;
  }
  return { num, slug: name.slice(dash + 1) };
}

/**
 * Returns the first workspace folder URI for `.deepspec`, or undefined if none.
 */
export function getWorkspaceFolderUri(): vscode.Uri | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/**
 * URI to `.deepspec` in the first workspace folder.
 */
export function getDeepspecRootUri(workspaceFolder?: vscode.Uri): vscode.Uri | undefined {
  const folder = workspaceFolder ?? getWorkspaceFolderUri();
  if (!folder) {
    return undefined;
  }
  return vscode.Uri.joinPath(folder, '.deepspec');
}

/**
 * URI to `.deepspec/specs`.
 */
export function getDeepspecSpecsUri(root: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(root, 'specs');
}

/**
 * URI to `.deepspec/memory.md`.
 */
export function getDeepspecMemoryUri(root: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(root, 'memory.md');
}

/**
 * Returns true if `.deepspec/specs` exists.
 */
export async function deepspecSpecsExist(root: vscode.Uri): Promise<boolean> {
  const specsUri = getDeepspecSpecsUri(root);
  try {
    const stat = await vscode.workspace.fs.stat(specsUri);
    return stat.type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

/**
 * Lists task folders in a stage, sorted by numeric prefix.
 */
export async function listTasksInStage(
  specsUri: vscode.Uri,
  stage: DeepSpecStage
): Promise<DeepSpecTaskInfo[]> {
  const stageUri = vscode.Uri.joinPath(specsUri, stage);
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(stageUri);
  } catch {
    return [];
  }

  const tasks: DeepSpecTaskInfo[] = [];
  for (const [name, type] of entries) {
    if (type !== vscode.FileType.Directory) {
      continue;
    }
    if (name.startsWith('.')) {
      continue;
    }
    const parsed = parseTaskFolderName(name);
    if (!parsed) {
      continue;
    }
    tasks.push({
      folderName: name,
      taskId: name,
      folderUri: vscode.Uri.joinPath(stageUri, name),
      stage,
      sortNum: parsed.num,
    });
  }

  tasks.sort((a, b) => a.sortNum - b.sortNum || a.folderName.localeCompare(b.folderName));
  return tasks;
}

/**
 * Reads an A-B-C markdown file from a task folder.
 */
export async function readAbcFile(
  taskFolderUri: vscode.Uri,
  kind: AbcFileKind
): Promise<string | undefined> {
  const fileUri = vscode.Uri.joinPath(taskFolderUri, ABC_FILE_NAMES[kind]);
  try {
    const data = await vscode.workspace.fs.readFile(fileUri);
    return Buffer.from(data).toString('utf8');
  } catch {
    return undefined;
  }
}

/**
 * Returns URIs for A-B-C files that exist on disk.
 */
export async function listExistingAbcFiles(
  taskFolderUri: vscode.Uri
): Promise<{ kind: AbcFileKind; uri: vscode.Uri }[]> {
  const result: { kind: AbcFileKind; uri: vscode.Uri }[] = [];
  for (const kind of ABC_FILE_KINDS) {
    const uri = vscode.Uri.joinPath(taskFolderUri, ABC_FILE_NAMES[kind]);
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type === vscode.FileType.File) {
        result.push({ kind, uri });
      }
    } catch {
      // skip missing files
    }
  }
  return result;
}

/**
 * Human-readable stage label for the tree view.
 */
export function getStageLabel(stage: DeepSpecStage): string {
  switch (stage) {
    case 'drafts':
      return 'Drafts';
    case 'active':
      return 'In development';
    case 'archive':
      return 'Archive';
  }
}

/**
 * Parent stage folder name from a task folder URI path segment.
 */
export function getStageFromTaskUri(taskFolderUri: vscode.Uri): DeepSpecStage | undefined {
  const parent = path.basename(path.dirname(taskFolderUri.fsPath));
  if (parent === 'drafts' || parent === 'active' || parent === 'archive') {
    return parent;
  }
  return undefined;
}
