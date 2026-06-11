import * as path from 'path';
import * as vscode from 'vscode';
import { CodeAnchorsManager } from '../../codeAnchorsManager';

function getManager(): CodeAnchorsManager {
  return CodeAnchorsManager.getInstance();
}

function resolveFileUri(filePath: string): vscode.Uri {
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspacePath) {
    throw new Error('No workspace folder open');
  }
  return vscode.Uri.file(path.join(workspacePath, filePath));
}

async function readSnippet(uri: vscode.Uri, line: number): Promise<string> {
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    const text = doc.lineAt(line).text;
    return text.trim();
  } catch {
    return '';
  }
}

export async function anchorList(): Promise<unknown> {
  const manager = getManager();
  const all = manager.getAllAnchors();
  const anchors: Record<string, number[]> = {};
  for (const [uri, lines] of all.entries()) {
    anchors[uri] = lines;
  }
  return { anchors };
}

export async function anchorListFile(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  const uri = resolveFileUri(filePath);
  const manager = getManager();
  return { filePath: uri.fsPath, lines: manager.getAnchors(uri) };
}

export async function anchorAdd(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  const line = args.line as number | undefined;
  if (!filePath || line === undefined) {
    throw new Error('filePath and line are required (0-based line index)');
  }
  const uri = resolveFileUri(filePath);
  const manager = getManager();
  if (!manager.hasAnchor(uri, line)) {
    manager.toggleAnchor(uri, line);
  }
  return { filePath: uri.fsPath, line, added: true };
}

export async function anchorRemove(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  const line = args.line as number | undefined;
  if (!filePath || line === undefined) {
    throw new Error('filePath and line are required');
  }
  const uri = resolveFileUri(filePath);
  const manager = getManager();
  if (manager.hasAnchor(uri, line)) {
    manager.toggleAnchor(uri, line);
  }
  return { filePath: uri.fsPath, line, removed: true };
}

export async function anchorToggle(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  const line = args.line as number | undefined;
  if (!filePath || line === undefined) {
    throw new Error('filePath and line are required');
  }
  const uri = resolveFileUri(filePath);
  const manager = getManager();
  const added = manager.toggleAnchor(uri, line);
  return { filePath: uri.fsPath, line, hasAnchor: added };
}

export async function anchorClear(): Promise<unknown> {
  getManager().clearAnchors();
  return { cleared: true };
}

export async function anchorClearFile(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  if (!filePath) {
    throw new Error('filePath is required');
  }
  const uri = resolveFileUri(filePath);
  getManager().clearFileAnchors(uri);
  return { filePath: uri.fsPath, cleared: true };
}

export async function anchorNext(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  const line = (args.line as number | undefined) ?? 0;
  const uri = filePath ? resolveFileUri(filePath) : vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    throw new Error('filePath required when no active editor');
  }
  const manager = getManager();
  const next =
    args.workspace === true
      ? manager.getNextAnchorInWorkspace(uri, line)
      : (() => {
          const n = manager.getNextAnchor(uri, line);
          return n !== undefined ? { uri, line: n } : undefined;
        })();
  if (!next) {
    return { found: false };
  }
  const snippet = await readSnippet(next.uri, next.line);
  return {
    found: true,
    filePath: next.uri.fsPath,
    line: next.line,
    snippet,
  };
}

export async function anchorPrev(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  const line = (args.line as number | undefined) ?? 0;
  const uri = filePath ? resolveFileUri(filePath) : vscode.window.activeTextEditor?.document.uri;
  if (!uri) {
    throw new Error('filePath required when no active editor');
  }
  const manager = getManager();
  const prev =
    args.workspace === true
      ? manager.getPrevAnchorInWorkspace(uri, line)
      : (() => {
          const p = manager.getPrevAnchor(uri, line);
          return p !== undefined ? { uri, line: p } : undefined;
        })();
  if (!prev) {
    return { found: false };
  }
  const snippet = await readSnippet(prev.uri, prev.line);
  return {
    found: true,
    filePath: prev.uri.fsPath,
    line: prev.line,
    snippet,
  };
}

export async function anchorGoto(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string | undefined;
  const line = args.line as number | undefined;
  if (!filePath || line === undefined) {
    throw new Error('filePath and line are required');
  }
  const uri = resolveFileUri(filePath);
  const snippet = await readSnippet(uri, line);
  if (args.openInEditor === true) {
    await getManager().goToAnchor(uri, line);
  }
  return { filePath: uri.fsPath, line, snippet };
}
