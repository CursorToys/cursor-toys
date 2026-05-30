import * as vscode from 'vscode';
import { deepspecSpecsExist, getDeepspecRootUri, getWorkspaceFolderUri } from './deepspecPaths';

export const DEEPSPEC_NEEDS_INIT_CONTEXT = 'cursorToys.deepspec.needsInit';
export const DEEPSPEC_PANEL_ENABLED_CONTEXT = 'cursorToys.deepspec.panelEnabled';

const EXPERIMENTAL_DEEPSPEC_KEY = 'experimental.deepspec';
const LEGACY_EXPERIMENTAL_DEEPFLOW_KEY = 'experimental.deepflow';
const LEGACY_DEEPSPEC_ENABLED_KEY = 'deepspec.enabled';
const LEGACY_DEEPFLOW_ENABLED_KEY = 'deepflow.enabled';

function hasConfiguredValue(config: vscode.WorkspaceConfiguration, key: string): boolean {
  const inspected = config.inspect<boolean>(key);
  return (
    inspected?.globalValue !== undefined ||
    inspected?.workspaceValue !== undefined ||
    inspected?.workspaceFolderValue !== undefined
  );
}

/**
 * Reads whether the DeepSpec sidebar section is enabled (default: false, experimental).
 */
export function isDeepspecPanelEnabled(): boolean {
  const config = vscode.workspace.getConfiguration('cursorToys');
  if (hasConfiguredValue(config, EXPERIMENTAL_DEEPSPEC_KEY)) {
    return config.get<boolean>(EXPERIMENTAL_DEEPSPEC_KEY, false);
  }
  if (hasConfiguredValue(config, LEGACY_EXPERIMENTAL_DEEPFLOW_KEY)) {
    return config.get<boolean>(LEGACY_EXPERIMENTAL_DEEPFLOW_KEY, false);
  }
  if (hasConfiguredValue(config, LEGACY_DEEPSPEC_ENABLED_KEY)) {
    return config.get<boolean>(LEGACY_DEEPSPEC_ENABLED_KEY, false);
  }
  return config.get<boolean>(LEGACY_DEEPFLOW_ENABLED_KEY, false);
}

/**
 * Updates context so the DeepSpec view shows or hides in the CursorToys sidebar.
 */
export async function syncDeepspecPanelEnabled(): Promise<void> {
  await vscode.commands.executeCommand(
    'setContext',
    DEEPSPEC_PANEL_ENABLED_CONTEXT,
    isDeepspecPanelEnabled()
  );
}

/**
 * Sets VS Code context so DeepSpec initialize actions show when specs are missing.
 */
export async function syncDeepspecNeedsInit(): Promise<void> {
  if (!isDeepspecPanelEnabled()) {
    await vscode.commands.executeCommand('setContext', DEEPSPEC_NEEDS_INIT_CONTEXT, false);
    return;
  }
  const folder = getWorkspaceFolderUri();
  const root = getDeepspecRootUri(folder);
  let needsInit = true;
  if (folder && root) {
    needsInit = !(await deepspecSpecsExist(root));
  }
  await vscode.commands.executeCommand('setContext', DEEPSPEC_NEEDS_INIT_CONTEXT, needsInit);
}
