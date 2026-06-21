import * as vscode from 'vscode';
import * as path from 'path';
import {
  ALL_HOOK_EVENTS,
  hookEventFromScriptBasename,
  hookStubContent,
  hookStubFilename,
  isValidHookScriptName,
  type HookEventName,
} from './hookScriptUtils';
import { getPersonalHooksPath as getPersonalHooksPathFromUtils } from './utils';

/**
 * Represents the structure of a hooks.json file
 */
export interface HooksConfig {
  version: number;
  hooks: {
    [hookName: string]: Array<{ command: string }>;
  };
}

/**
 * List of all documented Cursor hooks (legacy export — prefer ALL_HOOK_EVENTS).
 */
export const DOCUMENTED_HOOKS: string[] = [...ALL_HOOK_EVENTS];

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
  return getProjectHooksPath(workspacePath);
}

/**
 * Gets the personal hooks.json path (~/.cursor/hooks.json)
 * @returns Path to personal hooks.json
 */
export function getPersonalHooksPath(): string {
  return getPersonalHooksPathFromUtils();
}

/**
 * Gets the project hooks.json path (<workspace>/.cursor/hooks.json)
 * @param workspacePath Workspace root path
 * @returns Path to project hooks.json
 */
export function getProjectHooksPath(workspacePath: string): string {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const baseFolderName = config.get<string>('baseFolder', 'cursor');
  return path.join(workspacePath, `.${baseFolderName}`, 'hooks.json');
}

/**
 * Creates a hooks.json file with empty structure
 * @param targetPath Path where to create the hooks.json file
 */
export async function createHooksFile(targetPath: string): Promise<void> {
  const hooks: HooksConfig['hooks'] = {};
  for (const event of ALL_HOOK_EVENTS) {
    hooks[event] = [];
  }
  const template: HooksConfig = {
    version: 1,
    hooks,
  };

  const content = JSON.stringify(template, null, 2);
  const uri = vscode.Uri.file(targetPath);

  // Create directory if it doesn't exist
  const dirPath = path.dirname(targetPath);
  const dirUri = vscode.Uri.file(dirPath);
  
  try {
    await vscode.workspace.fs.stat(dirUri);
  } catch {
    // Directory doesn't exist, create it
    await vscode.workspace.fs.createDirectory(dirUri);
  }

  // Write file
  await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
}

/**
 * Validates if a file is a valid hooks.json
 * @param filePath Path to the hooks.json file
 * @returns True if valid, false otherwise
 */
export async function validateHooksFile(filePath: string): Promise<boolean> {
  try {
    const config = await parseHooksFile(filePath);
    return config !== null;
  } catch {
    return false;
  }
}

/**
 * Parses and validates a hooks.json file
 * @param filePath Path to the hooks.json file
 * @returns Parsed HooksConfig or null if invalid
 */
export async function parseHooksFile(filePath: string): Promise<HooksConfig | null> {
  try {
    const uri = vscode.Uri.file(filePath);
    const fileContent = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(fileContent).toString('utf8');
    
    const config = JSON.parse(content) as HooksConfig;

    // Validate structure
    if (typeof config.version !== 'number') {
      vscode.window.showErrorMessage('Invalid hooks.json: version field must be a number');
      return null;
    }

    if (typeof config.hooks !== 'object' || config.hooks === null) {
      vscode.window.showErrorMessage('Invalid hooks.json: hooks field must be an object');
      return null;
    }

    // Validate each hook
    for (const [hookName, hookArray] of Object.entries(config.hooks)) {
      if (!Array.isArray(hookArray)) {
        vscode.window.showErrorMessage(`Invalid hooks.json: hook '${hookName}' must be an array`);
        return null;
      }

      // Check if hook is documented
      if (!DOCUMENTED_HOOKS.includes(hookName)) {
        vscode.window.showWarningMessage(
          `Warning: Hook '${hookName}' is not documented by Cursor. It may not work as expected.`
        );
      }

      // Validate each hook entry
      for (const entry of hookArray) {
        if (typeof entry !== 'object' || entry === null) {
          vscode.window.showErrorMessage(
            `Invalid hooks.json: hook '${hookName}' entries must be objects`
          );
          return null;
        }

        if (typeof entry.command !== 'string') {
          vscode.window.showErrorMessage(
            `Invalid hooks.json: hook '${hookName}' entries must have a 'command' field of type string`
          );
          return null;
        }
      }
    }

    return config;
  } catch (error) {
    if (isHooksFileNotFoundError(error)) {
      return null;
    }
    vscode.window.showErrorMessage(`Error parsing hooks.json: ${error}`);
    return null;
  }
}

function isHooksFileNotFoundError(error: unknown): boolean {
  if (error instanceof vscode.FileSystemError) {
    return error.code === 'FileNotFound' || error.code === 'EntryNotFound';
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('ENOENT') || message.includes('EntryNotFound');
}

/**
 * Checks if a hooks.json file exists at the given path
 * @param filePath Path to check
 * @returns True if file exists, false otherwise
 */
export async function hooksFileExists(filePath: string): Promise<boolean> {
  try {
    const uri = vscode.Uri.file(filePath);
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

/**
 * Clears all hook registrations in hooks.json (scripts remain on disk).
 */
export async function clearHooksConfig(hooksPath: string): Promise<void> {
  await createHooksFile(hooksPath);
}

/**
 * Creates missing default hook script stubs (idempotent).
 */
export async function spawnHookPlaceholders(hooksJsonPath: string): Promise<string[]> {
  const hooksDir = path.join(path.dirname(hooksJsonPath), 'hooks');
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(hooksDir));
  const created: string[] = [];
  for (const event of ALL_HOOK_EVENTS) {
    const filename = hookStubFilename(event);
    const scriptPath = path.join(hooksDir, filename);
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(scriptPath));
    } catch {
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(scriptPath),
        Buffer.from(hookStubContent(event), 'utf8')
      );
      created.push(scriptPath);
    }
  }
  if (!(await hooksFileExists(hooksJsonPath))) {
    await createHooksFile(hooksJsonPath);
  }
  return created;
}

function scriptCommandForHooksJson(scriptPath: string, hooksDir: string): string {
  const rel = path.relative(hooksDir, scriptPath).replace(/\\/g, '/');
  const ext = path.extname(scriptPath).toLowerCase();
  if (ext === '.js' || ext === '.ts') {
    return `node ./hooks/${rel}`;
  }
  return `./hooks/${rel}`;
}

/**
 * Enables or disables a hook script in hooks.json for its mapped event.
 */
export async function setHookScriptEnabled(
  hooksJsonPath: string,
  scriptName: string,
  enabled: boolean
): Promise<{ event: string | null; enabled: boolean }> {
  if (!isValidHookScriptName(scriptName)) {
    throw new Error('Invalid hook script name');
  }
  const hooksDir = path.join(path.dirname(hooksJsonPath), 'hooks');
  const scriptPath = path.join(hooksDir, scriptName);
  const event = hookEventFromScriptBasename(scriptName);
  if (!event) {
    throw new Error(`Cannot map script name to a documented hook event: ${scriptName}`);
  }

  if (!(await hooksFileExists(hooksJsonPath))) {
    await createHooksFile(hooksJsonPath);
  }

  const config = (await parseHooksFile(hooksJsonPath)) ?? {
    version: 1,
    hooks: Object.fromEntries(ALL_HOOK_EVENTS.map((e) => [e, []])) as HooksConfig['hooks'],
  };

  const commandRef = scriptCommandForHooksJson(scriptPath, hooksDir);
  for (const hookName of Object.keys(config.hooks)) {
    config.hooks[hookName] = (config.hooks[hookName] ?? []).filter(
      (entry) => entry.command !== commandRef && !entry.command.endsWith(`/${scriptName}`)
    );
  }

  if (enabled) {
    if (!config.hooks[event]) {
      config.hooks[event] = [];
    }
    config.hooks[event].push({ command: commandRef });
  }

  await vscode.workspace.fs.writeFile(
    vscode.Uri.file(hooksJsonPath),
    Buffer.from(JSON.stringify(config, null, 2), 'utf8')
  );

  return { event, enabled };
}

export { ALL_HOOK_EVENTS, type HookEventName };

