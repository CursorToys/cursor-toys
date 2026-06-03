import * as vscode from 'vscode';
import { CodeAnchorsManager } from './codeAnchorsManager';
import { isCodeAnchorsEnabled } from './codeAnchorsConfig';

/**
 * Provides gutter decorations for code anchors.
 * Listens to CodeAnchorsManager changes and updates decorations in all visible editors.
 */
export class CodeAnchorsDecorationProvider {
    private decorationType: vscode.TextEditorDecorationType;
    private manager: CodeAnchorsManager;
    private disposables: vscode.Disposable[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.manager = CodeAnchorsManager.getInstance(context);

        this.decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: vscode.Uri.joinPath(context.extensionUri, 'resources', 'anchor-icon.svg'),
            gutterIconSize: 'contain',
        });

        this.disposables.push(
            this.manager.onDidChangeAnchors(() => {
                this.updateAllEditors();
            })
        );

        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) {
                    this.updateDecorations(editor);
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                const editor = vscode.window.activeTextEditor;
                if (editor && event.document === editor.document) {
                    this.updateDecorations(editor);
                }
            })
        );

        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((event) => {
                if (event.affectsConfiguration('cursorToys.codeAnchors')) {
                    this.updateAllEditors();
                }
            })
        );

        this.updateAllEditors();
    }

    private updateAllEditors(): void {
        for (const editor of vscode.window.visibleTextEditors) {
            this.updateDecorations(editor);
        }
    }

    private updateDecorations(editor: vscode.TextEditor): void {
        if (!isCodeAnchorsEnabled()) {
            editor.setDecorations(this.decorationType, []);
            return;
        }

        const anchors = this.manager.getAnchors(editor.document.uri);
        const decorations: vscode.DecorationOptions[] = anchors.map(line => ({
            range: new vscode.Range(line, 0, line, 0),
        }));

        editor.setDecorations(this.decorationType, decorations);
    }

    public dispose(): void {
        this.decorationType.dispose();
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }
}
