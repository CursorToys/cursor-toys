import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { EnvironmentManager } from '../../environmentManager';
import { buildCursortoysNpxCommand, getHttpTestWorkspaceContext } from '../../httpCliRunner';
import { copyCurlCommand, executeHttpRequestFromFile } from '../../httpRequestExecutor';
import {
  createHttpDocsSkill,
  envNameFromProjectEnvFileName,
  getHttpPath,
  getPersonalHttpPath,
  getPersonalHttpPaths,
  getProjectEnvFilePath,
  getProjectEnvRoot,
  isHttpRequestFile,
  listProjectEnvFileNames,
  sanitizeFileName,
} from '../../utils';
import { redactSecrets } from '../security';

const execAsync = promisify(child_process.exec);

function requireWorkspace(): string {
  const ctx = getHttpTestWorkspaceContext();
  if (!ctx) {
    throw new Error('No workspace folder open');
  }
  return ctx.workspacePath;
}

async function listHttpFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    await fs.promises.access(dir);
  } catch {
    return results;
  }
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listHttpFilesRecursive(full)));
    } else if (isHttpRequestFile(full)) {
      results.push(full);
    }
  }
  return results.sort();
}

export async function httpList(): Promise<unknown> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const personalHttpPaths = getPersonalHttpPaths();
  const personalFiles = new Set<string>();

  for (const root of personalHttpPaths) {
    for (const filePath of await listHttpFilesRecursive(root)) {
      personalFiles.add(filePath.replace(/\\/g, '/'));
    }
  }

  let projectHttpPath: string | null = null;
  const projectFiles = new Set<string>();
  if (workspacePath) {
    projectHttpPath = getHttpPath(workspacePath);
    for (const filePath of await listHttpFilesRecursive(projectHttpPath)) {
      projectFiles.add(filePath.replace(/\\/g, '/'));
    }
  }

  const allFiles = [...new Set([...personalFiles, ...projectFiles])].sort();

  return {
    personalHttpPaths,
    personalHttpPath: getPersonalHttpPath(),
    httpPath: projectHttpPath,
    files: allFiles.map((filePath) => ({
      filePath,
      relativePath: workspacePath
        ? path.relative(workspacePath, filePath).replace(/\\/g, '/')
        : path.basename(filePath),
      scope: personalFiles.has(filePath) ? 'personal' : 'project',
    })),
  };
}

export async function httpRead(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  if (!path.isAbsolute(filePath)) {
    if (!workspacePath) {
      throw new Error('No workspace folder open for relative filePath');
    }
    filePath = path.join(workspacePath, filePath);
  }
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return {
    filePath,
    content: Buffer.from(raw).toString('utf8'),
  };
}

export async function httpCreate(args: Record<string, unknown>): Promise<unknown> {
  const scope = args.scope === 'personal' ? 'personal' : 'project';
  let httpPath: string;
  if (scope === 'personal') {
    httpPath = getHttpPath(undefined, true);
  } else {
    const workspacePath = requireWorkspace();
    httpPath = getHttpPath(workspacePath);
  }
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(httpPath));
  const baseName = sanitizeFileName(String(args.name ?? 'new-request').trim() || 'new-request');
  const method = String(args.method ?? 'GET').toUpperCase();
  const url = String(args.url ?? '{{HOST}}/api/example');
  const filePath = path.join(httpPath, `${baseName}.req`);
  const title = baseName.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const body = args.body !== undefined ? String(args.body) : '';
  const content = [
    `# @title ${title}`,
    '',
    `${method} ${url}`,
    'Content-Type: application/json',
    '',
    body,
    '',
  ].join('\n');
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(content, 'utf8'));
  const created = (await httpRead({ filePath })) as Record<string, unknown>;
  return { ...created, scope };
}

export async function httpUpdate(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = requireWorkspace();
  let filePath = args.filePath as string | undefined;
  const content = args.content;
  if (!filePath || content === undefined) {
    throw new Error('filePath and content are required');
  }
  if (!path.isAbsolute(filePath)) {
    filePath = path.join(workspacePath, filePath);
  }
  await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), Buffer.from(String(content), 'utf8'));
  return httpRead({ filePath });
}

export async function httpDelete(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = requireWorkspace();
  let filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  if (!path.isAbsolute(filePath)) {
    filePath = path.join(workspacePath, filePath);
  }
  await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
  return { deleted: true, filePath };
}

export async function httpRun(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = requireWorkspace();
  let filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  if (!path.isAbsolute(filePath)) {
    filePath = path.join(workspacePath, filePath);
  }
  await executeHttpRequestFromFile(vscode.Uri.file(filePath));
  const responsePath = filePath.replace(/\.request$/i, '.response').replace(/\.req$/i, '.res');
  let responseContent: string | undefined;
  try {
    const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(responsePath));
    responseContent = Buffer.from(raw).toString('utf8');
  } catch {
    responseContent = undefined;
  }
  return { filePath, responsePath, responseContent };
}

export async function httpToCurl(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = requireWorkspace();
  let filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  if (!path.isAbsolute(filePath)) {
    filePath = path.join(workspacePath, filePath);
  }
  await copyCurlCommand(vscode.Uri.file(filePath));
  return { ok: true, message: 'cURL copied to clipboard' };
}

async function runHttpTestCli(extraArgs: string): Promise<unknown> {
  const workspacePath = requireWorkspace();
  const config = vscode.workspace.getConfiguration('cursorToys');
  const baseFolder = config.get<string>('baseFolder', 'cursor');
  const cmd = [
    buildCursortoysNpxCommand('http test'),
    `-p "${workspacePath}"`,
    `--base-folder "${baseFolder}"`,
    extraArgs,
  ].join(' ');
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      cwd: workspacePath,
      timeout: 300_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      exitCode: typeof e.code === 'number' ? e.code : 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? String(err),
    };
  }
}

export async function httpRunTestsFile(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = requireWorkspace();
  let filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  if (!path.isAbsolute(filePath)) {
    filePath = path.join(workspacePath, filePath);
  }
  return runHttpTestCli(`-f "${filePath}"`);
}

export async function httpRunTestsFolder(args: Record<string, unknown>): Promise<unknown> {
  const ctx = getHttpTestWorkspaceContext();
  if (!ctx) {
    throw new Error('No workspace');
  }
  const folderRelative = args.folderRelativePath as string | undefined;
  if (folderRelative === undefined) {
    throw new Error('folderRelativePath is required (relative to http root)');
  }
  return runHttpTestCli(`--folder "${folderRelative.replace(/\\/g, '/')}"`);
}

export async function httpRunTestsAll(): Promise<unknown> {
  return runHttpTestCli('');
}

export async function httpRunAssertions(args: Record<string, unknown>): Promise<unknown> {
  return httpRunTestsFile(args);
}

export async function httpListEnvs(): Promise<unknown> {
  const workspacePath = requireWorkspace();
  const envRoot = getProjectEnvRoot(workspacePath);
  const files = listProjectEnvFileNames(workspacePath);
  const envs = files.map((fileName) => {
    const name = envNameFromProjectEnvFileName(fileName) ?? fileName;
    const filePath = path.join(envRoot, fileName);
    let keys: string[] = [];
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      keys = content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split('=')[0]?.trim())
        .filter((k): k is string => Boolean(k));
    } catch {
      keys = [];
    }
    return { name, fileName, keys };
  });
  return { envRoot, environments: envs };
}

export async function httpGetEnv(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = requireWorkspace();
  const name = String(args.name ?? 'dev');
  const envManager = EnvironmentManager.getInstance();
  const vars = envManager.loadEnvironment(name, workspacePath);
  if (!vars) {
    throw new Error(`Environment not found: ${name}`);
  }
  const record: Record<string, string> = {};
  for (const [k, v] of vars.entries()) {
    record[k] = v;
  }
  return { name, variables: redactSecrets(record) };
}

export async function httpCreateEnv(args: Record<string, unknown>): Promise<unknown> {
  const workspacePath = requireWorkspace();
  const name = String(args.name ?? 'dev');
  const filePath = getProjectEnvFilePath(workspacePath, name);
  if (fs.existsSync(filePath)) {
    throw new Error(`Environment file already exists: ${filePath}`);
  }
  const template = String(args.template ?? '# HTTP environment variables\nHOST=http://localhost:3000\n');
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, template, 'utf8');
  return { filePath, name };
}

export async function httpGetActiveEnv(): Promise<unknown> {
  const envManager = EnvironmentManager.getInstance();
  return { activeEnvironment: envManager.getActiveEnvironment() };
}

export async function httpSetActiveEnv(args: Record<string, unknown>): Promise<unknown> {
  const name = String(args.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }
  const envManager = EnvironmentManager.getInstance();
  envManager.setActiveEnvironment(name);
  return { activeEnvironment: name };
}

export async function httpInstallSkill(): Promise<unknown> {
  await createHttpDocsSkill();
  return { installed: true };
}
