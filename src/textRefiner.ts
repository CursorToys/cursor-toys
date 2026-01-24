import * as vscode from 'vscode';
import { getAIProvider, RefinementOptions } from './aiProviders';
import { GeminiProvider } from './aiProviders/geminiProvider';

/**
 * Refines the selected text in the active editor
 */
export async function refineSelectedText(
  context: vscode.ExtensionContext
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('No text selected');
    return;
  }

  const selectedText = editor.document.getText(selection);
  if (!selectedText || selectedText.trim().length === 0) {
    vscode.window.showWarningMessage('Selected text is empty');
    return;
  }

  try {
    const provider = await getAIProvider(context);
    if (!provider) {
      vscode.window.showErrorMessage(
        'AI provider not configured. Please configure it first.'
      );
      return;
    }

    // Check if API key is configured (for Gemini)
    if (provider instanceof GeminiProvider) {
      const hasApiKey = await provider.hasApiKey();
      if (!hasApiKey) {
        const action = await vscode.window.showWarningMessage(
          'Gemini API key not configured. Would you like to configure it now?',
          'Configure',
          'Cancel'
        );
        if (action === 'Configure') {
          await configureAIProvider(context);
          // Try again after configuration
          return refineSelectedText(context);
        }
        return;
      }
    }

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refining text with AI...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const config = vscode.workspace.getConfiguration('cursorToys');
        const options: RefinementOptions = {
          prompt: config.get<string>('aiRefinePrompt'),
          timeout: config.get<number>('aiRequestTimeout', 30),
          model: config.get<string>('aiModel')
        };

        const refinedText = await provider.refineText(selectedText, options);

        progress.report({ increment: 100 });

        // Replace selected text with refined text
        await editor.edit((editBuilder) => {
          editBuilder.replace(selection, refinedText);
        });

        vscode.window.showInformationMessage('Text refined successfully!');
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to refine text: ${error.message || error}`
    );
  }
}

/**
 * Refines text from clipboard
 */
export async function refineClipboard(
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const clipboardText = await vscode.env.clipboard.readText();
    if (!clipboardText || clipboardText.trim().length === 0) {
      vscode.window.showWarningMessage('Clipboard is empty');
      return;
    }

    const provider = await getAIProvider(context);
    if (!provider) {
      vscode.window.showErrorMessage(
        'AI provider not configured. Please configure it first.'
      );
      return;
    }

    // Check if API key is configured (for Gemini)
    if (provider instanceof GeminiProvider) {
      const hasApiKey = await provider.hasApiKey();
      if (!hasApiKey) {
        const action = await vscode.window.showWarningMessage(
          'Gemini API key not configured. Would you like to configure it now?',
          'Configure',
          'Cancel'
        );
        if (action === 'Configure') {
          await configureAIProvider(context);
          // Try again after configuration
          return refineClipboard(context);
        }
        return;
      }
    }

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refining clipboard text with AI...',
        cancellable: false
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const config = vscode.workspace.getConfiguration('cursorToys');
        const options: RefinementOptions = {
          prompt: config.get<string>('aiRefinePrompt'),
          timeout: config.get<number>('aiRequestTimeout', 30),
          model: config.get<string>('aiModel')
        };

        const refinedText = await provider.refineText(clipboardText, options);

        progress.report({ increment: 100 });

        // Copy refined text back to clipboard
        await vscode.env.clipboard.writeText(refinedText);

        vscode.window.showInformationMessage(
          'Clipboard text refined and updated!'
        );
      }
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(
      `Failed to refine clipboard text: ${error.message || error}`
    );
  }
}

/**
 * Configures the AI provider and API key
 */
export async function configureAIProvider(
  context: vscode.ExtensionContext
): Promise<void> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const providerType = config.get<string>('aiProvider', 'gemini');

  if (providerType === 'gemini') {
    const provider = await getAIProvider(context);
    if (!provider || !(provider instanceof GeminiProvider)) {
      vscode.window.showErrorMessage('Failed to get Gemini provider');
      return;
    }

    // Check if API key already exists
    const hasApiKey = await provider.hasApiKey();
    let prompt = 'Enter your Google Gemini API key:';
    if (hasApiKey) {
      prompt = 'Enter your Google Gemini API key (leave empty to keep current):';
    }

    const apiKey = await vscode.window.showInputBox({
      prompt: prompt,
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'AIza...'
    });

    if (apiKey === undefined) {
      // User cancelled
      return;
    }

    if (apiKey && apiKey.trim().length > 0) {
      try {
        await provider.setApiKey(apiKey.trim());
        vscode.window.showInformationMessage(
          'Gemini API key configured successfully!'
        );
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to configure API key: ${error.message || error}`
        );
      }
    } else if (!hasApiKey) {
      vscode.window.showWarningMessage('API key is required');
    }
  } else {
    vscode.window.showInformationMessage(
      `Configuration for provider "${providerType}" is not yet implemented`
    );
  }
}

/**
 * Removes the stored AI provider API key
 */
export async function removeAIProviderKey(
  context: vscode.ExtensionContext
): Promise<void> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const providerType = config.get<string>('aiProvider', 'gemini');

  if (providerType === 'gemini') {
    const provider = await getAIProvider(context);
    if (!provider || !(provider instanceof GeminiProvider)) {
      vscode.window.showErrorMessage('Failed to get Gemini provider');
      return;
    }

    const hasApiKey = await provider.hasApiKey();
    if (!hasApiKey) {
      vscode.window.showInformationMessage('No API key stored');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      'Are you sure you want to remove the stored API key?',
      'Remove',
      'Cancel'
    );

    if (confirm === 'Remove') {
      try {
        await provider.removeApiKey();
        vscode.window.showInformationMessage('API key removed successfully');
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to remove API key: ${error.message || error}`
        );
      }
    }
  } else {
    vscode.window.showInformationMessage(
      `Removal for provider "${providerType}" is not yet implemented`
    );
  }
}
