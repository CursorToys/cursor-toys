import * as vscode from 'vscode';
import { InlineAnnotationService } from './inlineAnnotationService';
import { isInlineAnnotationsEnabled } from './inlineAnnotationsConfig';

/**
 * Registers inline annotation navigation and refresh commands.
 */
export function registerInlineAnnotationsCommands(
  context: vscode.ExtensionContext,
  service: InlineAnnotationService
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-toys.refreshInlineAnnotations', async () => {
      if (!isInlineAnnotationsEnabled()) {
        return;
      }
      await service.rescanWorkspace();
      vscode.window.showInformationMessage('Inline annotations refreshed');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'cursor-toys.goToInlineAnnotation',
      async (filePath: string, line: number, _tag?: string) => {
        if (!isInlineAnnotationsEnabled()) {
          return;
        }

        try {
          await service.index.goToMarker({ filePath, line, tag: _tag ?? '' });
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to open inline annotation: ${error}`);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-toys.nextInlineAnnotation', async () => {
      if (!isInlineAnnotationsEnabled()) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      const currentFilePath = editor?.document.uri.fsPath ?? '';
      const currentLine = editor?.selection.active.line ?? -1;
      const next = service.index.getNextMarker(currentFilePath, currentLine);

      if (!next) {
        vscode.window.showInformationMessage('No inline annotations in workspace');
        return;
      }

      try {
        await service.index.goToMarker(next);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open inline annotation: ${error}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-toys.prevInlineAnnotation', async () => {
      if (!isInlineAnnotationsEnabled()) {
        return;
      }

      const editor = vscode.window.activeTextEditor;
      const currentFilePath = editor?.document.uri.fsPath ?? '';
      const currentLine = editor?.selection.active.line ?? Number.MAX_SAFE_INTEGER;
      const prev = service.index.getPrevMarker(currentFilePath, currentLine);

      if (!prev) {
        vscode.window.showInformationMessage('No inline annotations in workspace');
        return;
      }

      try {
        await service.index.goToMarker(prev);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to open inline annotation: ${error}`);
      }
    })
  );
}
