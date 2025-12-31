import * as vscode from 'vscode';
import * as path from 'path';
import { decodeUrlParam, sanitizeFileName, getUserHomePath, getCommandsPath, getPromptsPath } from './utils';

interface DeeplinkParams {
  type: 'prompt' | 'command' | 'rule';
  name?: string;
  text: string;
}

/**
 * Importa um deeplink e cria o arquivo correspondente
 */
export async function importDeeplink(url: string): Promise<void> {
  try {
    // Parse URL (already shows specific error messages)
    const params = parseDeeplinkUrl(url);
    if (!params) {
      // Error message already shown in parseDeeplinkUrl
      return;
    }

    // For commands and prompts, ask if user wants to save as Project or Personal
    let isPersonal = false;
    if (params.type === 'command' || params.type === 'prompt') {
      const itemType = params.type === 'command' ? 'command' : 'prompt';
      const itemLocation = await vscode.window.showQuickPick(
        [
          { label: `Personal ${itemType}s`, description: `Available in all projects (~/.cursor/${itemType}s)`, value: true },
          { label: `Project ${itemType}s`, description: 'Specific to this workspace', value: false }
        ],
        {
          placeHolder: `Where do you want to save this ${itemType}?`
        }
      );

      if (itemLocation === undefined) {
        // User cancelled
        return;
      }

      isPersonal = itemLocation.value;
    }

    // Get workspace folder (only needed for project commands, rules, and prompts)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder && !isPersonal) {
      vscode.window.showErrorMessage('No workspace open');
      return;
    }

    // Determine destination folder and file name
    const workspacePath = workspaceFolder?.uri.fsPath || '';
    const { folderPath, fileName } = getDestinationPath(params, workspacePath, isPersonal);

    // Check if file already exists
    const fileUri = vscode.Uri.file(path.join(folderPath, fileName));
    let fileExists = false;
    try {
      await vscode.workspace.fs.stat(fileUri);
      fileExists = true;
    } catch {
      // File doesn't exist, that's fine
    }

    if (fileExists) {
      const overwrite = await vscode.window.showWarningMessage(
        `File ${fileName} already exists. Do you want to overwrite it?`,
        'Yes',
        'No'
      );
      if (overwrite !== 'Yes') {
        return;
      }
    }

    // Create folder if it doesn't exist
    const folderUri = vscode.Uri.file(folderPath);
    try {
      await vscode.workspace.fs.stat(folderUri);
    } catch {
      // Folder doesn't exist, create it
      await vscode.workspace.fs.createDirectory(folderUri);
    }

    // Create file
    const content = Buffer.from(params.text, 'utf8');
    await vscode.workspace.fs.writeFile(fileUri, content);

    vscode.window.showInformationMessage(`File created: ${fileName}`);
    
    // Open file
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    vscode.window.showErrorMessage(`Error importing deeplink: ${error}`);
  }
}

/**
 * Parses the deeplink URL and extracts parameters
 */
function parseDeeplinkUrl(url: string): DeeplinkParams | null {
  try {
    // Validate URL length
    if (url.length > 8000) {
      vscode.window.showErrorMessage('URL too long. The limit is 8000 characters.');
      return null;
    }

    // Support both cursor:// and https://cursor.com/link/
    let urlObj: URL;
    let normalizedUrl = url.trim();
    
    if (normalizedUrl.startsWith('cursor://')) {
      // Convert cursor:// to format that URL can process
      normalizedUrl = normalizedUrl.replace('cursor://', 'https://');
    }
    
    try {
      urlObj = new URL(normalizedUrl);
    } catch (urlError) {
      vscode.window.showErrorMessage(`Invalid URL: ${urlError}`);
      return null;
    }

    // Extract type from pathname
    const pathname = urlObj.pathname;
    let type: 'prompt' | 'command' | 'rule' | null = null;

    if (pathname.includes('/prompt') || pathname.endsWith('/prompt')) {
      type = 'prompt';
    } else if (pathname.includes('/command') || pathname.endsWith('/command')) {
      type = 'command';
    } else if (pathname.includes('/rule') || pathname.endsWith('/rule')) {
      type = 'rule';
    }

    if (!type) {
      vscode.window.showErrorMessage('Deeplink type not recognized. Must be prompt, command, or rule.');
      return null;
    }

    // Extract parameters
    const text = urlObj.searchParams.get('text');
    if (!text) {
      vscode.window.showErrorMessage('Parameter "text" not found in deeplink.');
      return null;
    }

    let decodedText: string;
    try {
      decodedText = decodeUrlParam(text);
    } catch (decodeError) {
      vscode.window.showErrorMessage(`Error decoding content: ${decodeError}`);
      return null;
    }

    const name = urlObj.searchParams.get('name');

    // Prompt doesn't need name
    if (type === 'prompt') {
      return { type, text: decodedText, name: name ? decodeUrlParam(name) : undefined };
    }

    // command and rule need name
    if (!name) {
      vscode.window.showErrorMessage(`Deeplink of type ${type} requires the "name" parameter.`);
      return null;
    }

    let decodedName: string;
    try {
      decodedName = decodeUrlParam(name);
    } catch (decodeError) {
      vscode.window.showErrorMessage(`Error decoding name: ${decodeError}`);
      return null;
    }

    return {
      type,
      name: decodedName,
      text: decodedText
    };
  } catch (error) {
    vscode.window.showErrorMessage(`Error processing deeplink: ${error}`);
    return null;
  }
}

/**
 * Determines the destination path and file name based on parameters
 */
function getDestinationPath(
  params: DeeplinkParams,
  workspacePath: string,
  isPersonal: boolean = false
): { folderPath: string; fileName: string } {
  // Get allowed extensions configuration
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const defaultExtension = allowedExtensions[0] || 'md';

  let folderPath: string;
  let fileName: string;

  switch (params.type) {
    case 'command':
      // Use configuration to determine the commands folder path
      folderPath = getCommandsPath(workspacePath, isPersonal);
      fileName = params.name ? `${sanitizeFileName(params.name)}.${defaultExtension}` : `command.${defaultExtension}`;
      break;
    case 'rule':
      folderPath = path.join(workspacePath, '.cursor', 'rules');
      // For rules, prefer .mdc if it's in the allowed extensions
      const ruleExtension = allowedExtensions.includes('mdc') ? 'mdc' : defaultExtension;
      fileName = params.name ? `${sanitizeFileName(params.name)}.${ruleExtension}` : `rule.${ruleExtension}`;
      break;
    case 'prompt':
      // Use new getPromptsPath function to determine prompts folder path
      folderPath = getPromptsPath(workspacePath, isPersonal);
      // For prompts, if no name, use a default name based on content
      if (params.name) {
        fileName = `${sanitizeFileName(params.name)}.${defaultExtension}`;
      } else {
        // Generate name based on first words of content (try to get title if markdown)
        let nameBase = 'prompt';
        const titleMatch = params.text.match(/^#+\s+(.+)$/m);
        if (titleMatch) {
          nameBase = titleMatch[1].substring(0, 50).replace(/[^a-zA-Z0-9]/g, '_');
        } else {
          const firstWords = params.text.substring(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
          nameBase = firstWords || 'prompt';
        }
        fileName = `${nameBase}.${defaultExtension}`;
      }
      break;
  }

  return { folderPath, fileName };
}

