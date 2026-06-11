import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getCursorMcpJsonPath, type CursorMcpJson } from '../mcpbInstaller';
import { getUserHomePath } from '../utils';
import type { McpConnectionInfo } from './types';

const SYSTEM_NODE_CANDIDATES = [
  '/usr/bin/node',
  '/usr/local/bin/node',
  '/opt/homebrew/bin/node',
];

export const MCP_SERVER_ID = 'cursor-toys';
export const MCP_CONNECTION_FILE = 'cursortoys-mcp-connection.json';

/**
 * Path to the IPC connection info file (~/.cursor/cursortoys-mcp-connection.json).
 */
export function getMcpConnectionFilePath(): string {
  return path.join(getUserHomePath(), '.cursor', MCP_CONNECTION_FILE);
}

/**
 * Writes connection info for the MCP subprocess.
 */
export function writeMcpConnectionInfo(info: McpConnectionInfo): void {
  const filePath = getMcpConnectionFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(info, null, 2), 'utf8');
}

/**
 * Removes the connection info file.
 */
export function removeMcpConnectionInfo(): void {
  const filePath = getMcpConnectionFilePath();
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore
  }
}

/**
 * Resolves a Node executable for MCP subprocesses.
 * Cursor spawns MCP without shell PATH (nvm/Homebrew often missing) — use embedded runtime when possible.
 */
export function resolveMcpNodeCommand(): { command: string; extraEnv?: Record<string, string> } {
  if (process.versions.electron) {
    return {
      command: process.execPath,
      extraEnv: { ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  for (const candidate of SYSTEM_NODE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      return { command: candidate };
    }
  }

  try {
    const lookupCmd = process.platform === 'win32' ? 'where' : 'which';
    const output = execFileSync(lookupCmd, ['node'], { encoding: 'utf8' }).trim();
    const resolved =
      process.platform === 'win32' ? output.split(/\r?\n/).find((line) => line.trim())?.trim() : output;
    if (resolved && fs.existsSync(resolved)) {
      return { command: resolved };
    }
  } catch {
    // ignore
  }

  return { command: 'node' };
}

/**
 * Builds the MCP server config entry for mcp.json.
 */
export function buildMcpServerEntry(extensionPath: string): {
  command: string;
  args: string[];
  env: Record<string, string>;
} {
  const serverScript = path.join(extensionPath, 'out', 'mcp', 'stdioServer.js');
  const { command, extraEnv } = resolveMcpNodeCommand();
  return {
    command,
    args: [serverScript],
    env: {
      ...extraEnv,
      CURSORTOYS_IPC_CONFIG: getMcpConnectionFilePath(),
    },
  };
}

/**
 * Registers or updates the CursorToys MCP server in ~/.cursor/mcp.json.
 */
export function registerMcpServerInCursorConfig(extensionPath: string): void {
  const mcpJsonPath = getCursorMcpJsonPath();
  const dir = path.dirname(mcpJsonPath);
  fs.mkdirSync(dir, { recursive: true });

  let config: CursorMcpJson = {};
  if (fs.existsSync(mcpJsonPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')) as CursorMcpJson;
    } catch {
      config = {};
    }
  }
  if (!config.mcpServers) {
    config.mcpServers = {};
  }
  config.mcpServers[MCP_SERVER_ID] = buildMcpServerEntry(extensionPath);
  fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2), 'utf8');
}

/**
 * Removes the CursorToys MCP server from ~/.cursor/mcp.json.
 */
export function unregisterMcpServerFromCursorConfig(): void {
  const mcpJsonPath = getCursorMcpJsonPath();
  if (!fs.existsSync(mcpJsonPath)) {
    return;
  }
  try {
    const config = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')) as CursorMcpJson;
    if (config.mcpServers?.[MCP_SERVER_ID]) {
      delete config.mcpServers[MCP_SERVER_ID];
      fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2), 'utf8');
    }
  } catch {
    // ignore invalid json
  }
}
