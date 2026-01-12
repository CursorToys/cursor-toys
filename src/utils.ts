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
export function getFileTypeFromPath(filePath: string): 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill' | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const baseFolderName = getBaseFolderName();
  const environmentsFolderName = getEnvironmentsFolderName();
  
  // Hooks file (hooks.json)
  if (normalizedPath.endsWith('/hooks.json') && 
      (normalizedPath.includes('/.cursor/') || 
       normalizedPath.includes(`/.${baseFolderName}/`))) {
    return 'hooks';
  }
  // Commands can be in .cursor/commands/, .claude/commands/, or custom base folder
  if (normalizedPath.includes('/.cursor/commands/') || 
      normalizedPath.includes('/.claude/commands/') ||
      normalizedPath.includes(`/.${baseFolderName}/commands/`)) {
    return 'command';
  }
  // Rules can use custom base folder or legacy .cursor
  if (normalizedPath.includes(`/.${baseFolderName}/rules/`) || 
      normalizedPath.includes('/.cursor/rules/')) {
    return 'rule';
  }
  // Prompts can use custom base folder or legacy .cursor
  if (normalizedPath.includes(`/.${baseFolderName}/prompts/`) || 
      normalizedPath.includes('/.cursor/prompts/')) {
    return 'prompt';
  }
  // Notepads can use custom base folder or legacy .cursor
  if (normalizedPath.includes(`/.${baseFolderName}/notepads/`) || 
      normalizedPath.includes('/.cursor/notepads/')) {
    return 'notepad';
  }
  // Plans can be in personal folder (~/.cursor/plans/) or workspace folder
  // Check personal folder first (home directory)
  const homePath = getUserHomePath();
  const normalizedHomePath = homePath.replace(/\\/g, '/');
  if (normalizedPath.includes(`${normalizedHomePath}/.cursor/plans/`) || 
      normalizedPath.includes(`${normalizedHomePath}/.${baseFolderName}/plans/`)) {
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.plan.md')) {
      return 'plan';
    }
  }
  // Check workspace folder
  if (normalizedPath.includes(`/.${baseFolderName}/plans/`) || 
      normalizedPath.includes('/.cursor/plans/')) {
    // Plans must have .plan.md extension
    const fileName = path.basename(filePath);
    if (fileName.endsWith('.plan.md')) {
      return 'plan';
    }
  }
  // HTTP requests in .{baseFolder}/http/ folder (but not in environments folder)
  if ((normalizedPath.includes(`/.${baseFolderName}/http/`) || 
       normalizedPath.includes('/.cursor/http/')) &&
      !normalizedPath.includes(`/${environmentsFolderName}/`) &&
      !normalizedPath.includes('/environments/')) {
    const ext = getFileExtension(filePath).toLowerCase();
    if (ext === 'req' || ext === 'request') {
      return 'http';
    }
  }
  // Environment files in .{baseFolder}/http/{environmentsFolder}/ folder
  if (normalizedPath.includes(`/.${baseFolderName}/http/${environmentsFolderName}/`) || 
      normalizedPath.includes(`/.cursor/http/${environmentsFolderName}/`) ||
      normalizedPath.includes(`/.${baseFolderName}/http/environments/`) || 
      normalizedPath.includes('/.cursor/http/environments/')) {
    const fileName = path.basename(filePath);
    if (fileName.startsWith('.env')) {
      return 'env';
    }
  }
  // Skills can be in .cursor/skills/, .claude/skills/, or custom base folder
  // Check personal folder first (home directory)
  if (normalizedPath.includes(`${normalizedHomePath}/.cursor/skills/`) || 
      normalizedPath.includes(`${normalizedHomePath}/.claude/skills/`) ||
      normalizedPath.includes(`${normalizedHomePath}/.${baseFolderName}/skills/`)) {
    const fileName = path.basename(filePath);
    if (fileName === 'SKILL.md') {
      return 'skill';
    }
  }
  // Check workspace folder
  if (normalizedPath.includes(`/.cursor/skills/`) || 
      normalizedPath.includes(`/.claude/skills/`) ||
      normalizedPath.includes(`/.${baseFolderName}/skills/`)) {
    const fileName = path.basename(filePath);
    if (fileName === 'SKILL.md') {
      return 'skill';
    }
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
 * Gets the base folder name based on configuration
 * @returns Base folder name (e.g., 'cursor', 'vscode', 'ai')
 */
export function getBaseFolderName(): string {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const folderName = config.get<string>('baseFolder', 'cursor');
  return folderName.toLowerCase();
}

/**
 * Gets the commands folder name based on configuration ('cursor' or 'claude')
 */
export function getCommandsFolderName(): 'cursor' | 'claude' {
  const config = vscode.workspace.getConfiguration('cursorToys');
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
  
  // For workspace commands, use baseFolder if configured
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'commands');
}

/**
 * Gets the paths to the command folders to show in Personal Commands view
 * @returns Array of folder paths based on personalCommandsView configuration
 */
export function getPersonalCommandsPaths(): string[] {
  const config = vscode.workspace.getConfiguration('cursorToys');
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

/**
 * Gets the full path to the rules folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getRulesPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'rules');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'rules');
}

/**
 * Gets the full path to the prompts folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getPromptsPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'prompts');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'prompts');
}

/**
 * Gets the paths to the prompt folders to show in Personal Prompts view
 * @returns Array of folder paths based on baseFolder configuration
 */
export function getPersonalPromptsPaths(): string[] {
  const homePath = getUserHomePath();
  const baseFolderName = getBaseFolderName();
  const paths: string[] = [];
  
  // Use configured base folder
  paths.push(path.join(homePath, `.${baseFolderName}`, 'prompts'));
  
  // Also include .cursor if different (for backward compatibility)
  if (baseFolderName !== 'cursor') {
    paths.push(path.join(homePath, '.cursor', 'prompts'));
  }
  
  return paths;
}

/**
 * Gets the full path to the notepads folder
 * @param workspacePath Workspace path (required for notepads - they are workspace-specific)
 * @param isUser Deprecated - notepads are always workspace-specific
 */
export function getNotepadsPath(workspacePath: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'notepads');
}

/**
 * Gets the full path to the plans folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getPlansPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'plans');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'plans');
}

/**
 * Gets the paths to the plan folders to show in Personal Plans view
 * @returns Array of folder paths based on baseFolder configuration
 */
export function getPersonalPlansPaths(): string[] {
  const homePath = getUserHomePath();
  const baseFolderName = getBaseFolderName();
  const paths: string[] = [];
  
  // Use configured base folder
  paths.push(path.join(homePath, `.${baseFolderName}`, 'plans'));
  
  // Also include .cursor if different (for backward compatibility)
  if (baseFolderName !== 'cursor') {
    paths.push(path.join(homePath, '.cursor', 'plans'));
  }
  
  return paths;
}

/**
 * Checks if a file has the .plan.md extension
 * @param filePath The file path to check
 * @returns true if the file has .plan.md extension
 */
export function isPlanFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName.endsWith('.plan.md');
}

/**
 * Checks if a file is an HTTP request file (.req or .request) in .{baseFolder}/http/ folder
 * @param filePath The file path to check
 * @returns true if the file is an HTTP request file
 */
export function isHttpRequestFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check if file is in any base folder's http/ directory
  const baseFolderName = getBaseFolderName();
  if (!normalizedPath.includes(`/.${baseFolderName}/http/`) && 
      !normalizedPath.includes('/.cursor/http/')) {
    return false;
  }
  
  // Check if extension is .req or .request
  const ext = getFileExtension(filePath).toLowerCase();
  return ext === 'req' || ext === 'request';
}

/**
 * Gets the response file path for a given request file path
 * @param requestPath The path to the .req or .request file
 * @returns The path to the corresponding .res or .response file
 */
export function getHttpResponsePath(requestPath: string): string {
  const ext = getFileExtension(requestPath).toLowerCase();
  const dir = path.dirname(requestPath);
  const baseName = getFileNameWithoutExtension(requestPath);
  
  // Replace .req with .res or .request with .response
  // .res naturally sorts after .req alphabetically
  const responseExt = ext === 'req' ? 'res' : 'response';
  return path.join(dir, `${baseName}.${responseExt}`);
}

/**
 * Gets the environments folder name based on configuration
 * @returns Environments folder name (e.g., '.environments', 'environments', '__environments__', '_env')
 */
export function getEnvironmentsFolderName(): string {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const folderName = config.get<string>('environmentsFolder', '.environments');
  return folderName;
}

/**
 * Gets the path to the environments folder
 * @param workspacePath Workspace path
 * @returns Path to .{baseFolder}/http/{environmentsFolder}/
 */
export function getEnvironmentsPath(workspacePath: string): string {
  const baseFolderName = getBaseFolderName();
  const environmentsFolderName = getEnvironmentsFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'http', environmentsFolderName);
}

/**
 * Gets the path to the HTTP folder
 * @param workspacePath Workspace path
 * @returns Path to .{baseFolder}/http/
 */
export function getHttpPath(workspacePath: string): string {
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'http');
}

/**
 * Checks if a file is an environment file (.env*)
 * @param filePath The file path to check
 * @returns true if the file is an environment file
 */
export function isEnvironmentFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return fileName.startsWith('.env');
}

/**
 * Checks if a file is an HTTP or ENV file that can be shared
 * @param filePath The file path to check
 * @returns true if the file is HTTP request or ENV file
 */
export function isHttpOrEnvFile(filePath: string): boolean {
  const fileType = getFileTypeFromPath(filePath);
  return fileType === 'http' || fileType === 'env';
}

/**
 * Parses simple YAML frontmatter from file content
 * Helper function that uses the frontmatterParser module
 * @param content File content
 * @returns Parsed frontmatter data or null if none found
 */
export function parseYAMLFrontmatter(content: string): Record<string, any> | null {
  // Import is done dynamically to avoid circular dependencies
  const { parseFrontmatter } = require('./frontmatterParser');
  
  try {
    const parsed = parseFrontmatter(content);
    return parsed.hasFrontmatter ? parsed.metadata : null;
  } catch (error) {
    console.error('Error parsing YAML frontmatter:', error);
    return null;
  }
}

/**
 * Extracts description from YAML frontmatter
 * @param content File content
 * @returns Description string or empty string
 */
export function extractDescriptionFromFrontmatter(content: string): string {
  const frontmatter = parseYAMLFrontmatter(content);
  return frontmatter?.description || '';
}

/**
 * Extracts tags from YAML frontmatter
 * @param content File content
 * @returns Array of tags
 */
export function extractTagsFromFrontmatter(content: string): string[] {
  const frontmatter = parseYAMLFrontmatter(content);
  if (frontmatter?.tags && Array.isArray(frontmatter.tags)) {
    return frontmatter.tags.map((tag: string) => tag.toLowerCase().trim()).filter((tag: string) => tag.length > 0);
  }
  return [];
}

/**
 * Gets the path to hooks.json file
 * @param workspacePath Workspace root path
 * @param isPersonal If true, returns personal hooks path (~/.cursor/hooks.json)
 * @returns Path to hooks.json
 */
export function getHooksPath(workspacePath: string, isPersonal: boolean): string {
  if (isPersonal) {
    return getPersonalHooksPath();
  }
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'hooks.json');
}

/**
 * Gets the personal hooks.json path (~/.cursor/hooks.json)
 * @returns Path to personal hooks.json
 */
export function getPersonalHooksPath(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.cursor', 'hooks.json');
}

/**
 * Gets the full path to the skills folder
 * @param workspacePath Optional workspace path (if not provided, returns user home path)
 * @param isUser If true, returns path in user home directory; if false, returns workspace path
 */
export function getSkillsPath(workspacePath?: string, isUser: boolean = false): string {
  const baseFolderName = getBaseFolderName();
  
  if (isUser || !workspacePath) {
    return path.join(getUserHomePath(), `.${baseFolderName}`, 'skills');
  }
  
  return path.join(workspacePath, `.${baseFolderName}`, 'skills');
}

/**
 * Gets the paths to the skills folders to show in Personal Skills view
 * @returns Array of folder paths (includes both .cursor and .claude for compatibility)
 */
export function getPersonalSkillsPaths(): string[] {
  const homePath = getUserHomePath();
  const baseFolderName = getBaseFolderName();
  const paths: string[] = [];
  
  // Always include .cursor and .claude for skills (both are supported)
  paths.push(path.join(homePath, '.cursor', 'skills'));
  paths.push(path.join(homePath, '.claude', 'skills'));
  
  // Also include configured base folder if different
  if (baseFolderName !== 'cursor' && baseFolderName !== 'claude') {
    paths.push(path.join(homePath, `.${baseFolderName}`, 'skills'));
  }
  
  return paths;
}

/**
 * Checks if a folder contains a SKILL.md file
 * @param folderPath The folder path to check
 * @returns true if the folder contains SKILL.md
 */
export async function isSkillFolder(folderPath: string): Promise<boolean> {
  try {
    const skillFilePath = path.join(folderPath, 'SKILL.md');
    const skillUri = vscode.Uri.file(skillFilePath);
    await vscode.workspace.fs.stat(skillUri);
    return true;
  } catch {
    return false;
  }
}
