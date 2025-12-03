import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

/**
 * Sanitizes the file name to use only letters, numbers, dots, hyphens, and underscores
 */
export function sanitizeFileName(name: string): string {
  // Remove file extension
  const nameWithoutExt = path.parse(name).name;
  // Remove invalid characters, keeping only letters, numbers, dots, hyphens, and underscores
  return nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Validates if the URL has less than 8000 characters
 */
export function validateUrlLength(url: string): boolean {
  return url.length < 8000;
}

/**
 * Detects the file type based on the path
 */
export function getFileTypeFromPath(filePath: string): 'command' | 'rule' | 'prompt' | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Commands can be in either .cursor/commands/ or .claude/commands/
  if (normalizedPath.includes('/.cursor/commands/') || normalizedPath.includes('/.claude/commands/')) {
    return 'command';
  }
  if (normalizedPath.includes('/.cursor/rules/')) {
    return 'rule';
  }
  if (normalizedPath.includes('/.cursor/prompts/')) {
    return 'prompt';
  }
  
  return null;
}

/**
 * Decodes a URL parameter
 */
export function decodeUrlParam(param: string): string {
  try {
    // First replace + with spaces, then decode
    const withSpaces = param.replace(/\+/g, ' ');
    return decodeURIComponent(withSpaces);
  } catch (error) {
    // If it fails, try to decode in smaller parts or return as is
    try {
      // Try to decode character by character for very long URLs
      return param.replace(/\+/g, ' ').replace(/%([0-9A-F]{2})/gi, (match, hex) => {
        return String.fromCharCode(parseInt(hex, 16));
      });
    } catch {
      // If it still fails, return the parameter with + replaced by spaces
      return param.replace(/\+/g, ' ');
    }
  }
}

/**
 * Checks if the file extension is in the allowed extensions list
 */
export function isAllowedExtension(filePath: string, allowedExtensions: string[]): boolean {
  const ext = getFileExtension(filePath);
  return allowedExtensions.includes(ext.toLowerCase());
}

/**
 * Extracts the file extension (without the dot)
 */
export function getFileExtension(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.substring(1) : ext;
}

/**
 * Gets the file name without the extension
 */
export function getFileNameWithoutExtension(filePath: string): string {
  return path.parse(filePath).name;
}

/**
 * Gets the user home directory path (cross-platform)
 */
export function getUserHomePath(): string {
  return os.homedir();
}

/**
 * Gets the commands folder name based on configuration ('cursor' or 'claude')
 */
export function getCommandsFolderName(): 'cursor' | 'claude' {
  const config = vscode.workspace.getConfiguration('cursorDeeplink');
  const folderName = config.get<string>('commandsFolder', 'cursor');
  return folderName === 'claude' ? 'claude' : 'cursor';
}

/**
 * Gets the full path to the commands folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getCommandsPath(workspacePath?: string, isUser: boolean = false): string {
  const folderName = getCommandsFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${folderName}`, 'commands');
  }
  
  return path.join(workspacePath, `.${folderName}`, 'commands');
}

/**
 * Gets the paths to the command folders to show in Personal Commands view
 * @returns Array of folder paths based on personalCommandsView configuration
 */
export function getPersonalCommandsPaths(): string[] {
  const config = vscode.workspace.getConfiguration('cursorDeeplink');
  const viewMode = config.get<string>('personalCommandsView', 'both');
  const homePath = getUserHomePath();
  
  const paths: string[] = [];
  
  if (viewMode === 'both' || viewMode === 'cursor') {
    paths.push(path.join(homePath, '.cursor', 'commands'));
  }
  
  if (viewMode === 'both' || viewMode === 'claude') {
    paths.push(path.join(homePath, '.claude', 'commands'));
  }
  
  return paths;
}

