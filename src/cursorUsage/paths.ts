import * as path from 'path';

/**
 * Cursor User globalStorage directory (hosts state.vscdb).
 */
export function getCursorGlobalStoragePath(): string {
  const platform = process.platform;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage');
  }
  if (platform === 'win32') {
    const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(appData, 'Cursor', 'User', 'globalStorage');
  }
  return path.join(home, '.config', 'Cursor', 'User', 'globalStorage');
}

/**
 * Path to Cursor global state.vscdb.
 */
export function getStateVscdbPath(): string {
  return path.join(getCursorGlobalStoragePath(), 'state.vscdb');
}

/**
 * Path to SQLite WAL file when present.
 */
export function getStateVscdbWalPath(): string {
  return `${getStateVscdbPath()}-wal`;
}
