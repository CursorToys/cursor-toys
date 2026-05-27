import * as vscode from 'vscode';
import { isExtensionPausedForSettingsUi } from './settingsUiGuard';
import { isEnvironmentFile } from './utils';

export class EnvCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    // No configuration listener — env CodeLens only depends on file content.
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
    
    if (!isEnvironmentFile(filePath)) {
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

