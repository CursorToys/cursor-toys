import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import { getMcpbRoot } from '../mcpbInstaller';
import type { McpbManifest } from '../mcpbInstaller';
import {
  getBaseFolderName,
  getCommandsPath,
  getHooksPath,
  getHttpPath,
  getKanbanPath,
  getNotepadsPath,
  getPersonalCommandsPaths,
  getPersonalHooksPath,
  getPersonalPlansPaths,
  getPersonalPromptsPaths,
  getPersonalSkillsPaths,
  getPlansPath,
  getPromptsPath,
  getRulesPath,
  getSkillsPath,
  isAllowedExtension,
  isHttpRequestFile,
  isPlanFile,
} from '../utils';
import { parseHooksFile } from '../hooksManager';

export interface ControlAssetItem {
  name: string;
  path: string;
  description?: string;
}

async function pathExists(dirPath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(dirPath));
    return true;
  } catch {
    return false;
  }
}

async function listMarkdownRecursive(
  basePath: string,
  currentPath: string,
  allowedExtensions: string[]
): Promise<ControlAssetItem[]> {
  const items: ControlAssetItem[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    for (const [name, type] of entries) {
      const itemPath = path.join(currentPath, name);
      if (type === vscode.FileType.File) {
        if (isAllowedExtension(itemPath, allowedExtensions)) {
          items.push({ name, path: itemPath });
        }
      } else if (type === vscode.FileType.Directory) {
        items.push(...(await listMarkdownRecursive(basePath, itemPath, allowedExtensions)));
      }
    }
  } catch {
    // ignore unreadable directories
  }
  return items;
}

async function listHttpRecursive(basePath: string, currentPath: string): Promise<ControlAssetItem[]> {
  const items: ControlAssetItem[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    for (const [name, type] of entries) {
      const itemPath = path.join(currentPath, name);
      if (type === vscode.FileType.File && isHttpRequestFile(itemPath)) {
        items.push({ name, path: itemPath });
      } else if (type === vscode.FileType.Directory) {
        items.push(...(await listHttpRecursive(basePath, itemPath)));
      }
    }
  } catch {
    // ignore
  }
  return items;
}

async function listSkillsRecursive(basePath: string, currentPath: string): Promise<ControlAssetItem[]> {
  const items: ControlAssetItem[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    for (const [name, type] of entries) {
      const itemPath = path.join(currentPath, name);
      if (type === vscode.FileType.Directory) {
        const skillMd = path.join(itemPath, 'SKILL.md');
        try {
          await vscode.workspace.fs.stat(vscode.Uri.file(skillMd));
          items.push({ name, path: skillMd, description: 'Skill' });
        } catch {
          items.push(...(await listSkillsRecursive(basePath, itemPath)));
        }
      }
    }
  } catch {
    // ignore
  }
  return items;
}

function dedupeByPath(items: ControlAssetItem[]): ControlAssetItem[] {
  const seen = new Set<string>();
  const out: ControlAssetItem[] = [];
  for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
    if (seen.has(item.path)) {
      continue;
    }
    seen.add(item.path);
    out.push(item);
  }
  return out;
}

export async function listPersonalCommands(): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const all: ControlAssetItem[] = [];
  for (const root of getPersonalCommandsPaths()) {
    if (await pathExists(root)) {
      all.push(...(await listMarkdownRecursive(root, root, allowedExtensions)));
    }
  }
  return dedupeByPath(all);
}

export async function listPersonalPrompts(): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const all: ControlAssetItem[] = [];
  for (const root of getPersonalPromptsPaths()) {
    if (await pathExists(root)) {
      all.push(...(await listMarkdownRecursive(root, root, allowedExtensions)));
    }
  }
  return dedupeByPath(all);
}

export async function listPersonalSkills(): Promise<ControlAssetItem[]> {
  const all: ControlAssetItem[] = [];
  for (const root of getPersonalSkillsPaths()) {
    if (await pathExists(root)) {
      all.push(...(await listSkillsRecursive(root, root)));
    }
  }
  return dedupeByPath(all);
}

export async function listProjectCommands(root: string): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const dir = getCommandsPath(root, false);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listMarkdownRecursive(dir, dir, allowedExtensions));
}

export async function listProjectPrompts(root: string): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const dir = getPromptsPath(root, false);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listMarkdownRecursive(dir, dir, allowedExtensions));
}

export async function listProjectRules(root: string): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const dir = getRulesPath(root, false);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listMarkdownRecursive(dir, dir, allowedExtensions));
}

export async function listProjectSkills(root: string): Promise<ControlAssetItem[]> {
  const dir = getSkillsPath(root);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listSkillsRecursive(dir, dir));
}

export async function listProjectHttp(root: string): Promise<ControlAssetItem[]> {
  const dir = getHttpPath(root);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listHttpRecursive(dir, dir));
}

export function getPersonalScopeLabel(): string {
  const base = getBaseFolderName();
  return `~/.${base}`;
}

export function getProjectScopeLabel(root: string): string {
  return path.basename(root) || root;
}

async function listPlansRecursive(basePath: string, currentPath: string): Promise<ControlAssetItem[]> {
  const items: ControlAssetItem[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    for (const [name, type] of entries) {
      const itemPath = path.join(currentPath, name);
      if (type === vscode.FileType.File && isPlanFile(itemPath)) {
        items.push({ name, path: itemPath });
      } else if (type === vscode.FileType.Directory) {
        items.push(...(await listPlansRecursive(basePath, itemPath)));
      }
    }
  } catch {
    // ignore
  }
  return items;
}

async function listNotepadsRecursive(basePath: string, currentPath: string): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  return listMarkdownRecursive(basePath, currentPath, allowedExtensions);
}

async function listKanbanRecursive(basePath: string, currentPath: string): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const items: ControlAssetItem[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(currentPath));
    for (const [name, type] of entries) {
      const itemPath = path.join(currentPath, name);
      if (type === vscode.FileType.File && isAllowedExtension(itemPath, allowedExtensions)) {
        items.push({ name, path: itemPath, description: path.basename(path.dirname(itemPath)) });
      } else if (type === vscode.FileType.Directory) {
        items.push(...(await listKanbanRecursive(basePath, itemPath)));
      }
    }
  } catch {
    // ignore
  }
  return items;
}

async function listHooksFile(hooksPath: string): Promise<ControlAssetItem[]> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(hooksPath));
    return [{ name: path.basename(hooksPath), path: hooksPath, description: 'hooks.json' }];
  } catch {
    return [];
  }
}

export async function listPersonalNotepads(): Promise<ControlAssetItem[]> {
  const dir = getNotepadsPath(undefined, true);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listNotepadsRecursive(dir, dir));
}

export async function listPersonalKanban(): Promise<ControlAssetItem[]> {
  const dir = getKanbanPath(undefined, true);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listKanbanRecursive(dir, dir));
}

export async function listPersonalPlans(): Promise<ControlAssetItem[]> {
  const all: ControlAssetItem[] = [];
  for (const root of getPersonalPlansPaths()) {
    if (await pathExists(root)) {
      all.push(...(await listPlansRecursive(root, root)));
    }
  }
  return dedupeByPath(all);
}

export async function listPersonalRules(): Promise<ControlAssetItem[]> {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const allowedExtensions = config.get<string[]>('allowedExtensions', ['md', 'mdc']);
  const dir = getRulesPath(undefined, true);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listMarkdownRecursive(dir, dir, allowedExtensions));
}

async function listHookScripts(hooksJsonPath: string): Promise<ControlAssetItem[]> {
  if (!(await pathExists(hooksJsonPath))) {
    return [];
  }
  const config = await parseHooksFile(hooksJsonPath);
  if (!config) {
    return [];
  }
  const hooksDir = path.dirname(hooksJsonPath);
  const items: ControlAssetItem[] = [];
  const seen = new Set<string>();

  for (const [hookName, commands] of Object.entries(config.hooks)) {
    for (const commandObj of commands) {
      const command = commandObj.command;
      if (!command) {
        continue;
      }
      const scriptPath = path.isAbsolute(command)
        ? command
        : path.join(hooksDir, command.replace(/^\.\//, ''));
      if (seen.has(scriptPath)) {
        continue;
      }
      seen.add(scriptPath);
      items.push({
        name: path.basename(scriptPath),
        path: scriptPath,
        description: hookName,
      });
    }
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listPersonalHooks(): Promise<ControlAssetItem[]> {
  const hooksPath = getPersonalHooksPath();
  if (!(await pathExists(hooksPath))) {
    return [];
  }
  const files = await listHooksFile(hooksPath);
  const scripts = await listHookScripts(hooksPath);
  return dedupeByPath([...files, ...scripts]);
}

export async function listMcpbPackages(): Promise<ControlAssetItem[]> {
  const mcpbRoot = getMcpbRoot();
  if (!(await pathExists(mcpbRoot))) {
    return [];
  }
  const items: ControlAssetItem[] = [];
  try {
    const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(mcpbRoot));
    for (const [name, type] of entries) {
      if (type !== vscode.FileType.Directory) {
        continue;
      }
      const packagePath = path.join(mcpbRoot, name);
      const manifestPath = path.join(packagePath, 'manifest.json');
      if (!fs.existsSync(manifestPath)) {
        continue;
      }
      let label = name;
      try {
        const raw = fs.readFileSync(manifestPath, 'utf8');
        const manifest = JSON.parse(raw) as McpbManifest;
        if (typeof manifest.display_name === 'string') {
          label = manifest.display_name;
        } else if (typeof manifest.name === 'string') {
          label = manifest.name;
        }
      } catch {
        // use folder name
      }
      items.push({ name: label, path: packagePath, description: name });
    }
  } catch {
    // ignore
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function listProjectNotepads(root: string): Promise<ControlAssetItem[]> {
  const dir = getNotepadsPath(root, false);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listNotepadsRecursive(dir, dir));
}

export async function listProjectKanban(root: string): Promise<ControlAssetItem[]> {
  const dir = getKanbanPath(root, false);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listKanbanRecursive(dir, dir));
}

export async function listProjectPlans(root: string): Promise<ControlAssetItem[]> {
  const dir = getPlansPath(root, false);
  if (!(await pathExists(dir))) {
    return [];
  }
  return dedupeByPath(await listPlansRecursive(dir, dir));
}

export async function listProjectHooks(root: string): Promise<ControlAssetItem[]> {
  const hooksPath = getHooksPath(root, false);
  if (!(await pathExists(hooksPath))) {
    return [];
  }
  const files = await listHooksFile(hooksPath);
  const scripts = await listHookScripts(hooksPath);
  return dedupeByPath([...files, ...scripts]);
}
