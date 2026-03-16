/**
 * Reads the Cursor session token from the local state.vscdb SQLite database.
 * Used for auto-detecting the WorkosCursorSessionToken when spending feature is enabled.
 */

import * as path from 'path';
import * as fs from 'fs';

/** Max size (bytes) of state.vscdb to attempt reading; larger files are skipped to avoid hangs. */
const MAX_STATE_VSCDB_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

/** ItemTable keys to try for session/access token (Cursor may change these). */
const TOKEN_KEYS = ['cursorAuth/accessToken', 'cursorAuth/refreshToken'];

/**
 * Returns the Cursor User globalStorage directory path for the current platform.
 * This is where state.vscdb lives for the Cursor application.
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
 * Tries to extract a string token from a value that may be a plain string or JSON.
 */
function extractTokenFromValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (typeof obj.accessToken === 'string') {
        return obj.accessToken;
      }
      if (typeof obj.token === 'string') {
        return obj.token;
      }
      if (typeof obj.value === 'string') {
        return obj.value;
      }
    } catch {
      return null;
    }
    return null;
  }
  return trimmed;
}

/**
 * Reads the session token from Cursor's state.vscdb (ItemTable).
 * Returns null if file is missing, too large, or token cannot be read.
 * Uses sql.js to query ItemTable for known auth keys.
 */
export async function readTokenFromStateVscdb(): Promise<string | null> {
  const basePath = getCursorGlobalStoragePath();
  const dbPath = path.join(basePath, 'state.vscdb');

  try {
    if (!fs.existsSync(dbPath)) {
      return null;
    }
    const stat = fs.statSync(dbPath);
    if (!stat.isFile() || stat.size > MAX_STATE_VSCDB_SIZE_BYTES || stat.size === 0) {
      return null;
    }

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(fileBuffer as unknown as Uint8Array);

    try {
      for (const key of TOKEN_KEYS) {
        const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
        stmt.bind([key]);
        if (stmt.step()) {
          const row = stmt.get();
          stmt.free();
          const value = row && row[0];
          const str = typeof value === 'string' ? value : value != null ? String(value) : '';
          const token = extractTokenFromValue(str);
          if (token) {
            return token;
          }
        } else {
          stmt.free();
        }
      }
      return null;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}
