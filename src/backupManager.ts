import * as path from 'path';
import * as vscode from 'vscode';
import { buildPersonalBackupsPath } from './globalCursorPaths';
import { buildBackupDestination, type BackupCategory } from './backupPathUtils';
import { getGlobalCursorRoot } from './utils';

export type { BackupCategory } from './backupPathUtils';
export { formatBackupTimestamp, buildBackupDestination } from './backupPathUtils';

/**
 * Creates a timestamped backup copy of a file or directory before mutation.
 */
export async function backupBeforeWrite(
  sourcePath: string,
  category: BackupCategory
): Promise<string | null> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(sourcePath));
  } catch {
    return null;
  }

  const backupsRoot = buildPersonalBackupsPath(getGlobalCursorRoot());
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(backupsRoot));

  const dest = buildBackupDestination(backupsRoot, category, sourcePath);
  const stat = await vscode.workspace.fs.stat(vscode.Uri.file(sourcePath));
  if (stat.type === vscode.FileType.Directory) {
    await copyDirectoryRecursive(sourcePath, dest);
  } else {
    await vscode.workspace.fs.copy(vscode.Uri.file(sourcePath), vscode.Uri.file(dest), {
      overwrite: true,
    });
  }
  return dest;
}

async function copyDirectoryRecursive(source: string, dest: string): Promise<void> {
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(dest));
  const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(source));
  for (const [name, type] of entries) {
    const from = path.join(source, name);
    const to = path.join(dest, name);
    if (type === vscode.FileType.Directory) {
      await copyDirectoryRecursive(from, to);
    } else {
      await vscode.workspace.fs.copy(vscode.Uri.file(from), vscode.Uri.file(to), {
        overwrite: true,
      });
    }
  }
}
