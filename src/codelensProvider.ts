import * as vscode from 'vscode';
import { isExtensionPausedForSettingsUi } from './settingsUiGuard';
import { getFileTypeFromPath, isAllowedExtension } from './utils';

let cachedAllowedExtensions: string[] | undefined;

function getAllowedExtensions(): string[] {
  if (cachedAllowedExtensions) {
    return cachedAllowedExtensions;
  }
  const config = vscode.workspace.getConfiguration('cursorToys');
  cachedAllowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  return cachedAllowedExtensions;
}

export class DeeplinkCodeLensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    // Intentionally no onDidChangeConfiguration listener: refreshing CodeLens on
    // `cursorToys.*` while the Settings UI is open can peg CPU (provider is registered
    // for all files). Reload the window after changing allowedExtensions / baseFolder.
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
    
    // Check if the file is in one of the .cursor folders
    const fileType = getFileTypeFromPath(filePath);
    if (!fileType) {
      return [];
    }

    // Only show CodeLens for command, rule, prompt, and skill files (not http or env)
    if (fileType !== 'command' && fileType !== 'rule' && fileType !== 'prompt' && fileType !== 'skill') {
      return [];
    }

    // For skills, check if file is SKILL.md
    if (fileType === 'skill') {
      const fileName = require('path').basename(filePath);
      if (fileName !== 'SKILL.md') {
        return [];
      }
    } else {
      // Validate extension for other types
      if (!isAllowedExtension(filePath, getAllowedExtensions())) {
        return [];
      }
    }

    // Determine the command and text based on type
    let deeplinkCommand: string;
    let shareableCommand: string;
    let deeplinkLabel: string;
    let shareableLabel: string;

    switch (fileType) {
      case 'command':
        deeplinkCommand = 'cursor-toys.generate-command';
        shareableCommand = 'cursor-toys.shareAsCursorToysCommand';
        deeplinkLabel = 'Share as Deeplink';
        shareableLabel = 'Share as CursorToys';
        break;
      case 'rule':
        deeplinkCommand = 'cursor-toys.generate-rule';
        shareableCommand = 'cursor-toys.shareAsCursorToysRule';
        deeplinkLabel = 'Share as Deeplink';
        shareableLabel = 'Share as CursorToys';
        break;
      case 'prompt':
        deeplinkCommand = 'cursor-toys.generate-prompt';
        shareableCommand = 'cursor-toys.shareAsCursorToysPrompt';
        deeplinkLabel = 'Share as Deeplink';
        shareableLabel = 'Share as CursorToys';
        break;
      case 'skill':
        deeplinkCommand = 'cursor-toys.generate-skill';
        shareableCommand = 'cursor-toys.shareAsCursorToysSkill';
        deeplinkLabel = 'Share as Deeplink';
        shareableLabel = 'Share as CursorToys';
        break;
      default:
        // This should never happen due to the check above
        return [];
    }

    // Create CodeLens for Deeplink on the first line (line 0)
    const deeplinkCodeLens = new vscode.CodeLens(
      new vscode.Range(0, 0, 0, 0),
      {
        title: deeplinkLabel,
        command: deeplinkCommand,
        arguments: [document.uri]
      }
    );

    // Create CodeLens for Shareable on the first line (line 0)
    const shareableCodeLens = new vscode.CodeLens(
      new vscode.Range(0, 0, 0, 0),
      {
        title: shareableLabel,
        command: shareableCommand,
        arguments: [document.uri]
      }
    );

    this.codeLenses.push(deeplinkCodeLens);
    this.codeLenses.push(shareableCodeLens);
    return this.codeLenses;
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): vscode.CodeLens {
    return codeLens;
  }
}

