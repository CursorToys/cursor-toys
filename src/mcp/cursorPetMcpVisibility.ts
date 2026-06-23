/**
 * Reads Cursor Pet MCP visibility from the IPC connection file (no vscode imports).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { McpConnectionInfo } from './types';

const MCP_CONNECTION_FILE = 'cursortoys-mcp-connection.json';

function getConnectionFilePath(): string {
  return path.join(os.homedir(), '.cursor', MCP_CONNECTION_FILE);
}

/**
 * Returns whether Cursor Pet MCP tools/resources/prompts should be exposed.
 * Falls back to false when the connection file is missing or unreadable.
 */
export function isCursorPetMcpCatalogEnabled(): boolean {
  try {
    const raw = fs.readFileSync(getConnectionFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as McpConnectionInfo;
    return parsed.features?.cursorPet === true;
  } catch {
    return false;
  }
}
