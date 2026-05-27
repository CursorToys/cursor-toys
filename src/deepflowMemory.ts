import * as vscode from 'vscode';
import { getDeepflowMemoryUri, getDeepflowRootUri } from './deepflowPaths';
import {
  DeepflowMemoryDoc,
  DeepflowMemoryEntry,
  parseMemoryMarkdown,
} from './deepflowMemoryParser';

/**
 * Reads and parses `.deepflow/memory.md` when DeepFlow is initialized.
 */
export async function readDeepflowMemoryDoc(
  root?: vscode.Uri
): Promise<DeepflowMemoryDoc | undefined> {
  const deepflowRoot = root ?? getDeepflowRootUri();
  if (!deepflowRoot) {
    return undefined;
  }

  const memoryUri = getDeepflowMemoryUri(deepflowRoot);
  try {
    const data = await vscode.workspace.fs.readFile(memoryUri);
    const content = Buffer.from(data).toString('utf8');
    return parseMemoryMarkdown(content);
  } catch {
    return { topics: [], hasContent: false };
  }
}

/**
 * Resolves an archive task folder URI from a memory index ref.
 */
export function resolveArchiveTaskUri(
  root: vscode.Uri,
  archiveFolderName: string
): vscode.Uri {
  return vscode.Uri.joinPath(root, 'specs', 'archive', archiveFolderName);
}

/**
 * Opens the best spec file for a memory entry (archive ref → completion report).
 */
export async function openMemoryEntryTarget(
  entry: DeepflowMemoryEntry,
  root: vscode.Uri
): Promise<void> {
  if (entry.kind === 'archived' && entry.archiveFolderName) {
    const taskUri = resolveArchiveTaskUri(root, entry.archiveFolderName);
    const completionUri = vscode.Uri.joinPath(taskUri, 'COMPLETION_REPORT.md');
    try {
      await vscode.workspace.fs.stat(completionUri);
      const doc = await vscode.workspace.openTextDocument(completionUri);
      await vscode.window.showTextDocument(doc, { preview: false });
      return;
    } catch {
      try {
        await vscode.workspace.fs.stat(taskUri);
        await vscode.commands.executeCommand('revealInExplorer', taskUri);
        return;
      } catch {
        // fall through to memory.md
      }
    }
  }

  await openDeepflowMemoryFile(root);
}

/**
 * Opens `.deepflow/memory.md` in the editor.
 */
export async function openDeepflowMemoryFile(root?: vscode.Uri): Promise<void> {
  const deepflowRoot = root ?? getDeepflowRootUri();
  if (!deepflowRoot) {
    vscode.window.showErrorMessage('Open a workspace folder to view DeepFlow memory.');
    return;
  }
  const memoryUri = getDeepflowMemoryUri(deepflowRoot);
  try {
    const doc = await vscode.workspace.openTextDocument(memoryUri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    vscode.window.showWarningMessage(
      'DeepFlow memory file not found. Complete a task or initialize DeepFlow first.'
    );
  }
}
