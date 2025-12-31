import * as vscode from 'vscode';
import { getFileTypeFromPath, isAllowedExtension } from './utils';

export class DeeplinkCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    // Update CodeLens when files change
    vscode.workspace.onDidChangeConfiguration(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  public provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    this.codeLenses = [];

    const filePath = document.uri.fsPath;
    
    // Check if the file is in one of the .cursor folders
    const fileType = getFileTypeFromPath(filePath);
    if (!fileType) {
      return [];
    }

    // Validate extension
    const config = vscode.workspace.getConfiguration('cursorToys');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md']);
    
    if (!isAllowedExtension(filePath, allowedExtensions)) {
      return [];
    }

    // Determine the command and text based on type
    let command: string;
    let label: string;

    switch (fileType) {
      case 'command':
        command = 'cursor-toys.generate-command';
        label = 'Generate Cursor Toys Command';
        break;
      case 'rule':
        command = 'cursor-toys.generate-rule';
        label = 'Generate Cursor Toys Rule';
        break;
      case 'prompt':
        command = 'cursor-toys.generate-prompt';
        label = 'Generate Cursor Toys Prompt';
        break;
    }

    // Create CodeLens on the first line (line 0)
    const codeLens = new vscode.CodeLens(
      new vscode.Range(0, 0, 0, 0),
      {
        title: label,
        command: command,
        arguments: [document.uri]
      }
    );

    this.codeLenses.push(codeLens);
    return this.codeLenses;
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }
}

