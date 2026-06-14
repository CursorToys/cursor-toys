import * as vscode from 'vscode';
import {
  InlineAnnotationNavigationTarget,
  InlineAnnotationMarker,
  InlineAnnotationStore,
} from './inlineAnnotationStore';

/**
 * VS Code wrapper around the inline annotation store with editor navigation.
 */
export class InlineAnnotationIndex {
  private readonly store = new InlineAnnotationStore();
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChange = this._onDidChange.event;

  constructor() {
    this.store.onChange(() => {
      this._onDidChange.fire();
    });
  }

  replaceFileMarkers(filePath: string, markers: InlineAnnotationMarker[]): void {
    this.store.replaceFileMarkers(filePath, markers);
  }

  removeFile(filePath: string): void {
    this.store.removeFile(filePath);
  }

  replaceAll(markers: InlineAnnotationMarker[]): void {
    this.store.replaceAll(markers);
  }

  clear(): void {
    this.store.clear();
  }

  getAllSorted(): InlineAnnotationMarker[] {
    return this.store.getAllSorted();
  }

  getTags(): string[] {
    return this.store.getTags();
  }

  getByTag(tag: string): InlineAnnotationMarker[] {
    return this.store.getByTag(tag);
  }

  getGroupedByTag(): Map<string, InlineAnnotationMarker[]> {
    return this.store.getGroupedByTag();
  }

  getNextMarker(currentFilePath: string, currentLine: number): InlineAnnotationNavigationTarget | undefined {
    return this.store.getNextMarker(currentFilePath, currentLine);
  }

  getPrevMarker(currentFilePath: string, currentLine: number): InlineAnnotationNavigationTarget | undefined {
    return this.store.getPrevMarker(currentFilePath, currentLine);
  }

  async goToMarker(target: InlineAnnotationNavigationTarget): Promise<void> {
    const uri = vscode.Uri.file(target.filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const position = new vscode.Position(target.line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  }
}

export type { InlineAnnotationMarker, InlineAnnotationNavigationTarget };
