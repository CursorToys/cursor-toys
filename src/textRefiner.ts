import * as vscode from 'vscode';
import { AIProvider, AIProviderType } from './aiProviders';
import { GeminiProvider } from './aiProviders/geminiProvider';

/**
 * Factory function to get AI provider instance
 * @param type Provider type
 * @param context VS Code extension context
 * @returns AI provider instance
 */
export function getAIProvider(type: AIProviderType, context: vscode.ExtensionContext): AIProvider {
  switch (type) {
    case 'gemini':
      return GeminiProvider.getInstance(context);
    // Future providers can be added here:
    // case 'openai':
    //   return OpenAIProvider.getInstance(context);
    // case 'anthropic':
    //   return AnthropicProvider.getInstance(context);
    default:
      throw new Error(`Unsupported AI provider: ${type}`);
  }
}

/**
 * Refines text from clipboard using AI and replaces clipboard content
 * @param context VS Code extension context
 */
export async function refineClipboard(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Get text from clipboard
    const clipboardText = await vscode.env.clipboard.readText();

    if (!clipboardText.trim()) {
      vscode.window.showWarningMessage('Clipboard is empty. Copy some text first.');
      return;
    }

    // Get configuration
    const config = vscode.workspace.getConfiguration('cursorToys');
    const providerType = config.get<AIProviderType>('aiProvider', 'gemini');
    const model = config.get<string>('aiModel', '');
    const prompt = config.get<string>(
      'aiRefinePrompt',
      'Refine the following text: fix typos, improve clarity, and enhance the flow while maintaining the original language and context.'
    );

    // Get provider instance
    const provider = getAIProvider(providerType, context);

    // Ensure API key is configured
    const isConfigured = await provider.ensureApiKeyConfigured();
    if (!isConfigured) {
      const action = await vscode.window.showWarningMessage(
        `${provider.displayName} API key is required. Would you like to configure it now?`,
        'Configure',
        'Cancel'
      );
      
      if (action === 'Configure') {
        const key = await provider.promptForApiKey();
        if (!key) {
          return;
        }
      } else {
        return;
      }
    }

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Refining clipboard text with ${provider.displayName}...`,
        cancellable: false,
      },
      async (progress) => {
        try {
          // Refine the text
          const refinedText = await provider.refineText(
            clipboardText,
            prompt,
            model || undefined
          );

          // Replace clipboard content
          await vscode.env.clipboard.writeText(refinedText);

          vscode.window.showInformationMessage('Clipboard text refined successfully! You can now paste it.');
        } catch (error: any) {
          console.error('Error refining clipboard text:', error);
          
          // Check if it's an API key error
          if (error.message?.includes('API key')) {
            const action = await vscode.window.showErrorMessage(
              `API key error: ${error.message}`,
              'Reconfigure',
              'Cancel'
            );
            
            if (action === 'Reconfigure') {
              await provider.removeApiKey();
              const key = await provider.promptForApiKey();
              if (key) {
                // Retry the operation
                await refineClipboard(context);
              }
            }
          } else {
            vscode.window.showErrorMessage(`Failed to refine clipboard text: ${error.message}`);
          }
        }
      }
    );
  } catch (error: any) {
    console.error('Unexpected error in refineClipboard:', error);
    vscode.window.showErrorMessage(`Unexpected error: ${error.message}`);
  }
}

/**
 * Refines the currently selected text using AI
 * @param context VS Code extension context
 */
export async function refineSelectedText(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  
  if (!editor) {
    vscode.window.showErrorMessage('No active editor found');
    return;
  }

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText.trim()) {
    vscode.window.showWarningMessage('Please select some text to refine');
    return;
  }

  try {
    // Get configuration
    const config = vscode.workspace.getConfiguration('cursorToys');
    const providerType = config.get<AIProviderType>('aiProvider', 'gemini');
    const model = config.get<string>('aiModel', '');
    const prompt = config.get<string>(
      'aiRefinePrompt',
      'Refine the following text: fix typos, improve clarity, and enhance the flow while maintaining the original language and context.'
    );

    // Get provider instance
    const provider = getAIProvider(providerType, context);

    // Ensure API key is configured
    const isConfigured = await provider.ensureApiKeyConfigured();
    if (!isConfigured) {
      const action = await vscode.window.showWarningMessage(
        `${provider.displayName} API key is required. Would you like to configure it now?`,
        'Configure',
        'Cancel'
      );
      
      if (action === 'Configure') {
        const key = await provider.promptForApiKey();
        if (!key) {
          return;
        }
      } else {
        return;
      }
    }

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Refining text with ${provider.displayName}...`,
        cancellable: false,
      },
      async (progress) => {
        try {
          // Refine the text
          const refinedText = await provider.refineText(
            selectedText,
            prompt,
            model || undefined
          );

          // Replace the selection with refined text
          await editor.edit((editBuilder) => {
            editBuilder.replace(selection, refinedText);
          });

          vscode.window.showInformationMessage('Text refined successfully!');
        } catch (error: any) {
          console.error('Error refining text:', error);
          
          // Check if it's an API key error
          if (error.message?.includes('API key')) {
            const action = await vscode.window.showErrorMessage(
              `API key error: ${error.message}`,
              'Reconfigure',
              'Cancel'
            );
            
            if (action === 'Reconfigure') {
              await provider.removeApiKey();
              const key = await provider.promptForApiKey();
              if (key) {
                // Retry the operation
                await refineSelectedText(context);
              }
            }
          } else {
            vscode.window.showErrorMessage(`Failed to refine text: ${error.message}`);
          }
        }
      }
    );
  } catch (error: any) {
    console.error('Unexpected error in refineSelectedText:', error);
    vscode.window.showErrorMessage(`Unexpected error: ${error.message}`);
  }
}
