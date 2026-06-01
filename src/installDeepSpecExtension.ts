import * as vscode from 'vscode';

const DEEPSPEC_EXTENSION_ID = 'godrix.deepspec';
const MARKETPLACE_URI = `vscode:extension/${DEEPSPEC_EXTENSION_ID}`;

/**
 * Opens the Marketplace page for the standalone DeepSpec extension.
 */
export async function installDeepSpecExtension(): Promise<void> {
  const installed = vscode.extensions.getExtension(DEEPSPEC_EXTENSION_ID);
  if (installed) {
    void vscode.window.showInformationMessage(
      'DeepSpec extension is already installed. Use the DeepSpec activity bar to open specs.'
    );
    await vscode.commands.executeCommand('deepspec.focus');
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    'DeepSpec is now a separate extension. Install it from the Marketplace to use spec-driven tasks (.deepspec/).',
    'Open Marketplace',
    'Copy extension ID'
  );

  if (choice === 'Copy extension ID') {
    await vscode.env.clipboard.writeText(DEEPSPEC_EXTENSION_ID);
    void vscode.window.showInformationMessage(`Copied: ${DEEPSPEC_EXTENSION_ID}`);
    return;
  }

  if (choice === 'Open Marketplace') {
    await vscode.env.openExternal(vscode.Uri.parse(MARKETPLACE_URI));
  }
}
