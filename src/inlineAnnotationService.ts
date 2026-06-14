import * as path from 'path';
import * as vscode from 'vscode';
import { InlineAnnotationIndex } from './inlineAnnotationIndex';
import {
  getInlineAnnotationsSettings,
  isInlineAnnotationsEnabled,
} from './inlineAnnotationsConfig';
import {
  scanFileAtPath,
  scanWorkspaceFolder,
} from './inlineAnnotationScanner';
import { InlineAnnotationMarker } from './inlineAnnotationStore';
import { parseInlineAnnotations } from './inlineAnnotationParser';

/**
 * Coordinates workspace scanning, incremental updates, and the annotation index.
 */
export class InlineAnnotationService {
  readonly index = new InlineAnnotationIndex();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private static instance: InlineAnnotationService | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    InlineAnnotationService.instance = this;
  }

  /**
   * Returns the active service instance registered during extension activation.
   */
  static getInstance(): InlineAnnotationService | undefined {
    return InlineAnnotationService.instance;
  }

  /**
   * Registers workspace listeners and performs the initial scan.
   */
  activate(): void {
    void this.rescanWorkspace().then(() => this.refreshOpenDocuments());

    this.context.subscriptions.push(
      this.index.onDidChange(() => {
        // Reserved for future telemetry hooks.
      })
    );

    this.context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        if (!isInlineAnnotationsEnabled()) {
          return;
        }
        void this.updateDocument(document);
      })
    );

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        const settings = getInlineAnnotationsSettings();
        if (!settings.enabled || !settings.updateOnType) {
          return;
        }

        const filePath = event.document.uri.fsPath;
        const existing = this.debounceTimers.get(filePath);
        if (existing) {
          clearTimeout(existing);
        }

        const timer = setTimeout(() => {
          this.debounceTimers.delete(filePath);
          void this.updateDocument(event.document);
        }, settings.updateDebounceMs);

        this.debounceTimers.set(filePath, timer);
      })
    );

    this.context.subscriptions.push(
      vscode.workspace.onDidDeleteFiles((event) => {
        for (const uri of event.files) {
          this.index.removeFile(uri.fsPath);
        }
      })
    );
  }

  /**
   * Performs a full workspace rescan.
   */
  async rescanWorkspace(): Promise<void> {
    if (!isInlineAnnotationsEnabled()) {
      this.index.clear();
      return;
    }

    const settings = getInlineAnnotationsSettings();
    const scanOptions = {
      tags: settings.tags,
      fileExtensions: settings.fileExtensions,
      scanIncludePaths: settings.scanIncludePaths,
    };

    const allMarkers: InlineAnnotationMarker[] = [];
    const folders = vscode.workspace.workspaceFolders ?? [];

    for (const folder of folders) {
      allMarkers.push(...scanWorkspaceFolder(folder.uri.fsPath, scanOptions));
    }

    this.index.replaceAll(allMarkers);
    this.refreshOpenDocuments();
  }

  /**
   * Re-parses all open file documents so unsaved buffers stay indexed.
   */
  refreshOpenDocuments(): void {
    if (!isInlineAnnotationsEnabled()) {
      return;
    }

    for (const document of vscode.workspace.textDocuments) {
      if (document.uri.scheme === 'file') {
        void this.updateDocument(document);
      }
    }
  }

  /**
   * Re-parses a single open document and updates the index.
   */
  async updateDocument(document: vscode.TextDocument): Promise<void> {
    if (!isInlineAnnotationsEnabled()) {
      return;
    }

    if (document.uri.scheme !== 'file') {
      return;
    }

    const settings = getInlineAnnotationsSettings();
    const ext = path.extname(document.uri.fsPath).replace(/^\./, '').toLowerCase();
    if (!settings.fileExtensions.includes(ext)) {
      this.index.removeFile(document.uri.fsPath);
      return;
    }

    const parsed = parseInlineAnnotations(document.getText(), settings.tags);
    const markers = parsed.map((item) => ({
      id: `${document.uri.fsPath}:${item.line}:${item.tag}`,
      tag: item.tag,
      filePath: document.uri.fsPath,
      line: item.line,
      column: item.column,
      preview: item.preview,
    }));

    this.index.replaceFileMarkers(document.uri.fsPath, markers);
  }

  /**
   * Re-parses a file from disk (used when refreshing a single path).
   */
  refreshFile(filePath: string): void {
    if (!isInlineAnnotationsEnabled()) {
      return;
    }

    const settings = getInlineAnnotationsSettings();
    const markers = scanFileAtPath(filePath, {
      tags: settings.tags,
      fileExtensions: settings.fileExtensions,
      scanIncludePaths: settings.scanIncludePaths,
    });
    this.index.replaceFileMarkers(filePath, markers);
  }

  /**
   * Clears pending debounce timers.
   */
  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
