import * as vscode from 'vscode';

/**
 * Updates VS Code context keys for the Projects feature.
 */
export async function syncProjectsContext(): Promise<void> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const enabled = config.get<boolean>('projects.enabled', false);
  await vscode.commands.executeCommand('setContext', 'cursorToys.projects.enabled', enabled);
}

export function isProjectsEnabled(): boolean {
  return vscode.workspace.getConfiguration('cursorToys').get<boolean>('projects.enabled', false);
}

export function shouldOpenProjectsDashboardOnStartup(): boolean {
  return (
    isProjectsEnabled() &&
    vscode.workspace
      .getConfiguration('cursorToys')
      .get<boolean>('projects.openDashboardOnStartup', false)
  );
}

export function shouldOpenProjectInNewWindow(): boolean {
  return vscode.workspace
    .getConfiguration('cursorToys')
    .get<boolean>('projects.openInNewWindow', false);
}
