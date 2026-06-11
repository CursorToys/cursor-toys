import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getCursorMcpJsonPath } from '../mcpbInstaller';
import { createMcpDocsSkill } from '../utils';
import { registerMcpServerInCursorConfig } from './mcpConfig';

/**
 * Opens the global Cursor MCP config file (~/.cursor/mcp.json).
 */
export async function openCursorMcpJson(): Promise<void> {
  const mcpJsonPath = getCursorMcpJsonPath();
  const dir = path.dirname(mcpJsonPath);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
  } catch {
    // ignore
  }
  if (!fs.existsSync(mcpJsonPath)) {
    await fs.promises.writeFile(mcpJsonPath, JSON.stringify({ mcpServers: {} }, null, 2), 'utf8');
  }
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(mcpJsonPath));
  await vscode.window.showTextDocument(doc);
}

/**
 * Installs the bundled cursor-toys-mcp agent skill (project or personal).
 */
export async function installMcpSkill(context: vscode.ExtensionContext): Promise<void> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  await createMcpDocsSkill({
    extensionPath: context.extensionPath,
    workspacePath,
  });
}

/**
 * Registers the CursorToys MCP server entry in ~/.cursor/mcp.json.
 */
export async function registerMcpInCursorConfig(context: vscode.ExtensionContext): Promise<void> {
  try {
    registerMcpServerInCursorConfig(context.extensionPath);
    void vscode.window.showInformationMessage(
      'CursorToys MCP server registered in ~/.cursor/mcp.json. Reload the window or reconnect MCP for agents to use it.'
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Failed to update mcp.json: ${message}`);
  }
}
