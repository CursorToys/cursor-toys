/**
 * @deprecated Prefer `cursorUsage` module. Kept for backward compatibility.
 */

import { readLocalCredentials } from './cursorUsage/auth';
import { getCursorGlobalStoragePath, getStateVscdbPath } from './cursorUsage/paths';

export { getCursorGlobalStoragePath, getStateVscdbPath };

/**
 * Reads the JWT access token from Cursor's state.vscdb (ItemTable).
 */
export async function readTokenFromStateVscdb(): Promise<string | null> {
  const creds = readLocalCredentials();
  return creds?.jwt ?? null;
}
