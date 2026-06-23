import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildInternalActivityEvent } from './cursorPetActivity';
import type { PetActivityEvent } from './types';

const POLL_MS = 60_000;

/**
 * Watches agent transcript files for lightweight play/chat activity signals.
 */
export class CursorPetTranscriptWatcher {
  private watcher: vscode.FileSystemWatcher | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private readonly emitter = new vscode.EventEmitter<PetActivityEvent>();
  readonly onActivity = this.emitter.event;

  start(): void {
    this.stop();
    const pattern = new vscode.RelativePattern(
      vscode.Uri.file(path.join(os.homedir(), '.cursor', 'projects')),
      '**/agent-transcripts/**/*.jsonl'
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const emit = () => {
      this.emitter.fire(
        buildInternalActivityEvent('agentTranscriptChange', 'explore', 0.5)
      );
    };
    this.watcher.onDidChange(emit);
    this.watcher.onDidCreate(emit);
    this.pollTimer = setInterval(() => {
      void this.pollLatestTranscript();
    }, POLL_MS);
  }

  stop(): void {
    this.watcher?.dispose();
    this.watcher = undefined;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async pollLatestTranscript(): Promise<void> {
    const root = path.join(os.homedir(), '.cursor', 'projects');
    let latestMtime = 0;
    try {
      latestMtime = await this.findLatestMtime(root);
    } catch {
      return;
    }
    if (latestMtime > 0) {
      this.emitter.fire(
        buildInternalActivityEvent('agentTranscriptPoll', 'chat', 0.25)
      );
    }
  }

  private async findLatestMtime(dir: string): Promise<number> {
    let latest = 0;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return 0;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        latest = Math.max(latest, await this.findLatestMtime(fullPath));
        if (entry.name === 'agent-transcripts') {
          latest = Math.max(latest, await this.maxFileMtime(fullPath));
        }
      }
    }
    return latest;
  }

  private async maxFileMtime(dir: string): Promise<number> {
    let latest = 0;
    let files: string[];
    try {
      files = await fs.promises.readdir(dir);
    } catch {
      return 0;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) {
        continue;
      }
      try {
        const stat = await fs.promises.stat(path.join(dir, file));
        latest = Math.max(latest, stat.mtimeMs);
      } catch {
        // ignore unreadable files
      }
    }
    return latest;
  }
}
