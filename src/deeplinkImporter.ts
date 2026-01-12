import * as vscode from 'vscode';
import * as path from 'path';
import { decodeUrlParam, sanitizeFileName, getUserHomePath, getCommandsPath, getPromptsPath, getSkillsPath } from './utils';

interface DeeplinkParams {
  type: 'prompt' | 'command' | 'rule' | 'skill';
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

    // For commands, prompts, and skills, ask if user wants to save as Project or Personal
    let isPersonal = false;
    if (params.type === 'command' || params.type === 'prompt' || params.type === 'skill') {
      const itemType = params.type === 'command' ? 'command' : params.type === 'prompt' ? 'prompt' : 'skill';
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
    const { folderPath, fileName, isSkillFolder } = getDestinationPath(params, workspacePath, isPersonal);

    if (isSkillFolder) {
      // For skills, we need to create a folder and put SKILL.md inside
      const skillFolderPath = folderPath;
      const skillFileUri = vscode.Uri.file(path.join(skillFolderPath, 'SKILL.md'));
      
      // Check if skill folder already exists
      const skillFolderUri = vscode.Uri.file(skillFolderPath);
      let folderExists = false;
      try {
        await vscode.workspace.fs.stat(skillFolderUri);
        folderExists = true;
      } catch {
        // Folder doesn't exist, that's fine
      }

      if (folderExists) {
        // Check if SKILL.md exists
        let fileExists = false;
        try {
          await vscode.workspace.fs.stat(skillFileUri);
          fileExists = true;
        } catch {
          // File doesn't exist, that's fine
        }

        if (fileExists) {
          const overwrite = await vscode.window.showWarningMessage(
            `Skill "${path.basename(skillFolderPath)}" already exists. Do you want to overwrite it?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }
      }

      // Create skill folder if it doesn't exist
      try {
        await vscode.workspace.fs.stat(skillFolderUri);
      } catch {
        // Folder doesn't exist, create it
        await vscode.workspace.fs.createDirectory(skillFolderUri);
      }

      // Create SKILL.md file
      const content = Buffer.from(params.text, 'utf8');
      await vscode.workspace.fs.writeFile(skillFileUri, content);

      vscode.window.showInformationMessage(`Skill created: ${path.basename(skillFolderPath)}`);
      
      // Open file
      const document = await vscode.workspace.openTextDocument(skillFileUri);
      await vscode.window.showTextDocument(document);
    } else {
      // For regular files (commands, rules, prompts)
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
    }
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
    let type: 'prompt' | 'command' | 'rule' | 'skill' | null = null;

    if (pathname.includes('/prompt') || pathname.endsWith('/prompt')) {
      type = 'prompt';
    } else if (pathname.includes('/command') || pathname.endsWith('/command')) {
      type = 'command';
    } else if (pathname.includes('/rule') || pathname.endsWith('/rule')) {
      type = 'rule';
    } else if (pathname.includes('/skill') || pathname.endsWith('/skill')) {
      type = 'skill';
    }

    if (!type) {
      vscode.window.showErrorMessage('Deeplink type not recognized. Must be prompt, command, rule, or skill.');
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

    // command, rule, and skill need name
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
): { folderPath: string; fileName: string; isSkillFolder?: boolean } {
  // Get allowed extensions configuration
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const defaultExtension = allowedExtensions[0] || 'md';

  let folderPath: string;
  let fileName: string;
  let isSkillFolder = false;

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
    case 'skill':
      // For skills, folderPath is the skill folder path, and fileName is 'SKILL.md'
      folderPath = getSkillsPath(workspacePath, isPersonal);
      const skillFolderName = params.name ? sanitizeFileName(params.name) : 'skill';
      folderPath = path.join(folderPath, skillFolderName);
      fileName = 'SKILL.md';
      isSkillFolder = true;
      break;
  }

  return { folderPath, fileName, isSkillFolder };
}

