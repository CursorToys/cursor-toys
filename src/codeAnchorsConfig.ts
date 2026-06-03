import * as vscode from 'vscode';

const ENABLED_CONTEXT_KEY = 'cursorToys.codeAnchorsEnabled';

/**
 * Returns whether the code anchors feature is enabled.
 */
export function isCodeAnchorsEnabled(): boolean {
    return vscode.workspace.getConfiguration('cursorToys').get<boolean>('codeAnchors.enabled', true);
}

/**
 * Returns whether the status bar navigation controls should be shown.
 */
export function isCodeAnchorsStatusBarEnabled(): boolean {
    if (!isCodeAnchorsEnabled()) {
        return false;
    }
    return vscode.workspace.getConfiguration('cursorToys').get<boolean>('codeAnchors.showStatusBar', true);
}

/**
 * Syncs VS Code context keys used in menu and view `when` clauses.
 */
export function syncCodeAnchorsContext(): void {
    const enabled = isCodeAnchorsEnabled();
    void vscode.commands.executeCommand('setContext', ENABLED_CONTEXT_KEY, enabled);
}

/**
 * Registers a listener that keeps code anchor context keys in sync with settings.
 */
export function registerCodeAnchorsConfigListener(context: vscode.ExtensionContext): void {
    syncCodeAnchorsContext();
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('cursorToys.codeAnchors')) {
                syncCodeAnchorsContext();
            }
        })
    );
}
