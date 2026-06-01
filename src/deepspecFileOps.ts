import * as vscode from 'vscode';
import * as path from 'path';
import type { AbcFileKind, DeepSpecStage, DeepSpecTreeStage } from './deepspecPaths';
import { ABC_FILE_NAMES, getStageFromTaskUri, isTaskInReviewGate } from './deepspecPaths';
import { DeepspecReviewPanel } from './deepspecReviewPanel';
import type { DeepSpecTreeItem } from './deepspecTreeProvider';

/** Tree item id prefix for A-B-C spec files. */
export const DEEPSPEC_FILE_TREE_ID_PREFIX = 'deepspec-file:';

/**
 * Builds a stable tree item id for an A-B-C file node.
 */
export function deepspecFileTreeItemId(fileUri: vscode.Uri): string {
  return `${DEEPSPEC_FILE_TREE_ID_PREFIX}${fileUri.toString()}`;
}

/**
 * Resolves a file URI from a tree command argument (Uri, string id, or tree item).
 */
export function coerceDeepspecFileUri(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  if (typeof arg === 'string') {
    if (arg.startsWith(DEEPSPEC_FILE_TREE_ID_PREFIX)) {
      return vscode.Uri.parse(arg.slice(DEEPSPEC_FILE_TREE_ID_PREFIX.length));
    }
    return vscode.Uri.parse(arg);
  }
  if (!arg || typeof arg !== 'object') {
    return undefined;
  }
  const treeItem = arg as vscode.TreeItem;
  if (typeof treeItem.id === 'string' && treeItem.id.startsWith(DEEPSPEC_FILE_TREE_ID_PREFIX)) {
    return vscode.Uri.parse(treeItem.id.slice(DEEPSPEC_FILE_TREE_ID_PREFIX.length));
  }
  if (treeItem.resourceUri) {
    return treeItem.resourceUri;
  }
  const custom = arg as DeepSpecTreeItem;
  if (custom.fileUri) {
    return coerceDeepspecFileUri(custom.fileUri);
  }
  const loose = arg as { fsPath?: string; path?: string; scheme?: string };
  if (loose.fsPath) {
    return vscode.Uri.file(loose.fsPath);
  }
  if (loose.scheme && loose.path) {
    return vscode.Uri.from({ scheme: loose.scheme, path: loose.path });
  }
  return undefined;
}

export interface DeepspecReviewOpenContext {
  fileUri: vscode.Uri;
  taskFolderUri: vscode.Uri;
  /** Filesystem stage (`active` for Review Gate tasks). */
  stage: DeepSpecStage;
  /** Tree / UI stage when opened from the DeepSpec view. */
  treeStage?: DeepSpecTreeStage;
  abcKind?: AbcFileKind;
  taskId?: string;
}

/**
 * Resolves task folder, stage, and file from a tree item or file URI.
 */
export async function resolveDeepspecReviewContext(
  arg: unknown
): Promise<DeepspecReviewOpenContext | undefined> {
  const fileUri = coerceDeepspecFileUri(arg);
  if (!fileUri) {
    return undefined;
  }

  const treeItem = arg as DeepSpecTreeItem;
  if (treeItem?.type === 'abcFile' && treeItem.taskFolderUri && treeItem.stage) {
    const fsStage = getStageFromTaskUri(treeItem.taskFolderUri) ?? 'active';
    return {
      fileUri,
      taskFolderUri: treeItem.taskFolderUri,
      stage: fsStage,
      treeStage: treeItem.stage,
      abcKind: treeItem.abcKind,
      taskId: treeItem.taskId,
    };
  }

  const normalized = fileUri.fsPath.replace(/\\/g, '/');
  const match = normalized.match(
    /\/\.deepspec\/specs\/(drafts|active|archive)\/([^/]+)\/([^/]+)$/
  );
  if (!match) {
    return undefined;
  }

  const stage = match[1] as DeepSpecStage;
  const taskId = match[2];
  const baseName = match[3];
  const taskFolderUri = vscode.Uri.file(path.dirname(fileUri.fsPath));
  const stageFromUri = getStageFromTaskUri(taskFolderUri);
  if (stageFromUri !== stage) {
    return undefined;
  }

  let abcKind: AbcFileKind | undefined;
  for (const [kind, name] of Object.entries(ABC_FILE_NAMES) as [AbcFileKind, string][]) {
    if (name === baseName) {
      abcKind = kind;
      break;
    }
  }

  const treeStage: DeepSpecTreeStage =
    stage === 'active' && (await isTaskInReviewGate(taskFolderUri)) ? 'review' : stage;

  return { fileUri, taskFolderUri, stage, treeStage, abcKind, taskId };
}

/**
 * Opens a DeepSpec A-B-C file in the spec review webview.
 */
export async function openDeepspecSpecReview(
  extensionUri: vscode.Uri,
  arg: unknown
): Promise<void> {
  const treeItem = arg as DeepSpecTreeItem;
  if (treeItem?.type === 'task' && treeItem.taskFolderUri) {
    const reportUri = vscode.Uri.joinPath(
      treeItem.taskFolderUri,
      ABC_FILE_NAMES.COMPLETION_REPORT
    );
    arg = {
      ...treeItem,
      type: 'abcFile' as const,
      fileUri: reportUri,
      abcKind: 'COMPLETION_REPORT' as const,
    };
  }

  const ctx = await resolveDeepspecReviewContext(arg);
  if (!ctx) {
    vscode.window.showErrorMessage('Could not open spec review for this file');
    return;
  }
  await DeepspecReviewPanel.createOrShow(extensionUri, ctx);
}

/**
 * Opens a DeepSpec spec markdown file in the editor.
 */
export async function openDeepspecSpecFile(arg: unknown): Promise<void> {
  const uri = coerceDeepspecFileUri(arg);
  if (!uri) {
    vscode.window.showErrorMessage('No spec file selected');
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      preserveFocus: false,
    });
  } catch {
    try {
      await vscode.commands.executeCommand('vscode.open', uri);
    } catch (error) {
      vscode.window.showErrorMessage(`Error opening file: ${error}`);
    }
  }
}
