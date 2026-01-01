import * as vscode from 'vscode';
import { isEnvironmentFile } from './utils';

export class EnvCodeLensProvider implements vscode.CodeLensProvider {
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
    
    // Check if the file is an environment file
    if (!isEnvironmentFile(filePath)) {
      return [];
    }

    // Check if file is in http/environments/ folder
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (!normalizedPath.includes('/http/environments/')) {
      return [];
    }

    // Note: Share CodeLens removed - use context menu instead
    // No CodeLens for env files to avoid clutter
    return [];
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }
}

