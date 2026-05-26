import * as vscode from 'vscode';
import { deepflowSpecsExist, getDeepflowRootUri, getWorkspaceFolderUri } from './deepflowPaths';

export const DEEPFLOW_NEEDS_INIT_CONTEXT = 'cursorToys.deepflow.needsInit';
export const DEEPFLOW_PANEL_ENABLED_CONTEXT = 'cursorToys.deepflow.panelEnabled';

const EXPERIMENTAL_DEEPFLOW_KEY = 'experimental.deepflow';
const LEGACY_DEEPFLOW_ENABLED_KEY = 'deepflow.enabled';

/**
 * Reads whether the DeepFlow activity bar panel is enabled (default: false, experimental).
 */
export function isDeepflowPanelEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const experimental = config.inspect<boolean>(EXPERIMENTAL_DEEPFLOW_KEY);
  if (
    experimental?.globalValue !== undefined ||
    experimental?.workspaceValue !== undefined ||
    experimental?.workspaceFolderValue !== undefined
  ) {
    return config.get<boolean>(EXPERIMENTAL_DEEPFLOW_KEY, false);
  }
  return config.get<boolean>(LEGACY_DEEPFLOW_ENABLED_KEY, false);
}

/**
 * Updates context so the DeepFlow activity bar icon and views show or hide.
 */
export async function syncDeepflowPanelEnabled(): Promise<void> {
  await vscode.commands.executeCommand(
    'setContext',
    DEEPFLOW_PANEL_ENABLED_CONTEXT,
    isDeepflowPanelEnabled()
  );
}

/**
 * Sets VS Code context so DeepFlow initialize actions show when specs are missing.
 */
export async function syncDeepflowNeedsInit(): Promise<void> {
  if (!isDeepflowPanelEnabled()) {
    await vscode.commands.executeCommand('setContext', DEEPFLOW_NEEDS_INIT_CONTEXT, false);
    return;
  }
  const folder = getWorkspaceFolderUri();
  const root = getDeepflowRootUri(folder);
  let needsInit = true;
  if (folder && root) {
    needsInit = !(await deepflowSpecsExist(root));
  }
  await vscode.commands.executeCommand('setContext', DEEPFLOW_NEEDS_INIT_CONTEXT, needsInit);
}
