import * as path from 'path';
import * as vscode from 'vscode';
import { parseInlineAnnotations } from './inlineAnnotationParser';
import {
  getInlineAnnotationsSettings,
  getInlineAnnotationTagColor,
  isInlineAnnotationsEnabled,
} from './inlineAnnotationsConfig';

/**
 * Highlights inline annotation comment lines with per-tag background colors.
 */
export class InlineAnnotationsDecorationProvider {
  private decorationTypes = new Map<string, vscode.TextEditorDecorationType>();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          this.updateDecorations(editor);
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        const editor = vscode.window.visibleTextEditors.find(
          (item) => item.document.uri.toString() === document.uri.toString()
        );
        if (editor) {
          this.updateDecorations(editor);
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.visibleTextEditors.find(
          (item) => item.document === event.document
        );
        if (editor) {
          this.updateDecorations(editor);
        }
      })
    );

    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('cursorToys.inlineAnnotations')) {
          this.rebuildDecorationTypes();
          this.updateAllEditors();
        }
      })
    );

    this.rebuildDecorationTypes();
    this.updateAllEditors();
  }

  private rebuildDecorationTypes(): void {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();

    const settings = getInlineAnnotationsSettings();
    const tags = new Set([...settings.tags, ...Object.keys(settings.tagColors)]);

    for (const tag of tags) {
      const backgroundColor = getInlineAnnotationTagColor(tag, settings.tagColors);
      this.decorationTypes.set(
        tag.toLowerCase(),
        vscode.window.createTextEditorDecorationType({
          backgroundColor,
          isWholeLine: true,
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        })
      );
    }
  }

  private updateAllEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.updateDecorations(editor);
    }
  }

  private updateDecorations(editor: vscode.TextEditor): void {
    const settings = getInlineAnnotationsSettings();
    if (!isInlineAnnotationsEnabled() || !settings.highlightComments) {
      this.clearDecorations(editor);
      return;
    }

    if (editor.document.uri.scheme !== 'file') {
      this.clearDecorations(editor);
      return;
    }

    const ext = path.extname(editor.document.uri.fsPath).replace(/^\./, '').toLowerCase();
    if (!settings.fileExtensions.includes(ext)) {
      this.clearDecorations(editor);
      return;
    }

    const parsed = parseInlineAnnotations(editor.document.getText(), settings.tags);
    const rangesByTag = new Map<string, vscode.Range[]>();

    for (const marker of parsed) {
      const lineText = editor.document.lineAt(marker.line).text;
      const ranges = rangesByTag.get(marker.tag) ?? [];
      ranges.push(new vscode.Range(marker.line, 0, marker.line, lineText.length));
      rangesByTag.set(marker.tag, ranges);
    }

    for (const [tag, decorationType] of this.decorationTypes.entries()) {
      editor.setDecorations(decorationType, rangesByTag.get(tag) ?? []);
    }
  }

  private clearDecorations(editor: vscode.TextEditor): void {
    for (const decorationType of this.decorationTypes.values()) {
      editor.setDecorations(decorationType, []);
    }
  }

  dispose(): void {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose();
    }
    this.decorationTypes.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
