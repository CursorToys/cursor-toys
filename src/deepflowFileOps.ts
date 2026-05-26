import * as vscode from 'vscode';
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
