import * as vscode from 'vscode';
import * as path from 'path';
import { getFileTypeFromPath, sanitizeFileName, validateUrlLength } from './utils';

const MAX_URL_LENGTH = 8000;

/**
 * Generates a deeplink for the specified file
 * @param filePath File path
 * @param forcedType Forced type (optional). If provided, uses this type instead of detecting by folder
 */
export async function generateDeeplink(
  filePath: string,
  forcedType?: 'command' | 'rule' | 'prompt'
): Promise<string | null> {
  try {
    // Read configuration
    const config = vscode.workspace.getConfiguration('cursorToys');
    const linkType = config.get<string>('linkType', 'deeplink');
    const customBaseUrl = config.get<string>('customBaseUrl', '');
    const allowedExtensions = config.get<string[]>('allowedExtensions', ['md']);

    // Validate custom URL if custom type is selected
    if (linkType === 'custom') {
      if (!customBaseUrl || customBaseUrl.trim() === '') {
        vscode.window.showErrorMessage('Custom base URL is required when linkType is set to "custom". Please configure cursorToys.customBaseUrl in settings.');
        return null;
      }
      // Validate URL format
      try {
        const testUrl = customBaseUrl.trim();
        // Check if it's a valid URL format (http/https or custom protocol)
        if (!testUrl.match(/^https?:\/\//) && !testUrl.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//)) {
          vscode.window.showErrorMessage('Invalid custom base URL format. Must start with http://, https://, or a custom protocol (e.g., custom://).');
          return null;
        }
      } catch {
        vscode.window.showErrorMessage('Invalid custom base URL. Please check your configuration.');
        return null;
      }
    }

    // Check if file exists
    const uri = vscode.Uri.file(filePath);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch {
      vscode.window.showErrorMessage(`File not found: ${filePath}`);
      return null;
    }

    // Detect or use forced type
    let fileType: 'command' | 'rule' | 'prompt' | null;
    if (forcedType) {
      fileType = forcedType;
    } else {
      fileType = getFileTypeFromPath(filePath);
      if (!fileType) {
        vscode.window.showErrorMessage('File must be in .cursor/commands/, .claude/commands/, .cursor/rules/ or .cursor/prompts/');
        return null;
      }
    }

    // Read file content
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    // Generate deeplink
    const deeplink = buildDeeplink(fileType, filePath, content, linkType, customBaseUrl);

    // Validate size
    if (!validateUrlLength(deeplink)) {
      vscode.window.showErrorMessage(
        `Deeplink too long (${deeplink.length} characters). The limit is ${MAX_URL_LENGTH} characters.`
      );
      return null;
    }

    return deeplink;
  } catch (error) {
    vscode.window.showErrorMessage(`Error generating deeplink: ${error}`);
    return null;
  }
}

/**
 * Builds the deeplink based on file type
 */
function buildDeeplink(
  fileType: 'command' | 'rule' | 'prompt',
  filePath: string,
  content: string,
  linkType: string,
  customBaseUrl?: string
): string {
  let baseUrl: string;
  
  if (linkType === 'web') {
    baseUrl = 'https://cursor.com/link/';
  } else if (linkType === 'custom' && customBaseUrl) {
    // Ensure custom URL ends with / if it doesn't already
    baseUrl = customBaseUrl.trim().endsWith('/') 
      ? customBaseUrl.trim() 
      : customBaseUrl.trim() + '/';
  } else {
    baseUrl = 'cursor://anysphere.cursor-deeplink/';
  }

  const encodedContent = encodeURIComponent(content);

  if (fileType === 'prompt') {
    return `${baseUrl}prompt?text=${encodedContent}`;
  }

  // For command and rule, we need the name
  const fileName = path.parse(filePath).name;
  const sanitizedName = sanitizeFileName(fileName);

  if (fileType === 'command') {
    return `${baseUrl}command?name=${encodeURIComponent(sanitizedName)}&text=${encodedContent}`;
  }

  // rule
  return `${baseUrl}rule?name=${encodeURIComponent(sanitizedName)}&text=${encodedContent}`;
}

