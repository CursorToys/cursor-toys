import * as vscode from 'vscode';
import * as path from 'path';
import {
  DeepFlowStage,
  getDeepflowMemoryUri,
  getDeepflowRootUri,
  getDeepflowSpecsUri,
  getStageFromTaskUri,
  parseTaskFolderName,
  readAbcFile,
} from './deepflowPaths';

const MEMORY_HEADER = `# DeepFlow Memory

## Archived Tasks

<!-- Entries appended on task completion: [YYYY-MM-DD] [NN]: summary. Ref: specs/archive/[NN]-[name] -->

## Lessons

<!-- Reusable gotchas from completed tasks -->
`;

/**
 * Builds a memory.md index line per DeepFlow convention.
 */
export function buildMemoryIndexLine(taskFolderName: string, summary: string): string {
  const parsed = parseTaskFolderName(taskFolderName);
  const nn = parsed ? String(parsed.num).padStart(2, '0') : taskFolderName.split('-')[0] ?? '?';
  const date = new Date().toISOString().slice(0, 10);
  const cleanSummary = summary.replace(/\s+/g, ' ').trim();
  return `[${date}] [${nn}]: ${cleanSummary}. Ref: specs/archive/${taskFolderName}`;
}

/**
 * Extracts a one-line summary from BUSINESS_CONTEXT (first markdown heading or first non-empty line).
 */
export async function inferTaskSummary(taskFolderUri: vscode.Uri): Promise<string> {
  const bc = await readAbcFile(taskFolderUri, 'BUSINESS_CONTEXT');
  if (!bc) {
    return 'Task completed';
  }
  for (const line of bc.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      return trimmed.replace(/^#+\s*/, '').trim() || 'Task completed';
    }
    if (trimmed.length > 0) {
      return trimmed.slice(0, 120);
    }
  }
  return 'Task completed';
}

async function ensureMemoryFile(memoryUri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.stat(memoryUri);
  } catch {
    await vscode.workspace.fs.writeFile(memoryUri, Buffer.from(MEMORY_HEADER, 'utf8'));
  }
}

async function appendMemoryIndexLine(root: vscode.Uri, line: string): Promise<void> {
  const memoryUri = getDeepflowMemoryUri(root);
  await ensureMemoryFile(memoryUri);
  const existing = Buffer.from(await vscode.workspace.fs.readFile(memoryUri)).toString('utf8');
  const marker = '## Lessons';
  let updated: string;
  if (existing.includes(marker)) {
    updated = existing.replace(marker, `${line}\n\n${marker}`);
  } else {
    updated = `${existing.trimEnd()}\n${line}\n`;
  }
  await vscode.workspace.fs.writeFile(memoryUri, Buffer.from(updated, 'utf8'));
}

/**
 * Moves a draft task to active/ after confirmation.
 */
export async function approveTask(taskFolderUri: vscode.Uri): Promise<void> {
  const stage = getStageFromTaskUri(taskFolderUri);
  if (stage !== 'drafts') {
    vscode.window.showErrorMessage('Only draft tasks can be approved.');
    return;
  }

  const folderName = path.basename(taskFolderUri.fsPath);
  const confirm = await vscode.window.showWarningMessage(
    `Approve task "${folderName}"? It will move to active execution.`,
    { modal: true },
    'Approve'
  );
  if (confirm !== 'Approve') {
    return;
  }

  const root = getDeepflowRootUri();
  if (!root) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const specsUri = getDeepflowSpecsUri(root);
  const targetUri = vscode.Uri.joinPath(specsUri, 'active', folderName);

  try {
    await vscode.workspace.fs.stat(targetUri);
    vscode.window.showErrorMessage(`Active task "${folderName}" already exists.`);
    return;
  } catch {
    // target free
  }

  try {
    await vscode.workspace.fs.rename(taskFolderUri, targetUri, { overwrite: false });
    vscode.window.showInformationMessage(`Plan approved. "${folderName}" is now in active execution.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to approve task: ${error}`);
  }
}

/**
 * Moves an active task to archive/ and appends memory.md index line.
 */
export async function completeTask(
  taskFolderUri: vscode.Uri,
  summary?: string
): Promise<void> {
  const stage = getStageFromTaskUri(taskFolderUri);
  if (stage !== 'active') {
    vscode.window.showErrorMessage('Only active tasks can be completed.');
    return;
  }

  const folderName = path.basename(taskFolderUri.fsPath);
  const resolvedSummary =
    summary?.trim() || (await inferTaskSummary(taskFolderUri));

  const confirm = await vscode.window.showWarningMessage(
    `Complete task "${folderName}"? It will move to archive.`,
    { modal: true },
    'Complete'
  );
  if (confirm !== 'Complete') {
    return;
  }

  const root = getDeepflowRootUri();
  if (!root) {
    vscode.window.showErrorMessage('No workspace folder open.');
    return;
  }

  const specsUri = getDeepflowSpecsUri(root);
  const targetUri = vscode.Uri.joinPath(specsUri, 'archive', folderName);

  try {
    await vscode.workspace.fs.stat(targetUri);
    vscode.window.showErrorMessage(`Archived task "${folderName}" already exists.`);
    return;
  } catch {
    // target free
  }

  try {
    await vscode.workspace.fs.rename(taskFolderUri, targetUri, { overwrite: false });
    const indexLine = buildMemoryIndexLine(folderName, resolvedSummary);
    await appendMemoryIndexLine(root, indexLine);
    vscode.window.showInformationMessage(`Task "${folderName}" completed and archived.`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to complete task: ${error}`);
  }
}

/**
 * Validates that a URI is under the expected stage folder.
 */
export function isTaskInStage(taskFolderUri: vscode.Uri, expected: DeepFlowStage): boolean {
  return getStageFromTaskUri(taskFolderUri) === expected;
}
