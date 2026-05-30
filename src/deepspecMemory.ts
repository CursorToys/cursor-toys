import * as vscode from 'vscode';
import { getDeepspecMemoryUri, getDeepspecRootUri } from './deepspecPaths';
import {
  DeepspecMemoryDoc,
  DeepspecMemoryEntry,
  parseMemoryMarkdown,
} from './deepspecMemoryParser';

/**
 * Reads and parses `.deepspec/memory.md` when DeepSpec is initialized.
 */
export async function readDeepspecMemoryDoc(
  root?: vscode.Uri
): Promise<DeepspecMemoryDoc | undefined> {
  const deepspecRoot = root ?? getDeepspecRootUri();
  if (!deepspecRoot) {
    return undefined;
  }

  const memoryUri = getDeepspecMemoryUri(deepspecRoot);
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
  entry: DeepspecMemoryEntry,
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

  await openDeepspecMemoryFile(root);
}

/**
 * Opens `.deepspec/memory.md` in the editor.
 */
export async function openDeepspecMemoryFile(root?: vscode.Uri): Promise<void> {
  const deepspecRoot = root ?? getDeepspecRootUri();
  if (!deepspecRoot) {
    vscode.window.showErrorMessage('Open a workspace folder to view DeepSpec memory.');
    return;
  }
  const memoryUri = getDeepspecMemoryUri(deepspecRoot);
  try {
    const doc = await vscode.workspace.openTextDocument(memoryUri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    vscode.window.showWarningMessage(
      'DeepSpec memory file not found. Complete a task or initialize DeepSpec first.'
    );
  }
}
