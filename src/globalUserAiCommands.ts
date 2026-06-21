import * as vscode from 'vscode';
import { spawnHookPlaceholders } from './hooksManager';
import { syncAssetToGlobal, syncAssetToWorkspace } from './syncAssetManager';
import { refreshControlViewIfVisible } from './control/controlViewProvider';
import { refreshUserAgentsTree } from './userAgentsTreeProvider';
import { getGlobalCursorRoot, getPersonalHooksPath } from './utils';

/**
 * Registers global user AI management commands (sync, hook placeholders).
 */
export function registerGlobalUserAiCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-toys.spawnHookPlaceholders', async () => {
      const hooksPath = getPersonalHooksPath();
      const created = await spawnHookPlaceholders(hooksPath);
      refreshControlViewIfVisible();
      vscode.window.showInformationMessage(
        created.length
          ? `Created ${created.length} hook placeholder script(s).`
          : 'All hook placeholders already exist.'
      );
    }),
    vscode.commands.registerCommand(
      'cursor-toys.syncAssetToWorkspace',
      async (category?: string, name?: string) => {
        const cat = category ?? (await vscode.window.showQuickPick(
          ['rules', 'skills', 'commands', 'prompts', 'agents', 'hooks'],
          { title: 'Asset category to sync to workspace' }
        ));
        if (!cat) {
          return;
        }
        const assetName =
          name ??
          (await vscode.window.showInputBox({
            title: 'Asset name (file or skill folder)',
            placeHolder: 'my-rule',
          }));
        if (!assetName) {
          return;
        }
        const preview = await syncAssetToWorkspace({
          category: cat,
          name: assetName,
          dryRun: true,
        });
        if (preview.wouldOverwrite) {
          const ok = await vscode.window.showWarningMessage(
            `Overwrite workspace target? ${preview.diffSummary}`,
            { modal: true },
            'Sync with backup'
          );
          if (ok !== 'Sync with backup') {
            return;
          }
        }
        const result = await syncAssetToWorkspace({ category: cat, name: assetName, confirm: true });
        refreshControlViewIfVisible();
        vscode.window.showInformationMessage(
          result.backupPath
            ? `Synced to workspace (backup: ${result.backupPath})`
            : 'Synced to workspace.'
        );
      }
    ),
    vscode.commands.registerCommand(
      'cursor-toys.syncAssetToGlobal',
      async (category?: string, name?: string) => {
        const cat = category ?? (await vscode.window.showQuickPick(
          ['rules', 'skills', 'commands', 'prompts', 'agents', 'hooks'],
          { title: 'Asset category to sync to global' }
        ));
        if (!cat) {
          return;
        }
        const assetName =
          name ??
          (await vscode.window.showInputBox({
            title: 'Asset name (file or skill folder)',
            placeHolder: 'my-rule',
          }));
        if (!assetName) {
          return;
        }
        const preview = await syncAssetToGlobal({
          category: cat,
          name: assetName,
          dryRun: true,
        });
        if (preview.wouldOverwrite) {
          const ok = await vscode.window.showWarningMessage(
            `Overwrite global target? ${preview.diffSummary}`,
            { modal: true },
            'Sync with backup'
          );
          if (ok !== 'Sync with backup') {
            return;
          }
        }
        const result = await syncAssetToGlobal({ category: cat, name: assetName, confirm: true });
        refreshControlViewIfVisible();
        vscode.window.showInformationMessage(
          result.backupPath
            ? `Synced to global (backup: ${result.backupPath})`
            : 'Synced to global.'
        );
      }
    )
  );
}

/**
 * Watches the global Cursor root for Control Panel refresh (debounced).
 */
export function registerGlobalCursorWatcher(context: vscode.ExtensionContext): void {
  const pattern = new vscode.RelativePattern(vscode.Uri.file(getGlobalCursorRoot()), '**/*');
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      refreshControlViewIfVisible();
      refreshUserAgentsTree();
    }, 400);
  };
  watcher.onDidCreate(refresh);
  watcher.onDidChange(refresh);
  watcher.onDidDelete(refresh);
  context.subscriptions.push(watcher);
}
