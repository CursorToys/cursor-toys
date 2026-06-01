import * as vscode from 'vscode';
import * as path from 'path';

export type DeepSpecStage = 'drafts' | 'active' | 'archive';

/** Tree view stages (Review Gate tasks stay under `active/` on disk). */
export type DeepSpecTreeStage = DeepSpecStage | 'review';

export const DEEPSPEC_STAGES: readonly DeepSpecStage[] = ['drafts', 'active', 'archive'] as const;

export const DEEPSPEC_TREE_STAGES: readonly DeepSpecTreeStage[] = [
  'drafts',
  'active',
  'review',
  'archive',
] as const;

/** Status values from COMPLETION_REPORT.md (DeepSpec skill). */
export type CompletionReportStatus =
  | 'PENDING'
  | 'IN PROGRESS'
  | 'IN REVIEW'
  | 'DONE'
  | 'DISCARDED';

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

/** Kebab-case slug or legacy `NN-slug` folders (DeepSpec 2.x). */
const TASK_FOLDER_REGEX = /^[\w-]+$/;

export interface DeepSpecTaskInfo {
  folderName: string;
  taskId: string;
  folderUri: vscode.Uri;
  stage: DeepSpecStage;
}

/**
 * True when `name` is a valid DeepSpec task folder (slug, not hidden).
 */
export function isValidTaskFolderName(name: string): boolean {
  if (!name || name.startsWith('.')) {
    return false;
  }
  return TASK_FOLDER_REGEX.test(name);
}

/**
 * Returns all workspace folder URIs.
 */
export function getAllWorkspaceFolderUris(): vscode.Uri[] {
  return vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? [];
}

/**
 * True when the workspace has more than one root folder.
 */
export function isMultiRootWorkspace(): boolean {
  return getAllWorkspaceFolderUris().length > 1;
}

/**
 * Workspace folder URI that contains a `.deepspec` root.
 */
export function getWorkspaceFolderFromDeepspecRoot(deepspecRoot: vscode.Uri): vscode.Uri {
  return vscode.Uri.file(path.dirname(deepspecRoot.fsPath));
}

/**
 * Resolves `.deepspec` for a task folder using its workspace folder.
 */
export function getDeepspecRootForTaskUri(taskFolderUri: vscode.Uri): vscode.Uri | undefined {
  const wsFolder = vscode.workspace.getWorkspaceFolder(taskFolderUri);
  if (!wsFolder) {
    return undefined;
  }
  return getDeepspecRootUri(wsFolder.uri);
}

export interface DeepspecWorkspaceRootInfo {
  workspaceFolder: vscode.Uri;
  deepspecRoot: vscode.Uri;
  hasSpecs: boolean;
}

/**
 * Lists each workspace folder with its `.deepspec` root and whether specs exist.
 */
export async function listDeepspecWorkspaceRoots(): Promise<DeepspecWorkspaceRootInfo[]> {
  const result: DeepspecWorkspaceRootInfo[] = [];
  for (const folder of getAllWorkspaceFolderUris()) {
    const deepspecRoot = getDeepspecRootUri(folder);
    if (!deepspecRoot) {
      continue;
    }
    result.push({
      workspaceFolder: folder,
      deepspecRoot,
      hasSpecs: await deepspecSpecsExist(deepspecRoot),
    });
  }
  return result;
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
 * Lists task folders in a stage, sorted alphabetically by folder name.
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
    if (!isValidTaskFolderName(name)) {
      continue;
    }
    tasks.push({
      folderName: name,
      taskId: name,
      folderUri: vscode.Uri.joinPath(stageUri, name),
      stage,
    });
  }

  tasks.sort((a, b) => a.folderName.localeCompare(b.folderName));
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
 * Parses **Status:** from COMPLETION_REPORT.md content.
 */
export function parseCompletionReportStatus(
  content: string
): CompletionReportStatus | undefined {
  const match = content.match(/\*\*Status:\*\*\s*`?\[([^\]]+)\]`?/i);
  if (!match) {
    return undefined;
  }
  const raw = match[1].trim().toUpperCase();
  const normalized = raw.replace(/\s+/g, ' ');
  const allowed: CompletionReportStatus[] = [
    'PENDING',
    'IN PROGRESS',
    'IN REVIEW',
    'DONE',
    'DISCARDED',
  ];
  return allowed.find((s) => s === normalized);
}

/**
 * Reads COMPLETION_REPORT.md status for a task folder.
 */
export async function readCompletionReportStatus(
  taskFolderUri: vscode.Uri
): Promise<CompletionReportStatus | undefined> {
  const content = await readAbcFile(taskFolderUri, 'COMPLETION_REPORT');
  if (!content) {
    return undefined;
  }
  return parseCompletionReportStatus(content);
}

/**
 * True when the task is in Review Gate (`Status: [IN REVIEW]`).
 */
export async function isTaskInReviewGate(taskFolderUri: vscode.Uri): Promise<boolean> {
  const status = await readCompletionReportStatus(taskFolderUri);
  return status === 'IN REVIEW';
}

/**
 * Lists task folders for a tree stage (splits `active/` into in-dev vs review).
 */
export async function listTasksForTreeStage(
  specsUri: vscode.Uri,
  treeStage: DeepSpecTreeStage
): Promise<DeepSpecTaskInfo[]> {
  if (treeStage === 'drafts' || treeStage === 'archive') {
    return listTasksInStage(specsUri, treeStage);
  }

  const activeTasks = await listTasksInStage(specsUri, 'active');
  const filtered: DeepSpecTaskInfo[] = [];
  for (const task of activeTasks) {
    const inReview = await isTaskInReviewGate(task.folderUri);
    if (treeStage === 'review' && inReview) {
      filtered.push(task);
    } else if (treeStage === 'active' && !inReview) {
      filtered.push(task);
    }
  }
  return filtered;
}

/**
 * Human-readable stage label for the tree view.
 */
export function getStageLabel(stage: DeepSpecTreeStage): string {
  switch (stage) {
    case 'drafts':
      return 'Drafts';
    case 'active':
      return 'In development';
    case 'review':
      return 'Review';
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
