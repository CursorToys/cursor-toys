import * as vscode from 'vscode';
import { isExtensionPausedForSettingsUi } from './settingsUiGuard';
import { isHttpRequestFile } from './utils';
import {
  getGlobalHttpEnv,
  getHttpRequestBlocks,
  parseRequestSections,
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

    const assertionBlocks = this.findAssertionBlocks(document, 0, lines.length - 1);
    for (const block of assertionBlocks) {
      const runAssertionsCodeLens = new vscode.CodeLens(
        new vscode.Range(block.startLine, 0, block.startLine, 0),
        {
          title: `$(play) Run Assertions (${block.count} ${block.count === 1 ? 'test' : 'tests'})`,
          command: 'cursor-toys.runAssertions',
          arguments: [document.uri],
        }
      );
      this.codeLenses.push(runAssertionsCodeLens);
    }

    const globalEnv = getGlobalHttpEnv(lines);
    const sections = parseRequestSections(document);
    const coveredLines = new Set<number>();

    for (const section of sections) {
      const hasVars = rangeHasVariables(document, section.startLine, section.endLine);
      const assertionCount = this.countAssertions(document, section.startLine, section.endLine);

      let title = `Send Request: ${section.title}`;
      if (section.envName && hasVars) {
        title += ` [${section.envName}]`;
      }
      if (assertionCount > 0) {
        title += ` [${assertionCount} ${assertionCount === 1 ? 'assertion' : 'assertions'}]`;
      }

      this.codeLenses.push(
        new vscode.CodeLens(new vscode.Range(section.titleLine, 0, section.titleLine, 0), {
          title,
          command: 'cursor-toys.sendHttpRequest',
          arguments: [document.uri, section.startLine, section.endLine, section.title],
        })
      );

      this.codeLenses.push(
        new vscode.CodeLens(new vscode.Range(section.titleLine, 0, section.titleLine, 0), {
          title: '$(copy) Copy as cURL',
          command: 'cursor-toys.copyCurlCommand',
          arguments: [document.uri, section.startLine, section.endLine],
        })
      );

      for (let i = section.startLine; i <= section.endLine; i++) {
        coveredLines.add(i);
      }
    }

    let currentEnv: string | null = globalEnv;

    for (let i = 0; i < lines.length; i++) {
      if (coveredLines.has(i)) {
        continue;
      }

      const line = lines[i].trim();

      const envMatch = line.match(/^#\s*@env\s+(\w+)/i);
      if (envMatch) {
        currentEnv = envMatch[1];
        continue;
      }

      if (line.toLowerCase().startsWith('curl')) {
        const hasVars = this.curlHasVariables(lines, i);

        let endLine = i;
        for (let j = i; j < lines.length; j++) {
          const curlLine = lines[j];
          if (!curlLine.trim().endsWith('\\')) {
            endLine = j;
            break;
          }
          endLine = j;
        }

        const assertionCount = this.countAssertions(document, i, endLine);

        let title = 'Send Request';
        if (currentEnv && hasVars) {
          title += ` [${currentEnv}]`;
        }
        if (assertionCount > 0) {
          title += ` [${assertionCount} ${assertionCount === 1 ? 'assertion' : 'assertions'}]`;
        }

        this.codeLenses.push(
          new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
            title,
            command: 'cursor-toys.sendHttpRequest',
            arguments: [document.uri, i, endLine],
          })
        );

        this.codeLenses.push(
          new vscode.CodeLens(new vscode.Range(i, 0, i, 0), {
            title: '$(copy) Copy as cURL',
            command: 'cursor-toys.copyCurlCommand',
            arguments: [document.uri, i, endLine],
          })
        );
      }

      const restClientMatch = line.match(
        /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i
      );
      if (restClientMatch) {
        let requestTitle: string | null = null;
        let titleLine = i;

        for (let k = i - 1; k >= 0; k--) {
          const prevLine = lines[k].trim();
          if (prevLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i)) {
            break;
          }
          if (prevLine.startsWith('##') && !prevLine.startsWith('###')) {
            break;
          }
          if (prevLine.startsWith('###')) {
            const titleMatch = prevLine.match(/^###\s+(.+)$/);
            if (titleMatch && titleMatch[1].trim()) {
              requestTitle = titleMatch[1].trim();
              titleLine = k;
            }
            break;
          }
        }

        const hasVars = rangeHasVariables(document, i, lines.length - 1);

        let endLine = i;
        for (let j = i + 1; j < lines.length; j++) {
          const requestLine = lines[j].trim();
          if (requestLine.startsWith('###')) {
            endLine = j - 1;
            break;
          }
          if (requestLine.startsWith('##')) {
            endLine = j - 1;
            break;
          }
          if (requestLine.match(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(https?:\/\/|\{\{).+$/i)) {
            endLine = j - 1;
            break;
          }
          endLine = j;
        }

        const assertionCount = this.countAssertions(document, i, endLine);

        let title = requestTitle ? `Send Request: ${requestTitle}` : 'Send Request';
        if (currentEnv && hasVars) {
          title += ` [${currentEnv}]`;
        }
        if (assertionCount > 0) {
          title += ` [${assertionCount} ${assertionCount === 1 ? 'assertion' : 'assertions'}]`;
        }

        this.codeLenses.push(
          new vscode.CodeLens(new vscode.Range(titleLine, 0, titleLine, 0), {
            title,
            command: 'cursor-toys.sendHttpRequest',
            arguments: [document.uri, i, endLine, requestTitle || undefined],
          })
        );

        this.codeLenses.push(
          new vscode.CodeLens(new vscode.Range(titleLine, 0, titleLine, 0), {
            title: '$(copy) Copy as cURL',
            command: 'cursor-toys.copyCurlCommand',
            arguments: [document.uri, i, endLine],
          })
        );
      }
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
