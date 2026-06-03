import * as vscode from 'vscode';
import { buildKanbanBoardHtml } from './kanbanBoardHtml';
import { buildKanbanBoardState } from './kanbanBoardModel';
import { KanbanBoardInboundMessage } from './kanbanBoardTypes';
import {
  createKanbanCardFile,
  formatKanbanCardShareText,
  loadKanbanCard,
  normalizeKanbanStatus,
  saveKanbanCard,
} from './kanbanCard';
import { injectTextToChat } from './chatInjection';
import { getBaseFolderName } from './utils';

const PANEL_VIEW_TYPE = 'cursorToysKanbanBoard';
const WATCHER_DEBOUNCE_MS = 350;

export class KanbanBoardPanel {
  private static currentPanel: KanbanBoardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private watcher: vscode.FileSystemWatcher | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private onFilesystemChange: (() => void) | undefined;
  private boardHtmlLoaded = false;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly workspacePath: string,
    onFilesystemChange?: () => void
  ) {
    this.panel = panel;
    this.onFilesystemChange = onFilesystemChange;
    this.panel.webview.options = { enableScripts: true };
    this.pushState();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: KanbanBoardInboundMessage) => void this.handleMessage(msg),
      null,
      this.disposables
    );

    this.setupWatcher();
  }

  public static async createOrShow(onFilesystemChange?: () => void): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace open. Kanban is workspace-specific.');
      return;
    }

    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (KanbanBoardPanel.currentPanel) {
      KanbanBoardPanel.currentPanel.panel.reveal(column);
      await KanbanBoardPanel.currentPanel.pushState();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      PANEL_VIEW_TYPE,
      'Kanban Board',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    KanbanBoardPanel.currentPanel = new KanbanBoardPanel(
      panel,
      workspaceFolder.uri.fsPath,
      onFilesystemChange
    );
  }

  private setupWatcher(): void {
    const pattern = new vscode.RelativePattern(
      vscode.workspace.workspaceFolders![0],
      `.${getBaseFolderName()}/kanban/**`
    );
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const schedule = (): void => {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      this.refreshTimer = setTimeout(() => {
        void this.pushState();
        this.onFilesystemChange?.();
      }, WATCHER_DEBOUNCE_MS);
    };
    this.watcher.onDidCreate(schedule);
    this.watcher.onDidChange(schedule);
    this.watcher.onDidDelete(schedule);
    this.disposables.push(this.watcher);
  }

  private async pushState(): Promise<void> {
    const state = await buildKanbanBoardState(this.workspacePath);
    if (!state) {
      this.panel.webview.postMessage({ type: 'error', message: 'Could not load Kanban board.' });
      return;
    }
    if (this.boardHtmlLoaded) {
      this.panel.webview.postMessage({ type: 'init', state });
      return;
    }
    this.panel.webview.html = buildKanbanBoardHtml(state);
    this.boardHtmlLoaded = true;
  }

  private async handleMessage(msg: KanbanBoardInboundMessage): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          await this.pushState();
          break;
        case 'createCard': {
          const title = msg.title?.trim();
          if (!title) {
            return;
          }
          const created = await createKanbanCardFile(
            this.workspacePath,
            title,
            'backlog',
            msg.description ?? ''
          );
          if (created) {
            vscode.window.showInformationMessage('Kanban card created.');
            this.onFilesystemChange?.();
            await this.pushState();
          }
          break;
        }
        case 'moveCard':
        case 'moveCardMenu': {
          const card = await loadKanbanCard(msg.filePath);
          if (!card) {
            return;
          }
          card.status = normalizeKanbanStatus(msg.status);
          card.metadata.status = card.status;
          await saveKanbanCard(card);
          this.onFilesystemChange?.();
          await this.pushState();
          break;
        }
        case 'updateCard': {
          const card = await loadKanbanCard(msg.filePath);
          if (!card) {
            return;
          }
          const title = msg.title?.trim();
          if (!title) {
            vscode.window.showErrorMessage('Card title cannot be empty.');
            return;
          }
          card.title = title;
          card.description = msg.description ?? '';
          card.tags = Array.isArray(msg.tags)
            ? msg.tags
                .map((t) => ({
                  name: String(t.name ?? '').trim(),
                  color: t.color,
                }))
                .filter((t) => t.name.length > 0)
            : card.tags;
          await saveKanbanCard(card);
          this.onFilesystemChange?.();
          await this.pushState();
          break;
        }
        case 'deleteCard': {
          if (!msg.filePath) {
            vscode.window.showErrorMessage('Could not delete card: missing file path.');
            return;
          }
          await vscode.workspace.fs.delete(vscode.Uri.file(msg.filePath));
          vscode.window.showInformationMessage('Kanban card deleted.');
          this.onFilesystemChange?.();
          await this.pushState();
          break;
        }
        case 'openCard': {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(msg.filePath));
          await vscode.window.showTextDocument(doc, { preview: false });
          break;
        }
        case 'copyCardContent': {
          const card = await loadKanbanCard(msg.filePath);
          if (!card) {
            vscode.window.showErrorMessage('Could not load Kanban card.');
            return;
          }
          const text = formatKanbanCardShareText(card);
          await vscode.env.clipboard.writeText(text);
          vscode.window.showInformationMessage('Kanban card content copied.');
          break;
        }
        case 'sendCardToChat': {
          const card = await loadKanbanCard(msg.filePath);
          if (!card) {
            vscode.window.showErrorMessage('Could not load Kanban card.');
            return;
          }
          const text = formatKanbanCardShareText(card);
          const result = await injectTextToChat(text, { submit: false });
          if (result.pasted) {
            vscode.window.showInformationMessage('Kanban card pasted in chat.');
          } else {
            vscode.window.showErrorMessage('Could not paste Kanban card in chat.');
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Kanban board error: ${message}`);
      this.panel.webview.postMessage({ type: 'error', message });
    }
  }

  private dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    KanbanBoardPanel.currentPanel = undefined;
    this.disposables.forEach((d) => d.dispose());
  }
}
