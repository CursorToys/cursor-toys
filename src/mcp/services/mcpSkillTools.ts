import * as vscode from 'vscode';
import { createMcpDocsSkill, MCP_DOCS_SKILL_NAME } from '../../utils';
import type { McpHostContext } from '../types';

/**
 * Installs the bundled cursor-toys-mcp skill via MCP tool invocation.
 */
export async function mcpInstallSkill(
  ctx: McpHostContext,
  args: Record<string, unknown>
): Promise<unknown> {
  const installPersonal = args.installPersonal as boolean | undefined;
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const skillPath = await createMcpDocsSkill({
    extensionPath: ctx.extensionPath,
    workspacePath,
    installPersonal,
  });
  if (!skillPath) {
    return { installed: false, skill: MCP_DOCS_SKILL_NAME };
  }
  return { installed: true, skill: MCP_DOCS_SKILL_NAME, path: skillPath };
}

export function buildMcpSkillToolHandlers(ctx: McpHostContext): Record<
  string,
  (args: Record<string, unknown>) => Promise<unknown>
> {
  return {
    mcp_install_skill: (args) => mcpInstallSkill(ctx, args),
  };
}
