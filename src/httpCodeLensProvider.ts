import * as vscode from 'vscode';
import { isExtensionPausedForSettingsUi } from './settingsUiGuard';
import { isHttpRequestFile } from './utils';
import {
  getHttpRequestBlocks,
  rangeHasVariables,
} from './httpRequestParser';

export class HttpCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isHttpRequestFile(e.document.uri.fsPath)) {
        this._onDidChangeCodeLenses.fire();
      }
    });
  }

  private findAssertionBlocks(
    document: vscode.TextDocument,
    startLine: number,
    endLine: number
  ): Array<{ startLine: number; count: number }> {
    const blocks: Array<{ startLine: number; count: number }> = [];
    let inCommentBlock = false;
    let blockStartLine = -1;
    let blockCount = 0;

    for (let i = startLine; i <= endLine && i < document.lineCount; i++) {
      const line = document.lineAt(i).text;

      if (line.includes('/*')) {
        inCommentBlock = true;
        blockStartLine = i;
        blockCount = 0;
      }

      if (inCommentBlock && line.includes('@assert')) {
        blockCount++;
      }

      if (inCommentBlock && line.includes('*/')) {
        if (blockCount > 0) {
          blocks.push({ startLine: blockStartLine, count: blockCount });
        }
        inCommentBlock = false;
        blockStartLine = -1;
        blockCount = 0;
      }
    }

    return blocks;
  }

  private countAssertions(document: vscode.TextDocument, startLine: number, endLine: number): number {
    return this.findAssertionBlocks(document, startLine, endLine).reduce(
      (sum, block) => sum + block.count,
      0
    );
  }

  private curlHasVariables(lines: string[], startIndex: number): boolean {
    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(/\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}/)) {
        return true;
      }
      if (!line.trim().endsWith('\\')) {
        break;
      }
    }
    return false;
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (isExtensionPausedForSettingsUi()) {
      return [];
    }

    this.codeLenses = [];

    const filePath = document.uri.fsPath;

    if (!isHttpRequestFile(filePath)) {
      return [];
    }

    const text = document.getText();
    const lines = text.split('\n');

    const assertionBlocks = this.findAssertionBlocks(document, 0, lines.length - 1);
    for (const block of assertionBlocks) {
      this.codeLenses.push(
        new vscode.CodeLens(new vscode.Range(block.startLine, 0, block.startLine, 0), {
          title: `$(play) Run Assertions (${block.count} ${block.count === 1 ? 'test' : 'tests'})`,
          command: 'cursor-toys.runAssertions',
          arguments: [document.uri],
        })
      );
    }

    const runnableBlocks = getHttpRequestBlocks(document);
    if (runnableBlocks.length > 1) {
      this.codeLenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: `$(play) Run All Requests (${runnableBlocks.length})`,
          command: 'cursor-toys.runHttpTestsFile',
          arguments: [document.uri],
        })
      );
    }

    for (const block of runnableBlocks) {
      if (block.kind === 'fallback') {
        continue;
      }
      const hasVars = rangeHasVariables(document, block.startLine, block.endLine);
      const assertionCount = this.countAssertions(document, block.startLine, block.endLine);

      let title = `Send Request: ${block.title}`;
      if (block.envName && hasVars) {
        title += ` [${block.envName}]`;
      }
      if (assertionCount > 0) {
        title += ` [${assertionCount} ${assertionCount === 1 ? 'assertion' : 'assertions'}]`;
      }

      this.codeLenses.push(
        new vscode.CodeLens(new vscode.Range(block.titleLine, 0, block.titleLine, 0), {
          title,
          command: 'cursor-toys.sendHttpRequest',
          arguments: [document.uri, block.startLine, block.endLine, block.title],
        })
      );

      this.codeLenses.push(
        new vscode.CodeLens(new vscode.Range(block.titleLine, 0, block.titleLine, 0), {
          title: '$(copy) Copy as cURL',
          command: 'cursor-toys.copyCurlCommand',
          arguments: [document.uri, block.startLine, block.endLine],
        })
      );
    }

    if (this.codeLenses.length === 0) {
      this.codeLenses.push(
        new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: 'Send Request',
          command: 'cursor-toys.sendHttpRequest',
          arguments: [document.uri],
        })
      );
    }

    return this.codeLenses;
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }
}
