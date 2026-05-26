import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  getProjectEnvFilePath,
  getProjectEnvRoot,
  envNameFromProjectEnvFileName,
  listProjectEnvFileNames,
} from './utils';

/**
 * Environment Manager - loads HTTP environment variables from project-root .env files
 */
export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private activeEnvironment: string = 'dev';
  private environmentsCache: Map<string, Map<string, string>> = new Map();
  private _onDidChangeEnvironment: vscode.EventEmitter<string> = new vscode.EventEmitter<string>();
  public readonly onDidChangeEnvironment: vscode.Event<string> = this._onDidChangeEnvironment.event;
  private fileWatchers: Map<string, vscode.FileSystemWatcher> = new Map();
  private workspacePaths: Set<string> = new Set();

  private constructor() {
    // File watchers are set up when the extension activates
  }

  /**
   * Returns the singleton EnvironmentManager instance
   */
  public static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  /**
   * Returns the currently active environment name
   */
  public getActiveEnvironment(): string {
    return this.activeEnvironment;
  }

  /**
   * Sets the active environment name
   */
  public setActiveEnvironment(name: string): void {
    this.activeEnvironment = name;
    this._onDidChangeEnvironment.fire(name);
  }

  /**
   * Loads variables for a named environment from the project root
   * @param envName Environment name (e.g. 'dev', 'prod', 'default')
   * @param workspacePath Workspace path
   * @returns Variable map or null if the environment file was not found
   */
  public loadEnvironment(envName: string, workspacePath: string): Map<string, string> | null {
    const cacheKey = `${workspacePath}:${envName}`;
    if (this.environmentsCache.has(cacheKey)) {
      return this.environmentsCache.get(cacheKey)!;
    }

    let envFilePath = getProjectEnvFilePath(workspacePath, envName);

    if (!fs.existsSync(envFilePath) && envName !== 'default') {
      envFilePath = getProjectEnvFilePath(workspacePath, 'default');
      if (!fs.existsSync(envFilePath)) {
        return null;
      }
    } else if (!fs.existsSync(envFilePath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(envFilePath, 'utf8');
      const variables = this.parseEnvFile(content);
      this.environmentsCache.set(cacheKey, variables);
      return variables;
    } catch (error) {
      console.error(`Failed to load environment file: ${envFilePath}`, error);
      return null;
    }
  }

  /**
   * Parses .env file content into a variable map
   */
  private parseEnvFile(content: string): Map<string, string> {
    const variables = new Map<string, string>();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      if (separatorIndex === -1) {
        continue;
      }

      const key = trimmedLine.substring(0, separatorIndex).trim();
      let value = trimmedLine.substring(separatorIndex + 1).trim();

      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.substring(1, value.length - 1);
      }

      if (key) {
        variables.set(key.toLowerCase(), value);
      }
    }

    return variables;
  }

  /**
   * Replaces {{varName}} placeholders using environment variables
   */
  public replaceVariables(text: string, envName: string, workspacePath: string): string {
    const variables = this.loadEnvironment(envName, workspacePath);

    if (!variables) {
      return text;
    }

    let result = text;
    const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

    result = result.replace(variableRegex, (match, varName) => {
      const varNameLower = varName.toLowerCase();
      const value = variables.get(varNameLower);

      if (value !== undefined) {
        return value;
      }

      return match;
    });

    return result;
  }

  /**
   * Returns variable names that could not be resolved
   */
  public validateVariables(text: string, envName: string, workspacePath: string): string[] {
    const variables = this.loadEnvironment(envName, workspacePath);

    if (!variables) {
      const allVars: string[] = [];
      const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
      let match;

      while ((match = variableRegex.exec(text)) !== null) {
        if (!allVars.includes(match[1])) {
          allVars.push(match[1]);
        }
      }

      return allVars;
    }

    const unresolved: string[] = [];
    const variableRegex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;
    let match;

    while ((match = variableRegex.exec(text)) !== null) {
      const varName = match[1];
      const varNameLower = varName.toLowerCase();

      if (!variables.has(varNameLower) && !unresolved.includes(varName)) {
        unresolved.push(varName);
      }
    }

    return unresolved;
  }

  /**
   * Lists available environment names from project-root .env files
   */
  public getAvailableEnvironments(workspacePath: string): string[] {
    const envNames: string[] = [];

    for (const fileName of listProjectEnvFileNames(workspacePath)) {
      const envName = envNameFromProjectEnvFileName(fileName);
      if (envName) {
        envNames.push(envName);
      }
    }

    return envNames.sort();
  }

  public clearCache(): void {
    this.environmentsCache.clear();
  }

  public clearEnvironmentCache(envName: string, workspacePath: string): void {
    const cacheKey = `${workspacePath}:${envName}`;
    this.environmentsCache.delete(cacheKey);
  }

  public clearWorkspaceCache(workspacePath: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.environmentsCache.keys()) {
      if (key.startsWith(`${workspacePath}:`)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.environmentsCache.delete(key));
  }

  /**
   * Watches project-root .env files for changes
   */
  public setupFileWatchers(): void {
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      this.updateFileWatchers();
    });

    this.updateFileWatchers();
  }

  private updateFileWatchers(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    const currentPaths = new Set(workspaceFolders.map(f => f.uri.fsPath));
    for (const [watchedPath, watcher] of this.fileWatchers.entries()) {
      if (!currentPaths.has(watchedPath)) {
        watcher.dispose();
        this.fileWatchers.delete(watchedPath);
        this.workspacePaths.delete(watchedPath);
      }
    }

    for (const folder of workspaceFolders) {
      const workspacePath = folder.uri.fsPath;
      if (!this.workspacePaths.has(workspacePath)) {
        this.workspacePaths.add(workspacePath);
        this.createFileWatcher(workspacePath);
      }
    }
  }

  private createFileWatcher(workspacePath: string): void {
    const envRoot = getProjectEnvRoot(workspacePath);
    const pattern = new vscode.RelativePattern(vscode.Uri.file(envRoot), '.env*');
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);

    watcher.onDidChange(() => {
      this.clearWorkspaceCache(workspacePath);
      this._onDidChangeEnvironment.fire(this.activeEnvironment);
    });

    watcher.onDidCreate(() => {
      this.clearWorkspaceCache(workspacePath);
    });

    watcher.onDidDelete(() => {
      this.clearWorkspaceCache(workspacePath);
    });

    this.fileWatchers.set(workspacePath, watcher);
  }

  public dispose(): void {
    for (const watcher of this.fileWatchers.values()) {
      watcher.dispose();
    }
    this.fileWatchers.clear();
    this.workspacePaths.clear();
    this.environmentsCache.clear();
  }

  /**
   * Creates a new project-root environment file with a template
   */
  public async createEnvironment(envName: string, workspacePath: string): Promise<boolean> {
    const filePath = getProjectEnvFilePath(workspacePath, envName);

    if (fs.existsSync(filePath)) {
      return false;
    }

    const template = `# Environment: ${envName}
# Add your environment variables below in the format KEY=VALUE

BASE_URL=http://localhost:3000
API_KEY=your-api-key-here
TIMEOUT=10000
`;

    try {
      fs.writeFileSync(filePath, template, 'utf8');
      return true;
    } catch (error) {
      console.error(`Failed to create environment file: ${filePath}`, error);
      return false;
    }
  }

  /**
   * Creates default .env and .env.example at the project root when missing
   */
  public async initializeDefaultEnvironments(workspacePath: string): Promise<void> {
    const envRoot = getProjectEnvRoot(workspacePath);
    const hasRunnableEnv = listProjectEnvFileNames(workspacePath).length > 0;
    if (hasRunnableEnv) {
      return;
    }

    const defaultEnvPath = path.join(envRoot, '.env');
    if (!fs.existsSync(defaultEnvPath)) {
      const defaultContent = `# Default environment variables
# Used with # @env default or when a named .env.{name} file is missing

BASE_URL=http://localhost:3000
API_KEY=your-api-key-here
TIMEOUT=10000
`;
      fs.writeFileSync(defaultEnvPath, defaultContent, 'utf8');
    }

    const exampleEnvPath = path.join(envRoot, '.env.example');
    if (!fs.existsSync(exampleEnvPath)) {
      const exampleContent = `# Example environment file
#
# Usage:
# 1. Copy and rename to .env.{name} (e.g. .env.dev, .env.staging, .env.prod)
# 2. In .req files use: # @env dev
# 3. Reference variables as {{BASE_URL}}, {{API_KEY}}, etc.
#
# Project-root files (not under .cursor/http/):
#   .env         -> # @env default
#   .env.local   -> # @env local
#   .env.dev     -> # @env dev

BASE_URL=http://localhost:3000
API_KEY=your-api-key-here
TIMEOUT=10000
`;
      fs.writeFileSync(exampleEnvPath, exampleContent, 'utf8');
    }
  }
}
