import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import {
  buildExtensionDataSubfolderPath,
  isExtensionDataSubfolderPath,
  normalizeExtensionDataFolderName,
  resolveExtensionDataSubfolderRoot,
} from './extensionDataPaths';

/**
 * Sanitizes the file name to use only letters, numbers, dots, hyphens, and underscores
 */
export function sanitizeFileName(name: string): string {
  // Remove file extension
  const nameWithoutExt = path.parse(name).name;
  // Remove invalid characters, keeping only letters, numbers, dots, hyphens, and underscores
  return nameWithoutExt.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Maximum URL length (e.g. for deeplinks and annotation URIs). */
export const MAX_URL_LENGTH = 8000;

/**
 * Validates if the URL has less than 8000 characters
 */
export function validateUrlLength(url: string): boolean {
  return url.length < MAX_URL_LENGTH;
}

const TRUNCATION_SUFFIX = '\n\n[Content truncated due to 8000 character URL limit.]';

/**
 * Truncates annotation content so that when encoded (e.g. as code= in a URI) it fits within the URL length limit.
 * Appends a truncation notice at the end.
 * @param maxEncodedLength Maximum length allowed for encodeURIComponent(truncatedContent + suffix)
 * @param content Decoded content (e.g. code or text param)
 * @returns Truncated content with truncation suffix appended
 */
export function truncateAnnotationContentToFitUrl(maxEncodedLength: number, content: string): string {
  if (maxEncodedLength <= 0) {
    return TRUNCATION_SUFFIX.trim();
  }
  let truncated = content;
  while (truncated.length > 0 && encodeURIComponent(truncated + TRUNCATION_SUFFIX).length > maxEncodedLength) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + TRUNCATION_SUFFIX;
}

/**
 * Detects the file type based on the path
 */
export function getFileTypeFromPath(filePath: string): 'command' | 'rule' | 'prompt' | 'notepad' | 'http' | 'env' | 'hooks' | 'plan' | 'skill' | null {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const baseFolderName = getBaseFolderName();
  
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
  // Notepads: extension data folder (.cursortoys) or legacy base folder
  if (
    isExtensionDataSubfolderPath(normalizedPath, 'notepads', getExtensionDataFolderName(), baseFolderName)
  ) {
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
  // HTTP requests in .{baseFolder}/http/ folder
  if (normalizedPath.includes(`/.${baseFolderName}/http/`) ||
      normalizedPath.includes('/.cursor/http/')) {
    const ext = getFileExtension(filePath).toLowerCase();
    if (ext === 'req' || ext === 'request') {
      return 'http';
    }
  }
  // Project-root environment files (.env, .env.local, .env.dev, etc.)
  if (isProjectRootEnvironmentFile(filePath)) {
    return 'env';
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
 * Gets the configured extension data folder name (default: cursortoys → `.cursortoys/`).
 */
export function getExtensionDataFolderName(): string {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const folderName = config.get<string>('extensionDataFolder', 'cursortoys');
  return normalizeExtensionDataFolderName(folderName);
}

function directoryHasContent(dirPath: string, maxDepth = 4): boolean {
  if (!fs.existsSync(dirPath)) {
    return false;
  }
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        return true;
      }
      if (entry.isDirectory() && maxDepth > 0) {
        if (directoryHasContent(path.join(dirPath, entry.name), maxDepth - 1)) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function resolveExtensionDataRoot(
  workspacePath: string | undefined,
  isPersonal: boolean,
  subfolder: 'kanban' | 'notepads'
): string {
  return resolveExtensionDataSubfolderRoot({
    homePath: getUserHomePath(),
    workspacePath,
    isPersonal,
    subfolder,
    extensionDataFolder: getExtensionDataFolderName(),
    baseFolderName: getBaseFolderName(),
    pathHasContent: directoryHasContent,
  });
}

/**
 * Canonical path for new extension data (always under `.cursortoys/` or configured folder).
 */
export function getCanonicalExtensionDataPath(
  subfolder: 'kanban' | 'notepads',
  workspacePath?: string,
  isPersonal: boolean = false
): string {
  const rootDir = isPersonal
    ? getUserHomePath()
    : (workspacePath ?? getUserHomePath());
  return buildExtensionDataSubfolderPath(rootDir, getExtensionDataFolderName(), subfolder);
}

/**
 * Gets the resolved notepads folder (personal or workspace), with legacy fallback.
 */
export function getNotepadsPath(workspacePath?: string, isPersonal: boolean = false): string {
  return resolveExtensionDataRoot(workspacePath, isPersonal, 'notepads');
}

/**
 * Gets the resolved Kanban folder (personal or workspace), with legacy fallback.
 */
export function getKanbanPath(workspacePath?: string, isPersonal: boolean = false): string {
  return resolveExtensionDataRoot(workspacePath, isPersonal, 'kanban');
}

/**
 * Returns true when a personal Kanban or notepads folder has content.
 */
export function extensionDataScopeHasContent(
  subfolder: 'kanban' | 'notepads',
  isPersonal: boolean,
  workspacePath?: string
): boolean {
  const root = resolveExtensionDataRoot(workspacePath, isPersonal, subfolder);
  return directoryHasContent(root);
}

/**
 * Gets the workspace clipboard folder (history metadata and workspace-scoped command clipboard).
 */
export function getClipboardPath(workspacePath: string): string {
  const baseFolderName = getBaseFolderName();
  return path.join(workspacePath, `.${baseFolderName}`, 'clipboard');
}

/**
 * Gets the personal (global) clipboard folder under the user home directory.
 */
export function getPersonalClipboardPath(): string {
  const baseFolderName = getBaseFolderName();
  return path.join(getUserHomePath(), `.${baseFolderName}`, 'clipboard');
}

/**
 * Paths for global command clipboard storage (includes legacy .cursor when baseFolder differs).
 */
export function getPersonalClipboardPaths(): string[] {
  const homePath = getUserHomePath();
  const baseFolderName = getBaseFolderName();
  const paths: string[] = [path.join(homePath, `.${baseFolderName}`, 'clipboard')];
  if (baseFolderName !== 'cursor') {
    paths.push(path.join(homePath, '.cursor', 'clipboard'));
  }
  return paths;
}

/**
 * File path for persisted snippet slots (clip01, clip02, …).
 */
export function getClipboardSlotsFilePath(): string {
  return path.join(getPersonalClipboardPath(), 'slots.json');
}

/**
 * Directory for saved commands for a given scope.
 */
export function getClipboardCommandsDir(
  scope: 'global' | 'workspace' | 'project',
  workspacePath?: string
): string {
  if (scope === 'global') {
    return path.join(getPersonalClipboardPath(), 'commands');
  }
  const root = workspacePath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return path.join(getPersonalClipboardPath(), 'commands');
  }
  return path.join(getClipboardPath(root), 'commands');
}

/**
 * Returns true when the path is under the workspace Kanban folder.
 */
export function isKanbanCardPath(filePath: string): boolean {
  return isExtensionDataSubfolderPath(
    filePath,
    'kanban',
    getExtensionDataFolderName(),
    getBaseFolderName()
  );
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

import { getHttpResponseExtension, isHttpRequestExtension } from './httpRequestExtensions';

/**
 * Checks if a file is an HTTP request file in .{baseFolder}/http/ folder
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
  
  const ext = getFileExtension(filePath).toLowerCase();
  return isHttpRequestExtension(ext);
}

/**
 * Gets the response file path for a given request file path
 * @param requestPath The path to the HTTP request file
 * @returns The path to the corresponding response sidecar file
 */
export function getHttpResponsePath(requestPath: string): string {
  const ext = getFileExtension(requestPath).toLowerCase();
  const dir = path.dirname(requestPath);
  const baseName = getFileNameWithoutExtension(requestPath);
  const responseExt = getHttpResponseExtension(ext);
  return path.join(dir, `${baseName}.${responseExt}`);
}

/**
 * Returns the workspace root directory used for project .env files
 * @param workspacePath Workspace path
 */
export function getProjectEnvRoot(workspacePath: string): string {
  return workspacePath;
}

/**
 * Resolves the file path for a named HTTP environment at the project root
 * @param workspacePath Workspace path
 * @param envName Environment name (`default` maps to `.env`)
 */
export function getProjectEnvFilePath(workspacePath: string, envName: string): string {
  const fileName = envName === 'default' ? '.env' : `.env.${envName}`;
  return path.join(getProjectEnvRoot(workspacePath), fileName);
}

/**
 * Maps a project-root .env filename to an environment name
 * @returns Environment name or null if not a runnable env file (e.g. `.env.example`)
 */
export function envNameFromProjectEnvFileName(fileName: string): string | null {
  if (fileName === '.env') {
    return 'default';
  }
  if (fileName === '.env.example') {
    return null;
  }
  if (fileName.startsWith('.env.')) {
    return fileName.substring(5);
  }
  return null;
}

/**
 * Lists runnable .env* files at the project root (excludes `.env.example`)
 */
export function listProjectEnvFileNames(workspacePath: string): string[] {
  const root = getProjectEnvRoot(workspacePath);
  if (!fs.existsSync(root)) {
    return [];
  }
  try {
    return fs.readdirSync(root).filter((file) => {
      if (!file.startsWith('.env')) {
        return false;
      }
      return envNameFromProjectEnvFileName(file) !== null;
    });
  } catch {
    return [];
  }
}

/**
 * Returns true when the file is a direct child .env* file of a workspace root
 */
export function isProjectRootEnvironmentFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  if (!fileName.startsWith('.env') || envNameFromProjectEnvFileName(fileName) === null) {
    return false;
  }
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parentDir = path.dirname(normalizedPath);
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) {
    return false;
  }
  for (const folder of folders) {
    const root = folder.uri.fsPath.replace(/\\/g, '/');
    if (parentDir === root) {
      return true;
    }
  }
  return false;
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
  return isProjectRootEnvironmentFile(filePath);
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

/** Skill folder name installed by createHttpDocsSkill */
export const HTTP_DOCS_SKILL_NAME = 'cursor-toys-http';

/** Skill folder name installed by createMcpDocsSkill */
export const MCP_DOCS_SKILL_NAME = 'cursor-toys-mcp';

export interface CreateHttpDocsSkillOptions {
  /** VS Code extension root (contains resources/skills/) */
  extensionPath?: string;
  /** Install into ~/.{baseFolder}/skills (default: ask user) */
  installPersonal?: boolean;
  /** Workspace folder path when installing a project skill */
  workspacePath?: string;
}

export type CreateMcpDocsSkillOptions = CreateHttpDocsSkillOptions;

interface InstallBundledSkillOptions {
  extensionPath: string;
  installPersonal?: boolean;
  workspacePath?: string;
  skillFolderName: string;
  skillLabel: string;
  placeHolder: string;
  projectSkillError: string;
  loadContent: (extensionPath: string, baseFolderName: string) => string;
}

async function installBundledSkill(options: InstallBundledSkillOptions): Promise<string | undefined> {
  const baseFolderName = getBaseFolderName();
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const workspacePath = options.workspacePath ?? workspaceFolder?.uri.fsPath;

  let installPersonal = options.installPersonal;
  if (installPersonal === undefined) {
    const location = await vscode.window.showQuickPick(
      [
        {
          label: 'Project skill',
          description: workspacePath
            ? `Shared with this repo (${path.join(`.${baseFolderName}`, 'skills')})`
            : 'Requires an open workspace',
          value: false as const,
        },
        {
          label: 'Personal skill',
          description: `Available in all projects (~/.${baseFolderName}/skills)`,
          value: true as const,
        },
      ],
      { placeHolder: options.placeHolder }
    );
    if (location === undefined) {
      return undefined;
    }
    installPersonal = location.value;
  }

  if (!installPersonal && !workspacePath) {
    vscode.window.showErrorMessage(options.projectSkillError);
    return undefined;
  }

  const skillsRoot = getSkillsPath(workspacePath, installPersonal);
  const skillPath = path.join(skillsRoot, options.skillFolderName);
  const skillFilePath = path.join(skillPath, 'SKILL.md');
  const skillFileUri = vscode.Uri.file(skillFilePath);

  let skillExists = false;
  try {
    await vscode.workspace.fs.stat(skillFileUri);
    skillExists = true;
  } catch {
    // Skill does not exist yet
  }

  if (skillExists) {
    const overwrite = await vscode.window.showInformationMessage(
      `${options.skillLabel} (${options.skillFolderName}) already exists. Reinstall?`,
      'Reinstall',
      'Cancel'
    );
    if (overwrite !== 'Reinstall') {
      return undefined;
    }
  }

  await vscode.workspace.fs.createDirectory(vscode.Uri.file(skillPath));
  const skillContent = options.loadContent(options.extensionPath, baseFolderName);
  await vscode.workspace.fs.writeFile(skillFileUri, Buffer.from(skillContent, 'utf8'));

  const scope = installPersonal ? 'personal' : 'project';
  vscode.window.showInformationMessage(`${options.skillLabel} installed (${scope}): ${options.skillFolderName}`);

  const document = await vscode.workspace.openTextDocument(skillFileUri);
  await vscode.window.showTextDocument(document);
  return skillFilePath;
}

/**
 * Loads the bundled HTTP skill template and substitutes folder placeholders.
 */
export function loadHttpDocsSkillTemplate(extensionPath: string, baseFolderName?: string): string {
  const baseFolder = baseFolderName ?? getBaseFolderName();
  const httpFolder = `.${baseFolder}/http`;
  const templatePath = path.join(extensionPath, 'resources', 'skills', HTTP_DOCS_SKILL_NAME, 'SKILL.md');
  const raw = fs.readFileSync(templatePath, 'utf8');
  return raw.split('{{HTTP_FOLDER}}').join(httpFolder).split('{{BASE_FOLDER}}').join(baseFolder);
}

/**
 * Loads the bundled MCP skill template from resources/skills/.
 */
export function loadMcpDocsSkillTemplate(extensionPath: string, _baseFolderName?: string): string {
  const templatePath = path.join(extensionPath, 'resources', 'skills', MCP_DOCS_SKILL_NAME, 'SKILL.md');
  return fs.readFileSync(templatePath, 'utf8');
}

/**
 * Installs the CursorToys HTTP skill (create, organize, test .req files + CLI).
 */
export async function createHttpDocsSkill(options: CreateHttpDocsSkillOptions = {}): Promise<void> {
  if (!options.extensionPath) {
    vscode.window.showErrorMessage('Extension path is required to install the HTTP skill.');
    return;
  }
  try {
    await installBundledSkill({
      extensionPath: options.extensionPath,
      installPersonal: options.installPersonal,
      workspacePath: options.workspacePath,
      skillFolderName: HTTP_DOCS_SKILL_NAME,
      skillLabel: 'HTTP skill',
      placeHolder: 'Where should the HTTP skill be installed?',
      projectSkillError: 'Open a workspace folder to install a project HTTP skill.',
      loadContent: loadHttpDocsSkillTemplate,
    });
  } catch (error) {
    console.error('Failed to create HTTP skill:', error);
    vscode.window.showErrorMessage(
      `Failed to install HTTP skill: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Installs the CursorToys MCP skill (tools, resources, prompts guide for agents).
 */
export async function createMcpDocsSkill(options: CreateMcpDocsSkillOptions = {}): Promise<string | undefined> {
  if (!options.extensionPath) {
    vscode.window.showErrorMessage('Extension path is required to install the MCP skill.');
    return undefined;
  }
  try {
    return await installBundledSkill({
      extensionPath: options.extensionPath,
      installPersonal: options.installPersonal,
      workspacePath: options.workspacePath,
      skillFolderName: MCP_DOCS_SKILL_NAME,
      skillLabel: 'MCP skill',
      placeHolder: 'Where should the MCP skill be installed?',
      projectSkillError: 'Open a workspace folder to install a project MCP skill.',
      loadContent: loadMcpDocsSkillTemplate,
    });
  } catch (error) {
    console.error('Failed to create MCP skill:', error);
    vscode.window.showErrorMessage(
      `Failed to install MCP skill: ${error instanceof Error ? error.message : String(error)}`
    );
    return undefined;
  }
}
