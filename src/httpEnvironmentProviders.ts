/**
 * Re-exports language providers; decoration provider remains here.
 */
export {
  HttpRequestHoverProvider,
  HttpRequestCompletionProvider,
  HttpRequestDefinitionProvider,
  HttpRequestDocumentFormattingProvider,
  HttpVariableHoverProvider,
  HttpEnvironmentCompletionProvider,
} from './httpLanguageProviders';

import * as vscode from 'vscode';
import { isExtensionPausedForSettingsUi } from './settingsUiGuard';
import { isHttpRequestFile } from './utils';

/**
 * Provides decorations for environment decorators to style them as comments
 */
export class HttpEnvironmentDecorationProvider {
  private decorationType: vscode.TextEditorDecorationType;
  private timeout: NodeJS.Timeout | undefined;

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      color: new vscode.ThemeColor('editorLineNumber.foreground'),
      opacity: '0.6',
      fontStyle: 'italic',
    });
  }

  public updateDecorations(): void {
    vscode.window.visibleTextEditors.forEach((editor) => {
      this.updateDecorationsForEditor(editor);
    });
  }

  private updateDecorationsForEditor(editor: vscode.TextEditor): void {
    if (!isHttpRequestFile(editor.document.uri.fsPath)) {
      return;
    }

    const decorations: vscode.DecorationOptions[] = [];
    const lines = editor.document.getText().split('\n');

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#\s*@env\s+\w+)/);
      if (match) {
        decorations.push({
          range: new vscode.Range(i, 0, i, match[1].length),
        });
      }
    }

    editor.setDecorations(this.decorationType, decorations);
  }

  public triggerUpdateDecorations(): void {
    if (isExtensionPausedForSettingsUi()) {
      return;
    }
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
    this.timeout = setTimeout(() => {
      this.updateDecorations();
    }, 100);
  }

  public dispose(): void {
    this.decorationType.dispose();
  }
}
