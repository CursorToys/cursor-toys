import * as vscode from 'vscode';
import * as path from 'path';
import { callGeminiApi } from './geminiApi';
import { readClipboard, writeClipboard } from './clipboardProcessor';
import { getPromptsPath, getPersonalPromptsPaths, isAllowedExtension } from './utils';

const GEMINI_API_KEY_SECRET = 'cursorToys.geminiApiKey';

/**
 * Gets the Gemini API key from VS Code secrets
 */
async function getGeminiApiKey(context: vscode.ExtensionContext): Promise<string | null> {
  try {
    const apiKey = await context.secrets.get(GEMINI_API_KEY_SECRET);
    return apiKey || null;
  } catch (error) {
    console.error('Error retrieving Gemini API key:', error);
    return null;
  }
}

/**
 * Configures the Gemini API key by prompting the user
 */
export async function configureGeminiApiKey(context: vscode.ExtensionContext): Promise<void> {
  try {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Google Gemini API key',
      placeHolder: 'AIza...',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return 'API key cannot be empty';
        }
        return null;
      }
    });

    if (!apiKey) {
      return;
    }

    await context.secrets.store(GEMINI_API_KEY_SECRET, apiKey.trim());
    vscode.window.showInformationMessage('Gemini API key configured successfully');
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to configure API key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Removes the stored Gemini API key
 */
export async function removeGeminiApiKey(context: vscode.ExtensionContext): Promise<void> {
  try {
    await context.secrets.delete(GEMINI_API_KEY_SECRET);
    vscode.window.showInformationMessage('Gemini API key removed');
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to remove API key: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Gets configuration values from VS Code settings
 */
function getGeminiConfig(): {
  model: string;
  prompt: string;
  timeout: number;
} {
  const config = vscode.workspace.getConfiguration('cursorToys');
  return {
    model: config.get<string>('geminiModel', 'gemini-2.5-flash'),
    prompt: config.get<string>(
      'geminiRefinePrompt',
      'You must return ONLY the refined text, nothing else. Do not add introductions like "Here\'s the refined version" or "Okay, here is". Do not add markdown separators (---). Do not add explanations or notes. Just return the improved text directly.\n\nFix typos, improve clarity, and enhance the flow of the following text:'
    ),
    timeout: config.get<number>('geminiRequestTimeout', 30) * 1000 // Convert to milliseconds
  };
}

/**
 * Refines selected text in the editor using AI
 */
export async function refineSelectedText(context: vscode.ExtensionContext): Promise<void> {
  try {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor');
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

    // Get API key
    let apiKey = await getGeminiApiKey(context);
    if (!apiKey) {
      const configure = await vscode.window.showWarningMessage(
        'Gemini API key not configured. Would you like to configure it now?',
        'Yes',
        'No'
      );
      if (configure === 'Yes') {
        await configureGeminiApiKey(context);
        apiKey = await getGeminiApiKey(context);
        if (!apiKey) {
          return;
        }
      } else {
        return;
      }
    }

    // Get configuration
    const config = getGeminiConfig();

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refining text with AI...',
        cancellable: false
      },
      async () => {
        try {
          // Call API (apiKey is guaranteed to be non-null here)
          const refinedText = await callGeminiApi(selectedText, {
            apiKey: apiKey!,
            model: config.model,
            prompt: config.prompt,
            timeout: config.timeout
          });

          // Replace selected text
          await editor.edit((editBuilder) => {
            editBuilder.replace(selection, refinedText);
          });

          vscode.window.showInformationMessage('Text refined successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to refine text: ${errorMessage}`);
        }
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error refining selected text: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Refines clipboard content using AI
 */
export async function refineClipboard(context: vscode.ExtensionContext): Promise<void> {
  try {
    // Read clipboard
    const clipboardContent = await readClipboard();
    if (!clipboardContent || clipboardContent.trim().length === 0) {
      vscode.window.showWarningMessage('Clipboard is empty');
      return;
    }

    // Get API key
    let apiKey = await getGeminiApiKey(context);
    if (!apiKey) {
      const configure = await vscode.window.showWarningMessage(
        'Gemini API key not configured. Would you like to configure it now?',
        'Yes',
        'No'
      );
      if (configure === 'Yes') {
        await configureGeminiApiKey(context);
        apiKey = await getGeminiApiKey(context);
        if (!apiKey) {
          return;
        }
      } else {
        return;
      }
    }

    // Get configuration
    const config = getGeminiConfig();

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Refining clipboard with AI...',
        cancellable: false
      },
      async () => {
        try {
          // Call API (apiKey is guaranteed to be non-null here)
          const refinedText = await callGeminiApi(clipboardContent, {
            apiKey: apiKey!,
            model: config.model,
            prompt: config.prompt,
            timeout: config.timeout
          });

          // Write back to clipboard
          await writeClipboard(refinedText);

          vscode.window.showInformationMessage('Clipboard refined successfully');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to refine clipboard: ${errorMessage}`);
        }
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error refining clipboard: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Reads all prompt files from a directory recursively
 */
async function readPromptFilesRecursive(
  basePath: string,
  currentPath: string,
  allowedExtensions: string[]
): Promise<Array<{ filePath: string; fileName: string; relativePath: string }>> {
  const promptFiles: Array<{ filePath: string; fileName: string; relativePath: string }> = [];
  const currentUri = vscode.Uri.file(currentPath);

  try {
    const entries = await vscode.workspace.fs.readDirectory(currentUri);

    for (const [name, type] of entries) {
      const itemPath = path.join(currentPath, name);
      const relativePath = path.relative(basePath, itemPath);

      if (type === vscode.FileType.File) {
        if (isAllowedExtension(itemPath, allowedExtensions)) {
          promptFiles.push({
            filePath: itemPath,
            fileName: name,
            relativePath: relativePath
          });
        }
      } else if (type === vscode.FileType.Directory) {
        const subFiles = await readPromptFilesRecursive(basePath, itemPath, allowedExtensions);
        promptFiles.push(...subFiles);
      }
    }
  } catch (error) {
    // Handle errors silently for subdirectories
    console.error(`Error reading directory ${currentPath}:`, error);
  }

  return promptFiles;
}

/**
 * Gets all available prompts from project and personal folders
 */
async function getAvailablePrompts(): Promise<Array<{ label: string; description: string; filePath: string; isPersonal: boolean }>> {
  const prompts: Array<{ label: string; description: string; filePath: string; isPersonal: boolean }> = [];
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);

  // Get personal prompts
  const personalPromptsPaths = getPersonalPromptsPaths();
  for (const folderPath of personalPromptsPaths) {
    const folderUri = vscode.Uri.file(folderPath);
    try {
      await vscode.workspace.fs.stat(folderUri);
      const promptFiles = await readPromptFilesRecursive(folderPath, folderPath, allowedExtensions);
      
      for (const file of promptFiles) {
        const fileName = path.basename(file.filePath, path.extname(file.filePath));
        const folderName = path.dirname(file.relativePath) === '.' ? '' : path.dirname(file.relativePath);
        const label = folderName ? `${folderName}/${fileName}` : fileName;
        
        prompts.push({
          label: `$(person) ${label}`,
          description: `Personal prompt`,
          filePath: file.filePath,
          isPersonal: true
        });
      }
    } catch {
      // Folder doesn't exist, skip it
    }
  }

  // Get workspace prompts
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder) {
    const workspacePromptsPath = getPromptsPath(workspaceFolder.uri.fsPath, false);
    const workspacePromptsUri = vscode.Uri.file(workspacePromptsPath);
    
    try {
      await vscode.workspace.fs.stat(workspacePromptsUri);
      const promptFiles = await readPromptFilesRecursive(workspacePromptsPath, workspacePromptsPath, allowedExtensions);
      
      for (const file of promptFiles) {
        const fileName = path.basename(file.filePath, path.extname(file.filePath));
        const folderName = path.dirname(file.relativePath) === '.' ? '' : path.dirname(file.relativePath);
        const label = folderName ? `${folderName}/${fileName}` : fileName;
        
        prompts.push({
          label: `$(folder) ${label}`,
          description: `Project prompt`,
          filePath: file.filePath,
          isPersonal: false
        });
      }
    } catch {
      // Folder doesn't exist, skip it
    }
  }

  // Sort prompts alphabetically
  prompts.sort((a, b) => {
    const labelA = a.label.replace(/^\$\([^)]+\)\s*/, '');
    const labelB = b.label.replace(/^\$\([^)]+\)\s*/, '');
    return labelA.localeCompare(labelB);
  });

  return prompts;
}

/**
 * Processes text with a prompt selected from available prompts
 */
export async function processWithPrompt(context: vscode.ExtensionContext): Promise<void> {
  try {
    let textToRefine: string | null = null;
    let isFromSelection = false;

    // Check for selected text first
    const editor = vscode.window.activeTextEditor;
    if (editor && !editor.selection.isEmpty) {
      const selectedText = editor.document.getText(editor.selection);
      if (selectedText && selectedText.trim().length > 0) {
        textToRefine = selectedText;
        isFromSelection = true;
      }
    }

    // If no selection, try clipboard
    if (!textToRefine) {
      const clipboardContent = await readClipboard();
      if (clipboardContent && clipboardContent.trim().length > 0) {
        textToRefine = clipboardContent;
        isFromSelection = false;
      }
    }

    // If both are empty, show warning
    if (!textToRefine) {
      vscode.window.showWarningMessage(
        'No text selected and clipboard is empty. Please select text or copy something to clipboard first.'
      );
      return;
    }

    // Get available prompts
    const availablePrompts = await getAvailablePrompts();
    
    if (availablePrompts.length === 0) {
      vscode.window.showWarningMessage(
        'No prompts found. Please create prompts in .cursor/prompts/ (project) or ~/.cursor/prompts/ (personal) folders.'
      );
      return;
    }

    // Show prompt selection
    const selectedPrompt = await vscode.window.showQuickPick(availablePrompts, {
      placeHolder: 'Select a prompt to apply',
      matchOnDescription: true,
      matchOnDetail: false
    });

    if (!selectedPrompt) {
      return;
    }

    // Read the selected prompt file
    let customPrompt: string;
    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(selectedPrompt.filePath));
      customPrompt = document.getText();
      
      if (!customPrompt || customPrompt.trim().length === 0) {
        vscode.window.showWarningMessage('Selected prompt file is empty');
        return;
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to read prompt file: ${error instanceof Error ? error.message : String(error)}`
      );
      return;
    }

    // Get API key
    let apiKey = await getGeminiApiKey(context);
    if (!apiKey) {
      const configure = await vscode.window.showWarningMessage(
        'Gemini API key not configured. Would you like to configure it now?',
        'Yes',
        'No'
      );
      if (configure === 'Yes') {
        await configureGeminiApiKey(context);
        apiKey = await getGeminiApiKey(context);
        if (!apiKey) {
          return;
        }
      } else {
        return;
      }
    }

    // Get configuration (only model and timeout, prompt is custom)
    const config = getGeminiConfig();

    // Show progress
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Processing text with prompt: ${path.basename(selectedPrompt.filePath)}...`,
        cancellable: false
      },
      async () => {
        try {
          // Call API with selected prompt (apiKey is guaranteed to be non-null here)
          const refinedText = await callGeminiApi(textToRefine!, {
            apiKey: apiKey!,
            model: config.model,
            prompt: customPrompt.trim(),
            timeout: config.timeout
          });

          // Apply result based on source
          if (isFromSelection && editor) {
            await editor.edit((editBuilder) => {
              editBuilder.replace(editor.selection, refinedText);
            });
            vscode.window.showInformationMessage('Text processed successfully');
          } else {
            await writeClipboard(refinedText);
            vscode.window.showInformationMessage('Clipboard processed successfully');
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`Failed to process text: ${errorMessage}`);
        }
      }
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error processing text with prompt: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
