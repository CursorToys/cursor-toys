import * as vscode from 'vscode';
import * as path from 'path';
import type { AbcFileKind, DeepFlowStage } from './deepflowPaths';
import { ABC_FILE_NAMES, getStageFromTaskUri } from './deepflowPaths';
import { DeepflowReviewPanel } from './deepflowReviewPanel';
import type { DeepFlowTreeItem } from './deepflowTreeProvider';

/** Tree item id prefix for A-B-C spec files. */
export const DEEPFLOW_FILE_TREE_ID_PREFIX = 'deepflow-file:';

/**
 * Builds a stable tree item id for an A-B-C file node.
 */
export function deepflowFileTreeItemId(fileUri: vscode.Uri): string {
  return `${DEEPFLOW_FILE_TREE_ID_PREFIX}${fileUri.toString()}`;
}

/**
 * Resolves a file URI from a tree command argument (Uri, string id, or tree item).
 */
export function coerceDeepflowFileUri(arg: unknown): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  if (typeof arg === 'string') {
    if (arg.startsWith(DEEPFLOW_FILE_TREE_ID_PREFIX)) {
      return vscode.Uri.parse(arg.slice(DEEPFLOW_FILE_TREE_ID_PREFIX.length));
    }
    return vscode.Uri.parse(arg);
  }
  if (!arg || typeof arg !== 'object') {
    return undefined;
  }
  const treeItem = arg as vscode.TreeItem;
  if (typeof treeItem.id === 'string' && treeItem.id.startsWith(DEEPFLOW_FILE_TREE_ID_PREFIX)) {
    return vscode.Uri.parse(treeItem.id.slice(DEEPFLOW_FILE_TREE_ID_PREFIX.length));
  }
  if (treeItem.resourceUri) {
    return treeItem.resourceUri;
  }
  const custom = arg as DeepFlowTreeItem;
  if (custom.fileUri) {
    return coerceDeepflowFileUri(custom.fileUri);
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

export interface DeepflowReviewOpenContext {
  fileUri: vscode.Uri;
  taskFolderUri: vscode.Uri;
  stage: DeepFlowStage;
  abcKind?: AbcFileKind;
  taskId?: string;
}

/**
 * Resolves task folder, stage, and file from a tree item or file URI.
 */
export function resolveDeepflowReviewContext(arg: unknown): DeepflowReviewOpenContext | undefined {
  const fileUri = coerceDeepflowFileUri(arg);
  if (!fileUri) {
    return undefined;
  }

  const treeItem = arg as DeepFlowTreeItem;
  if (treeItem?.type === 'abcFile' && treeItem.taskFolderUri && treeItem.stage) {
    return {
      fileUri,
      taskFolderUri: treeItem.taskFolderUri,
      stage: treeItem.stage,
      abcKind: treeItem.abcKind,
      taskId: treeItem.taskId,
    };
  }

  const normalized = fileUri.fsPath.replace(/\\/g, '/');
  const match = normalized.match(
    /\/\.deepflow\/specs\/(drafts|active|archive)\/([^/]+)\/([^/]+)$/
  );
  if (!match) {
    return undefined;
  }

  const stage = match[1] as DeepFlowStage;
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

  return { fileUri, taskFolderUri, stage, abcKind, taskId };
}

/**
 * Opens a DeepFlow A-B-C file in the spec review webview.
 */
export async function openDeepflowSpecReview(
  extensionUri: vscode.Uri,
  arg: unknown
): Promise<void> {
  const ctx = resolveDeepflowReviewContext(arg);
  if (!ctx) {
    vscode.window.showErrorMessage('Could not open spec review for this file');
    return;
  }
  await DeepflowReviewPanel.createOrShow(extensionUri, ctx);
}

/**
 * Opens a DeepFlow spec markdown file in the editor.
 */
export async function openDeepflowSpecFile(arg: unknown): Promise<void> {
  const uri = coerceDeepflowFileUri(arg);
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
