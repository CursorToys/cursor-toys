import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getExtensionDataFolderName, getUserHomePath } from '../utils';

export interface McpAuditEntry {
  timestamp: string;
  tool: string;
  ok: boolean;
  durationMs: number;
  error?: string;
}

/**
 * Resolves the MCP audit log path (workspace .cursortoys/ or global ~/.cursortoys/).
 */
export function getMcpAuditLogPath(): string {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const dataFolder = `.${getExtensionDataFolderName()}`;
  const root = workspacePath
    ? path.join(workspacePath, dataFolder)
    : path.join(getUserHomePath(), dataFolder);
  return path.join(root, 'mcp-audit.log');
}

/**
 * Appends one MCP tool invocation line to the audit log when enabled.
 */
export function appendMcpAuditLog(entry: Omit<McpAuditEntry, 'timestamp'>): void {
  const config = vscode.workspace.getConfiguration('cursorToys');
  if (!config.get<boolean>('mcp.auditLogEnabled', false)) {
    return;
  }

  const logPath = getMcpAuditLogPath();
  const line: McpAuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  };

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const payload = JSON.stringify(line);
    fs.appendFileSync(logPath, `${payload}\n`, 'utf8');
  } catch (err) {
    console.error('[CursorToys MCP] Failed to write audit log:', err);
  }
}
