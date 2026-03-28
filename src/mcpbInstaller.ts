import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { getUserHomePath } from './utils';

const MCPB_CLI_PACKAGE = '@anthropic-ai/mcpb';
const MCPB_NPX_TIMEOUT_MS = 120000;

/**
 * Runs npx @anthropic-ai/mcpb with the given arguments (no shell escaping; safe for paths with spaces).
 * @returns Exit code, stdout and stderr. Rejects on spawn error or timeout.
 */
function runNpxMcpb(args: string[]): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const argv = [MCPB_CLI_PACKAGE, ...args];
    const proc = child_process.spawn('npx', argv, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      timeout: MCPB_NPX_TIMEOUT_MS
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code, signal) => {
      if (signal === 'SIGTERM') reject(new Error('MCPB CLI timed out'));
      else resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Verifies the MCPB file signature using the official CLI.
 * @returns 'valid' if signed and valid, 'unsigned' if not signed (install allowed), or { error } if verification failed (e.g. invalid signature).
 */
async function runMcpbVerify(mcpbPath: string): Promise<'valid' | 'unsigned' | { error: string }> {
  try {
    const absPath = path.resolve(mcpbPath);
    const { exitCode, stderr } = await runNpxMcpb(['verify', absPath]);
    if (exitCode === 0) return 'valid';
    const errText = (stderr || '').toLowerCase();
    if (errText.includes('not signed') || errText.includes('extension is not signed')) return 'unsigned';
    return { error: stderr.trim() || 'Verification failed' };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Unpacks an MCPB file to the given directory using the official CLI (handles signed bundles correctly).
 * @returns true if unpack succeeded, false otherwise.
 */
async function runMcpbUnpack(mcpbPath: string, outputDir: string): Promise<boolean> {
  try {
    const absPath = path.resolve(mcpbPath);
    const absOut = path.resolve(outputDir);
    const { exitCode } = await runNpxMcpb(['unpack', absPath, absOut]);
    return exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Extracts a ZIP file to a destination directory using the system command (unzip on macOS/Linux, PowerShell on Windows).
 * Avoids bundling an external dependency so the extension works when installed from VSIX.
 */
function extractZipToDir(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const zipAbs = path.resolve(zipPath);
    const destAbs = path.resolve(destDir);
    if (process.platform === 'win32') {
      child_process.exec(
        `powershell -NoProfile -Command "Expand-Archive -Path '${zipAbs.replace(/'/g, "''")}' -DestinationPath '${destAbs.replace(/'/g, "''")}' -Force"`,
        { maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr || err.message || 'Expand-Archive failed'));
          } else {
            resolve();
          }
        }
      );
    } else {
      child_process.exec(
        `unzip -o -q "${zipAbs.replace(/"/g, '\\"')}" -d "${destAbs.replace(/"/g, '\\"')}"`,
        { maxBuffer: 10 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            reject(new Error(stderr || err.message || 'unzip failed'));
          } else {
            resolve();
          }
        }
      );
    }
  });
}

/** Platform override key for current OS (darwin | win32 | linux). */
function getCurrentPlatform(): 'darwin' | 'win32' | 'linux' {
  const p = process.platform;
  if (p === 'darwin' || p === 'win32' || p === 'linux') {
    return p;
  }
  return 'linux';
}

/** MCP config from manifest (command, args, env, platform_overrides). */
export interface McpConfigManifest {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  platform_overrides?: Record<string, { command?: string; args?: string[]; env?: Record<string, string> }>;
}

/** Server section from MCPB manifest (all versions 0.1-0.4). */
export interface McpbServer {
  type: 'python' | 'node' | 'binary' | 'uv';
  entry_point: string;
  mcp_config: McpConfigManifest;
}

/** MCPB manifest (compatible with versions 0.1-0.4). */
export interface McpbManifest {
  manifest_version?: string;
  name: string;
  display_name?: string;
  version?: string;
  description?: string;
  author?: { name: string; email?: string; url?: string };
  server: McpbServer;
}

/** Cursor mcp.json root structure. */
export interface CursorMcpJson {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
}

/**
 * Returns the root directory where MCPB packages are installed (~/.mcpb).
 */
export function getMcpbRoot(): string {
  return path.join(getUserHomePath(), '.mcpb');
}

/**
 * Returns the path to Cursor's global MCP config file (~/.cursor/mcp.json).
 */
export function getCursorMcpJsonPath(): string {
  return path.join(getUserHomePath(), '.cursor', 'mcp.json');
}

/**
 * Resolves the workspace folder that should receive a project MCP config.
 * - If there is no workspace open, returns null.
 * - If multiple workspace folders are open, prompts the user to pick one.
 */
async function pickWorkspaceFolderForMcpConfig(): Promise<vscode.WorkspaceFolder | null> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return null;
  if (folders.length === 1) return folders[0];

  const picked = await vscode.window.showQuickPick(
    folders.map((f) => ({
      label: f.name,
      description: f.uri.fsPath,
      folder: f
    })),
    { title: 'Select Workspace Folder', placeHolder: 'Choose where to write .cursor/mcp.json' }
  );
  return picked?.folder ?? null;
}

/**
 * Returns the path to the workspace MCP config file ({workspace}/.cursor/mcp.json).
 * Prompts for workspace folder if multi-root.
 */
async function getWorkspaceCursorMcpJsonPath(): Promise<string | null> {
  const folder = await pickWorkspaceFolderForMcpConfig();
  if (!folder) return null;
  return path.join(folder.uri.fsPath, '.cursor', 'mcp.json');
}

/**
 * Sanitizes a string for use as MCP server ID (JSON key): only letters, numbers, hyphens, underscores.
 */
function sanitizeServerId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '') || 'mcp-server';
}

/**
 * Replaces ${__dirname} and ${__dirname}/ in a string with the given absolute path.
 */
function resolveDirnamePlaceholder(value: string, packageDir: string): string {
  const normalizedDir = packageDir.replace(/\\/g, '/');
  return value
    .replace(/\$\{__dirname\}\//g, normalizedDir + '/')
    .replace(/\$\{__dirname\}/g, normalizedDir);
}

/**
 * Applies platform_overrides for the current platform and resolves ${__dirname} in args and env.
 */
function buildCursorServerConfig(
  mcpConfig: McpConfigManifest,
  packageDir: string
): { command: string; args?: string[]; env?: Record<string, string> } {
  const platform = getCurrentPlatform();
  let command = mcpConfig.command;
  let args = mcpConfig.args ? [...mcpConfig.args] : undefined;
  let env = mcpConfig.env ? { ...mcpConfig.env } : undefined;

  const overrides = mcpConfig.platform_overrides?.[platform];
  if (overrides) {
    if (overrides.command !== undefined) command = overrides.command;
    if (overrides.args !== undefined) args = overrides.args;
    if (overrides.env !== undefined) env = { ...env, ...overrides.env };
  }

  if (args && args.length > 0) {
    args = args.map((arg) => resolveDirnamePlaceholder(arg, packageDir));
  }
  if (env) {
    const resolvedEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      resolvedEnv[k] = resolveDirnamePlaceholder(v, packageDir);
    }
    env = resolvedEnv;
  }

  const result: { command: string; args?: string[]; env?: Record<string, string> } = { command };
  if (args && args.length > 0) result.args = args;
  if (env && Object.keys(env).length > 0) result.env = env;
  return result;
}

/**
 * Validates that the manifest has required fields for installation.
 */
function validateManifest(manifest: unknown): manifest is McpbManifest {
  if (!manifest || typeof manifest !== 'object') return false;
  const m = manifest as Record<string, unknown>;
  if (typeof m.name !== 'string' || !m.name.trim()) return false;
  if (!m.server || typeof m.server !== 'object') return false;
  const server = m.server as Record<string, unknown>;
  if (!server.mcp_config || typeof server.mcp_config !== 'object') return false;
  const mc = server.mcp_config as Record<string, unknown>;
  if (typeof mc.command !== 'string' || !mc.command.trim()) return false;
  return true;
}

/**
 * Installs an MCPB package: extracts to ~/.mcpb/<name>/, reads manifest, and adds the server to ~/.cursor/mcp.json.
 * @param mcpbFilePath Optional path to .mcpb file; if not provided, opens a file picker.
 * @returns true on success, false on cancel or error (errors are shown to the user).
 */
export async function installMcpbPackage(mcpbFilePath?: string): Promise<boolean> {
  let filePath = mcpbFilePath;
  if (!filePath) {
    const selected = await vscode.window.showOpenDialog({
      title: 'Select MCPB Package',
      filters: { 'MCPB Package': ['mcpb'] },
      canSelectMany: false
    });
    if (!selected || selected.length === 0) return false;
    filePath = selected[0].fsPath;
  }

  if (!filePath.toLowerCase().endsWith('.mcpb')) {
    vscode.window.showErrorMessage('Selected file is not an .mcpb package.');
    return false;
  }

  const zipPath = path.resolve(filePath);
  if (!fs.existsSync(zipPath)) {
    vscode.window.showErrorMessage('MCPB file not found.');
    return false;
  }

  const mcpbRoot = getMcpbRoot();
  if (!fs.existsSync(mcpbRoot)) {
    fs.mkdirSync(mcpbRoot, { recursive: true });
  }

  const useOfficialCli = vscode.workspace.getConfiguration('cursorToys').get<boolean>('mcpb.useOfficialCli', true);

  if (useOfficialCli) {
    const verifyResult = await runMcpbVerify(zipPath);
    if (verifyResult !== 'valid' && verifyResult !== 'unsigned') {
      vscode.window.showErrorMessage(`MCPB signature verification failed: ${verifyResult.error}`);
      return false;
    }
  }

  const tempDir = path.join(mcpbRoot, `.tmp-${Date.now()}-${process.pid}`);
  let extracted = false;
  if (useOfficialCli) {
    extracted = await runMcpbUnpack(zipPath, tempDir);
  }
  if (!extracted) {
    try {
      await extractZipToDir(zipPath, tempDir);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to extract MCPB package: ${msg}`);
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      return false;
    }
  }

  const manifestPath = path.join(tempDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    vscode.window.showErrorMessage('MCPB package does not contain a manifest.json in the root.');
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    return false;
  }

  let manifestJson: string;
  try {
    manifestJson = fs.readFileSync(manifestPath, 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to read manifest.json: ${msg}`);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    return false;
  }

  let manifest: McpbManifest;
  try {
    const parsed = JSON.parse(manifestJson) as unknown;
    if (!validateManifest(parsed)) {
      vscode.window.showErrorMessage(
        'Invalid manifest: missing required fields (name, server, server.mcp_config.command).'
      );
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      return false;
    }
    manifest = parsed;
  } catch {
    vscode.window.showErrorMessage('manifest.json is not valid JSON.');
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    return false;
  }

  const serverId = sanitizeServerId(manifest.name);
  const packageDir = path.join(mcpbRoot, serverId);

  if (fs.existsSync(packageDir)) {
    const overwrite = await vscode.window.showWarningMessage(
      `Package "${manifest.name}" is already installed at ${packageDir}. Overwrite?`,
      'Overwrite',
      'Cancel'
    );
    if (overwrite !== 'Overwrite') {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      return false;
    }
    try {
      fs.rmSync(packageDir, { recursive: true, force: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Failed to remove existing package: ${msg}`);
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
      return false;
    }
  }

  try {
    fs.renameSync(tempDir, packageDir);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to finalize package directory: ${msg}`);
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore
    }
    return false;
  }

  const serverConfig = buildCursorServerConfig(manifest.server.mcp_config, packageDir);

  const previewData = {
    name: manifest.name,
    display_name: manifest.display_name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    serverId,
    serverType: manifest.server.type,
    serverConfig
  };

  const { showMcpbInstallPreview } = await import('./mcpbPreviewPanel');
  const result = await showMcpbInstallPreview(previewData);
  if (!result.confirmed) {
    try {
      fs.rmSync(packageDir, { recursive: true, force: true });
    } catch {
      // Ignore rollback errors
    }
    return false;
  }

  const finalServerConfig = result.serverConfig;

  const installTargetLabel = result.installTarget === 'workspace' ? 'workspace' : 'global';
  const mcpJsonPath =
    result.installTarget === 'workspace' ? await getWorkspaceCursorMcpJsonPath() : getCursorMcpJsonPath();
  if (!mcpJsonPath) {
    vscode.window.showErrorMessage('No workspace folder is open. Open a folder/workspace to install MCP config in the workspace.');
    return false;
  }
  const cursorDir = path.dirname(mcpJsonPath);

  let mcpData: CursorMcpJson;
  if (fs.existsSync(mcpJsonPath)) {
    try {
      const raw = fs.readFileSync(mcpJsonPath, 'utf8');
      mcpData = JSON.parse(raw) as CursorMcpJson;
      if (!mcpData || typeof mcpData !== 'object') mcpData = { mcpServers: {} };
      if (!mcpData.mcpServers || typeof mcpData.mcpServers !== 'object') mcpData.mcpServers = {};
    } catch {
      vscode.window.showErrorMessage('Existing mcp.json is invalid. Backup the file and try again.');
      return false;
    }
  } else {
    mcpData = { mcpServers: {} };
  }

  const wasExisting = serverId in (mcpData.mcpServers ?? {});
  mcpData.mcpServers![serverId] = finalServerConfig;

  try {
    if (!fs.existsSync(cursorDir)) {
      fs.mkdirSync(cursorDir, { recursive: true });
    }
    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpData, null, 2), 'utf8');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to write Cursor MCP config: ${msg}`);
    return false;
  }

  const action = wasExisting ? 'updated' : 'added';
  vscode.window.showInformationMessage(
    `MCP server "${manifest.name}" ${action} in ${installTargetLabel} MCP config (${mcpJsonPath}). You may need to restart Cursor for the server to load.`
  );
  return true;
}

/**
 * Uninstalls an MCPB package: removes the folder from ~/.mcpb and the entry from ~/.cursor/mcp.json.
 * @param serverId The server ID (folder name under ~/.mcpb, same key as in mcpServers).
 * @returns true on success, false on error (errors are shown to the user).
 */
export async function uninstallMcpbPackage(serverId: string): Promise<boolean> {
  const mcpbRoot = getMcpbRoot();
  const packageDir = path.join(mcpbRoot, serverId);

  if (!fs.existsSync(packageDir)) {
    vscode.window.showErrorMessage(`MCPB package "${serverId}" not found.`);
    return false;
  }

  try {
    fs.rmSync(packageDir, { recursive: true, force: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to remove package folder: ${msg}`);
    return false;
  }

  const mcpJsonPath = getCursorMcpJsonPath();
  if (!fs.existsSync(mcpJsonPath)) {
    vscode.window.showInformationMessage(`MCPB package "${serverId}" removed.`);
    return true;
  }

  try {
    const raw = fs.readFileSync(mcpJsonPath, 'utf8');
    const mcpData = JSON.parse(raw) as CursorMcpJson;
    if (mcpData.mcpServers && serverId in mcpData.mcpServers) {
      delete mcpData.mcpServers[serverId];
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpData, null, 2), 'utf8');
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Failed to update Cursor MCP config: ${msg}`);
    return false;
  }

  vscode.window.showInformationMessage(
    `MCPB package "${serverId}" uninstalled. You may need to restart Cursor for the change to take effect.`
  );
  return true;
}
