import * as vscode from 'vscode';

/**
 * Opens user settings.json (toolbar action on the Settings view).
 */
export function openUserSettingsJson(): void {
  setTimeout(() => {
    void vscode.commands.executeCommand('workbench.action.openSettingsJson');
  }, 0);
}
