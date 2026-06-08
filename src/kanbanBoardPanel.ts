import * as vscode from 'vscode';
import { buildKanbanBoardHtml } from './kanbanBoardHtml';
import { buildKanbanBoardState, resolveKanbanBoardScopes } from './kanbanBoardModel';
import { KanbanBoardInboundMessage, KanbanBoardScope } from './kanbanBoardTypes';
import {
  createKanbanCardFile,
  formatKanbanCardShareText,
  loadKanbanCard,
  normalizeKanbanStatus,
  saveKanbanCard,
} from './kanbanCard';
import { injectTextToChat } from './chatInjection';
import { getExtensionDataFolderName, getBaseFolderName, getKanbanPath } from './utils';

const PANEL_VIEW_TYPE = 'cursorToysKanbanBoard';
const WATCHER_DEBOUNCE_MS = 350;

export class KanbanBoardPanel {
  private static currentPanel: KanbanBoardPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private watchers: vscode.FileSystemWatcher[] = [];
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private onFilesystemChange: (() => void) | undefined;
  private boardHtmlLoaded = false;
  private currentScope: KanbanBoardScope;

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly workspacePath: string | undefined,
    initialScope: KanbanBoardScope,
    onFilesystemChange?: () => void
  ) {
    this.panel = panel;
    this.currentScope = initialScope;
    this.onFilesystemChange = onFilesystemChange;
    this.panel.webview.options = { enableScripts: true };
    this.pushState();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: KanbanBoardInboundMessage) => void this.handleMessage(msg),
      null,
      this.disposables
    );

    this.setupWatchers();
  }

  public static async createOrShow(onFilesystemChange?: () => void): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspacePath = workspaceFolder?.uri.fsPath;
    const { availableScopes, defaultScope } = resolveKanbanBoardScopes(workspacePath);

    if (availableScopes.length === 0) {
      vscode.window.showErrorMessage(
        'No Kanban board found. Open a workspace or create personal cards under ~/.cursortoys/kanban/.'
      );
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
      workspacePath,
      defaultScope,
      onFilesystemChange
    );
  }

  private setupWatchers(): void {
    this.clearWatchers();
    const schedule = (): void => {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      this.refreshTimer = setTimeout(() => {
        void this.pushState();
        this.onFilesystemChange?.();
      }, WATCHER_DEBOUNCE_MS);
    };

    const addWatcher = (folderPath: string): void => {
      const folderUri = vscode.Uri.file(folderPath);
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folderUri, '**/*')
      );
      watcher.onDidCreate(schedule);
      watcher.onDidChange(schedule);
      watcher.onDidDelete(schedule);
      this.watchers.push(watcher);
      this.disposables.push(watcher);
    };

    const { availableScopes } = resolveKanbanBoardScopes(this.workspacePath);
    if (availableScopes.includes('personal')) {
      addWatcher(getKanbanPath(undefined, true));
    }
    if (this.workspacePath && availableScopes.includes('workspace')) {
      addWatcher(getKanbanPath(this.workspacePath, false));
      const extFolder = getExtensionDataFolderName();
      const baseFolder = getBaseFolderName();
      if (baseFolder !== extFolder) {
        const legacyPath = vscode.Uri.joinPath(
          vscode.Uri.file(this.workspacePath),
          `.${baseFolder}`,
          'kanban'
        ).fsPath;
        addWatcher(legacyPath);
      }
    }
  }

  private clearWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  private async pushState(): Promise<void> {
    const state = await buildKanbanBoardState(this.workspacePath, this.currentScope);
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
        case 'switchScope': {
          const { availableScopes } = resolveKanbanBoardScopes(this.workspacePath);
          if (!availableScopes.includes(msg.scope)) {
            return;
          }
          this.currentScope = msg.scope;
          await this.pushState();
          break;
        }
        case 'createCard': {
          const title = msg.title?.trim();
          if (!title) {
            return;
          }
          const isPersonal = this.currentScope === 'personal';
          const created = await createKanbanCardFile(
            this.workspacePath,
            title,
            'backlog',
            msg.description ?? '',
            isPersonal
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
    this.clearWatchers();
    KanbanBoardPanel.currentPanel = undefined;
    this.disposables.forEach((d) => d.dispose());
  }
}
