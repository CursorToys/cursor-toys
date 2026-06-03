import * as vscode from 'vscode';
import { CodeAnchorsManager } from './codeAnchorsManager';
import { isCodeAnchorsEnabled, isCodeAnchorsStatusBarEnabled } from './codeAnchorsConfig';

/**
 * Status bar items for code anchors navigation.
 * Shows backward/forward buttons and anchor count when anchors exist in the workspace.
 */
export class CodeAnchorsStatusBar {
    private prevButton: vscode.StatusBarItem;
    private nextButton: vscode.StatusBarItem;
    private countItem: vscode.StatusBarItem;
    private manager: CodeAnchorsManager;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.manager = CodeAnchorsManager.getInstance(context);

        this.prevButton = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            52
        );
        this.prevButton.name = 'Previous Anchor';
        this.prevButton.text = '$(arrow-left)';
        this.prevButton.tooltip = 'Go to previous anchor in workspace';
        this.prevButton.command = 'cursor-toys.prevAnchor';

        this.countItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            51
        );
        this.countItem.name = 'Code Anchors Count';
        this.countItem.command = 'cursor-toys.toggleAnchor';

        this.nextButton = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            50
        );
        this.nextButton.name = 'Next Anchor';
        this.nextButton.text = '$(arrow-right)';
        this.nextButton.tooltip = 'Go to next anchor in workspace';
        this.nextButton.command = 'cursor-toys.nextAnchor';

        this.disposables.push(
            this.manager.onDidChangeAnchors(() => {
                this.update();
            })
        );

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.update();
            })
        );

        this.disposables.push(
            vscode.window.onDidChangeTextEditorSelection(() => {
                this.updateCountTooltip();
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('cursorToys.codeAnchors')) {
                    this.update();
                }
            })
        );

        this.update();
    }

    private update(): void {
        if (!isCodeAnchorsStatusBarEnabled()) {
            this.prevButton.hide();
            this.nextButton.hide();
            this.countItem.hide();
            return;
        }

        const locations = this.manager.getAllAnchorLocations();
        const totalAnchors = locations.length;

        if (totalAnchors === 0) {
            this.prevButton.hide();
            this.nextButton.hide();
            this.countItem.hide();
            void vscode.commands.executeCommand('setContext', 'cursorToys.hasAnchors', false);
            return;
        }

        void vscode.commands.executeCommand('setContext', 'cursorToys.hasAnchors', true);

        this.prevButton.show();
        this.nextButton.show();

        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const index = this.manager.getWorkspaceAnchorIndex(
                editor.document.uri,
                editor.selection.active.line
            );
            this.countItem.text = `$(bookmark) ${index}/${totalAnchors}`;
        } else {
            this.countItem.text = `$(bookmark) ${totalAnchors}`;
        }

        this.updateCountTooltip();
        this.countItem.show();
    }

    private updateCountTooltip(): void {
        const locations = this.manager.getAllAnchorLocations();
        const totalAnchors = locations.length;
        const editor = vscode.window.activeTextEditor;

        let tooltip = `Code Anchors: ${totalAnchors} total in workspace`;

        if (editor && totalAnchors > 0) {
            const index = this.manager.getWorkspaceAnchorIndex(
                editor.document.uri,
                editor.selection.active.line
            );
            tooltip += `\nPosition ${index}/${totalAnchors} in workspace order`;
        }

        tooltip += '\nClick to toggle anchor on current line';
        this.countItem.tooltip = tooltip;
    }

    public dispose(): void {
        this.prevButton.dispose();
        this.nextButton.dispose();
        this.countItem.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
