import * as path from 'path';

export type BackupCategory =
  | 'rules'
  | 'skills'
  | 'commands'
  | 'prompts'
  | 'agents'
  | 'hooks'
  | 'sync';

/**
 * Formats a timestamp for backup folder/file names.
 */
export function formatBackupTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * Builds a backup destination path without writing.
 */
export function buildBackupDestination(
  backupsRoot: string,
  category: BackupCategory,
  sourcePath: string,
  timestamp: string = formatBackupTimestamp()
): string {
  const baseName = path.basename(sourcePath);
  return path.join(backupsRoot, `${timestamp}-${category}-${baseName}`);
}
