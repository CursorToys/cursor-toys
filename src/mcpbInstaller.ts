import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { getUserHomePath } from './utils';

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

  const tempDir = path.join(mcpbRoot, `.tmp-${Date.now()}-${process.pid}`);
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

  const mcpJsonPath = getCursorMcpJsonPath();
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
    `MCP server "${manifest.name}" ${action} in Cursor config. You may need to restart Cursor for the server to load.`
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
