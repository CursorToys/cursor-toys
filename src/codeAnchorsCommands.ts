import * as vscode from 'vscode';
import { CodeAnchorsManager } from './codeAnchorsManager';
import { isCodeAnchorsEnabled } from './codeAnchorsConfig';

/**
 * Updates the context key for whether the current line has an anchor.
 */
function updateAnchorContextKey(manager: CodeAnchorsManager): void {
    if (!isCodeAnchorsEnabled()) {
        void vscode.commands.executeCommand('setContext', 'cursorToys.hasAnchorOnCurrentLine', false);
        return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        void vscode.commands.executeCommand('setContext', 'cursorToys.hasAnchorOnCurrentLine', false);
        return;
    }

    const line = editor.selection.active.line;
    const hasAnchor = manager.hasAnchor(editor.document.uri, line);
    void vscode.commands.executeCommand('setContext', 'cursorToys.hasAnchorOnCurrentLine', hasAnchor);
}

function getActiveLine(): number | undefined {
    const editor = vscode.window.activeTextEditor;
    return editor?.selection.active.line;
}

function getActiveUri(): vscode.Uri | undefined {
    return vscode.window.activeTextEditor?.document.uri;
}

/**
 * Registers all code anchor commands.
 */
export function registerCodeAnchorsCommands(context: vscode.ExtensionContext): void {
    const manager = CodeAnchorsManager.getInstance(context);

    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(() => {
            updateAnchorContextKey(manager);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => {
            updateAnchorContextKey(manager);
        })
    );

    context.subscriptions.push(
        manager.onDidChangeAnchors(() => {
            updateAnchorContextKey(manager);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('cursorToys.codeAnchors')) {
                updateAnchorContextKey(manager);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-toys.toggleAnchor', async () => {
            if (!isCodeAnchorsEnabled()) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }

            const line = editor.selection.active.line;
            const added = manager.toggleAnchor(editor.document.uri, line);

            if (added) {
                vscode.window.showInformationMessage(`Anchor added at line ${line + 1}`);
            } else {
                vscode.window.showInformationMessage(`Anchor removed from line ${line + 1}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-toys.addAnchor', async () => {
            if (!isCodeAnchorsEnabled()) {
                return;
            }

            const uri = getActiveUri();
            const line = getActiveLine();
            if (uri === undefined || line === undefined) {
                return;
            }

            if (!manager.hasAnchor(uri, line)) {
                manager.toggleAnchor(uri, line);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-toys.removeAnchor', async () => {
            if (!isCodeAnchorsEnabled()) {
                return;
            }

            const uri = getActiveUri();
            const line = getActiveLine();
            if (uri === undefined || line === undefined) {
                return;
            }

            if (manager.hasAnchor(uri, line)) {
                manager.toggleAnchor(uri, line);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-toys.nextAnchor', async () => {
            if (!isCodeAnchorsEnabled()) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            const currentUri = editor?.document.uri ?? vscode.Uri.parse('file:///');
            const currentLine = editor?.selection.active.line ?? -1;
            const next = manager.getNextAnchorInWorkspace(currentUri, currentLine);

            if (next === undefined) {
                vscode.window.showInformationMessage('No anchors in workspace');
                return;
            }

            try {
                await manager.goToAnchor(next.uri, next.line);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open anchor: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-toys.prevAnchor', async () => {
            if (!isCodeAnchorsEnabled()) {
                return;
            }

            const editor = vscode.window.activeTextEditor;
            const currentUri = editor?.document.uri ?? vscode.Uri.parse('file:///');
            const currentLine = editor?.selection.active.line ?? Number.MAX_SAFE_INTEGER;
            const prev = manager.getPrevAnchorInWorkspace(currentUri, currentLine);

            if (prev === undefined) {
                vscode.window.showInformationMessage('No anchors in workspace');
                return;
            }

            try {
                await manager.goToAnchor(prev.uri, prev.line);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open anchor: ${error}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-toys.clearAnchors', async () => {
            if (!isCodeAnchorsEnabled()) {
                return;
            }

            const allAnchors = manager.getAllAnchors();
            const totalAnchors = Array.from(allAnchors.values()).reduce((sum, lines) => sum + lines.length, 0);

            if (totalAnchors === 0) {
                vscode.window.showInformationMessage('No anchors to clear');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Clear all ${totalAnchors} anchor(s)?`,
                { modal: true },
                'Clear All'
            );

            if (confirm === 'Clear All') {
                manager.clearAnchors();
                vscode.window.showInformationMessage('All anchors cleared');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cursor-toys.goToAnchor', async (uri: vscode.Uri, line: number) => {
            if (!isCodeAnchorsEnabled()) {
                return;
            }

            try {
                await manager.goToAnchor(uri, line);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${error}`);
            }
        })
    );

    updateAnchorContextKey(manager);
}
