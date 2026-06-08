/**
 * Notepads status bar: quick access to the Notepads sidebar view.
 * Visibility is controlled by cursorToys.notepads.showStatusBar configuration.
 */

import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem | undefined;

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cursorToys');
}

function applyNotepadsStatusBarEnabled(enabled: boolean): void {
  if (!statusBarItem) {
    return;
  }
  if (enabled) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

/**
 * Initializes the Notepads status bar item.
 */
export function initNotepadsStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
  statusBarItem.text = '$(note) Notepads';
  statusBarItem.tooltip = 'Focus Notepads';
  statusBarItem.command = 'cursor-toys.focusNotepads';
  context.subscriptions.push(statusBarItem);

  const enabled = getConfig().get<boolean>('notepads.showStatusBar', false);
  applyNotepadsStatusBarEnabled(enabled);

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cursorToys.notepads.showStatusBar')) {
        applyNotepadsStatusBarEnabled(getConfig().get<boolean>('notepads.showStatusBar', false));
      }
    })
  );
}
