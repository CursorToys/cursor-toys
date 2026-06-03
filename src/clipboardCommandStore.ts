import * as path from 'path';
import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { sanitizeFileName, getClipboardCommandsDir, getPersonalClipboardPaths } from './utils';
import {
  ClipboardCommandEntry,
  ClipboardCommandFile,
  ClipboardCommandScope,
} from './clipboardCommandTypes';

/**
 * Loads and mutates saved terminal/command clipboard entries on disk.
 */
export class ClipboardCommandStore {
  /**
   * Lists all command entries for the given scope (and optional workspace root).
   */
  async list(scope: ClipboardCommandScope, workspacePath?: string): Promise<ClipboardCommandEntry[]> {
    const dirs = this.getDirsForScope(scope, workspacePath);
    const entries: ClipboardCommandEntry[] = [];
    for (const dir of dirs) {
      const found = await this.readDirRecursive(dir, scope);
      entries.push(...found);
    }
    return this.sortEntries(entries);
  }

  /**
   * Saves a new command entry; returns the created entry.
   */
  async save(
    label: string,
    text: string,
    scope: ClipboardCommandScope,
    options?: { folder?: string; pinned?: boolean; workspacePath?: string }
  ): Promise<ClipboardCommandEntry> {
    const trimmedLabel = label.trim() || 'Command';
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Command text cannot be empty.');
    }
    const entry: ClipboardCommandEntry = {
      id: randomUUID(),
      label: trimmedLabel,
      text: trimmedText,
      scope,
      pinned: options?.pinned ?? false,
      folder: options?.folder?.trim() || undefined,
      createdAt: new Date().toISOString(),
    };
    const dir = getClipboardCommandsDir(scope, options?.workspacePath);
    await this.ensureDir(dir);
    const subDir = entry.folder ? path.join(dir, sanitizeFileName(entry.folder)) : dir;
    await this.ensureDir(subDir);
    const fileName = `${sanitizeFileName(trimmedLabel)}-${entry.id.slice(0, 8)}.json`;
    const filePath = path.join(subDir, fileName);
    await this.writeEntry(filePath, entry);
    return entry;
  }

  async delete(entry: ClipboardCommandEntry, workspacePath?: string): Promise<void> {
    const filePath = await this.findFilePath(entry, workspacePath);
    if (filePath) {
      await vscode.workspace.fs.delete(vscode.Uri.file(filePath));
    }
  }

  async duplicate(
    entry: ClipboardCommandEntry,
    workspacePath?: string
  ): Promise<ClipboardCommandEntry> {
    return this.save(`${entry.label} (copy)`, entry.text, entry.scope, {
      folder: entry.folder,
      pinned: entry.pinned,
      workspacePath,
    });
  }

  async setPinned(
    entry: ClipboardCommandEntry,
    pinned: boolean,
    workspacePath?: string
  ): Promise<ClipboardCommandEntry> {
    const updated = { ...entry, pinned };
    const filePath = await this.findFilePath(entry, workspacePath);
    if (filePath) {
      await this.writeEntry(filePath, updated);
    }
    return updated;
  }

  async rename(
    entry: ClipboardCommandEntry,
    newLabel: string,
    workspacePath?: string
  ): Promise<ClipboardCommandEntry> {
    const oldPath = await this.findFilePath(entry, workspacePath);
    const updated = { ...entry, label: newLabel.trim() || entry.label };
    if (!oldPath) {
      return updated;
    }
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, `${sanitizeFileName(updated.label)}-${entry.id.slice(0, 8)}.json`);
    await this.writeEntry(newPath, updated);
    if (newPath !== oldPath) {
      await vscode.workspace.fs.delete(vscode.Uri.file(oldPath));
    }
    return updated;
  }

  private getDirsForScope(scope: ClipboardCommandScope, workspacePath?: string): string[] {
    if (scope === 'global') {
      return getPersonalClipboardPaths().map((p) => path.join(p, 'commands'));
    }
    const dir = getClipboardCommandsDir(scope, workspacePath);
    return [dir];
  }

  private sortEntries(entries: ClipboardCommandEntry[]): ClipboardCommandEntry[] {
    return [...entries].sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));
    } catch {
      // exists
    }
  }

  private async writeEntry(filePath: string, entry: ClipboardCommandEntry): Promise<void> {
    const payload: ClipboardCommandFile = { version: 1, entry };
    const content = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(vscode.Uri.file(filePath), content);
  }

  private async readDirRecursive(
    dirPath: string,
    scope: ClipboardCommandScope
  ): Promise<ClipboardCommandEntry[]> {
    const entries: ClipboardCommandEntry[] = [];
    const uri = vscode.Uri.file(dirPath);
    try {
      const items = await vscode.workspace.fs.readDirectory(uri);
      for (const [name, type] of items) {
        const fullPath = path.join(dirPath, name);
        if (type === vscode.FileType.Directory) {
          entries.push(...(await this.readDirRecursive(fullPath, scope)));
        } else if (name.endsWith('.json')) {
          const parsed = await this.readEntryFile(fullPath, scope);
          if (parsed) {
            entries.push(parsed);
          }
        }
      }
    } catch {
      // missing dir
    }
    return entries;
  }

  private async readEntryFile(
    filePath: string,
    scope: ClipboardCommandScope
  ): Promise<ClipboardCommandEntry | null> {
    try {
      const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      const data = JSON.parse(Buffer.from(raw).toString('utf8')) as ClipboardCommandFile;
      if (!data?.entry?.id || !data.entry.text) {
        return null;
      }
      return { ...data.entry, scope };
    } catch {
      return null;
    }
  }

  private async findFilePath(
    entry: ClipboardCommandEntry,
    workspacePath?: string
  ): Promise<string | null> {
    const dirs = this.getDirsForScope(entry.scope, workspacePath);
    for (const dir of dirs) {
      const found = await this.findInDir(dir, entry.id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  private async findInDir(dirPath: string, id: string): Promise<string | null> {
    const uri = vscode.Uri.file(dirPath);
    try {
      const items = await vscode.workspace.fs.readDirectory(uri);
      for (const [name, type] of items) {
        const fullPath = path.join(dirPath, name);
        if (type === vscode.FileType.Directory) {
          const nested = await this.findInDir(fullPath, id);
          if (nested) {
            return nested;
          }
        } else if (name.endsWith('.json') && name.includes(id.slice(0, 8))) {
          const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(fullPath));
          const data = JSON.parse(Buffer.from(raw).toString('utf8')) as ClipboardCommandFile;
          if (data?.entry?.id === id) {
            return fullPath;
          }
        }
      }
    } catch {
      // ignore
    }
    return null;
  }
}
