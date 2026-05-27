import * as vscode from 'vscode';
import * as path from 'path';
import { getBaseFolderName, getHttpPath } from './utils';

export type HttpCliTestScope = 'file' | 'folder' | 'all';

export interface RunHttpCliTestsOptions {
  workspacePath: string;
  scope: HttpCliTestScope;
  /** Absolute path to a .req/.request file (scope `file`). */
  filePath?: string;
  /** Path relative to `.{baseFolder}/http/` (scope `folder`). */
  folderRelativePath?: string;
}

/**
 * Runs `npx cursortoys http test` in a terminal for a file, http subfolder, or entire http tree.
 */
export function runHttpCliTests(options: RunHttpCliTestsOptions): void {
  const { workspacePath, scope, filePath, folderRelativePath } = options;
  const baseFolder = getBaseFolderName();
  const args = [
    'npx cursortoys http test',
    `-p "${workspacePath}"`,
    `--base-folder "${baseFolder}"`,
  ];

  if (scope === 'file') {
    if (!filePath) {
      vscode.window.showErrorMessage('No HTTP request file selected');
      return;
    }
    args.push(`-f "${filePath}"`);
  } else if (scope === 'folder') {
    if (!folderRelativePath) {
      vscode.window.showErrorMessage('No HTTP folder selected');
      return;
    }
    args.push(`--folder "${folderRelativePath.replace(/\\/g, '/')}"`);
  }

  const terminal = vscode.window.createTerminal({
    name: 'CursorToys - HTTP Tests',
    cwd: workspacePath,
  });
  terminal.show();
  terminal.sendText(args.join(' '));
}

/**
 * Resolves workspace root and validates the http directory exists.
 */
export function getHttpTestWorkspaceContext(): {
  workspacePath: string;
  httpPath: string;
} | null {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open');
    return null;
  }

  const workspacePath = workspaceFolder.uri.fsPath;
  const httpPath = getHttpPath(workspacePath);
  return { workspacePath, httpPath };
}

/**
 * Normalizes a folder path relative to the workspace http root.
 */
export function toHttpFolderRelativePath(httpPath: string, targetPath: string): string | null {
  const normalizedHttp = httpPath.replace(/\\/g, '/');
  const normalizedTarget = path.resolve(targetPath).replace(/\\/g, '/');
  if (!normalizedTarget.startsWith(normalizedHttp)) {
    return null;
  }
  const relative = path.relative(httpPath, targetPath).replace(/\\/g, '/');
  return relative === '.' ? '' : relative;
}
