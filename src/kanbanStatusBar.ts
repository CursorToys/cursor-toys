/**
 * Kanban status bar: shows a Kanban icon in the status bar for quick access to the Kanban board.
 * Visibility is controlled by cursorToys.kanban.showStatusBar configuration.
 */

import * as vscode from 'vscode';

let statusBarItem: vscode.StatusBarItem | undefined;

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cursorToys');
}

function applyKanbanStatusBarEnabled(enabled: boolean): void {
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
 * Initializes the Kanban status bar. Creates the status bar item and controls visibility
 * based on cursorToys.kanban.showStatusBar configuration.
 */
export function initKanbanStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99
  );
  statusBarItem.text = '$(tasklist) Kanban';
  statusBarItem.tooltip = 'Open Kanban Board';
  statusBarItem.command = 'cursor-toys.openKanbanBoard';
  context.subscriptions.push(statusBarItem);

  const config = getConfig();
  const enabled = config.get<boolean>('kanban.showStatusBar', false);
  if (enabled) {
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cursorToys.kanban.showStatusBar')) {
        const newEnabled = getConfig().get<boolean>('kanban.showStatusBar', false);
        applyKanbanStatusBarEnabled(newEnabled);
      }
    })
  );
}
