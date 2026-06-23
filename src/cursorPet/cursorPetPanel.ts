import * as vscode from 'vscode';
import { getExtensionUri } from '../webviewUi';
import { buildCursorPetPanelHtml } from './cursorPetPanelHtml';
import { CursorPetService } from './cursorPetService';
import {
  buildCursorPetWebviewState,
  ensureCursorPetEnabled,
  handleCursorPetWebviewMessage,
  type CursorPetInboundMessage,
} from './cursorPetWebviewHost';

export class CursorPetPanel {
  private static currentPanel: CursorPetPanel | undefined;

  private readonly disposables: vscode.Disposable[] = [];

  private constructor(private readonly panel: vscode.WebviewPanel) {
    this.panel.webview.options = { enableScripts: true };
    const extensionUri = getExtensionUri();
    if (extensionUri) {
      this.panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media', 'ui'),
          vscode.Uri.joinPath(extensionUri, 'media', 'cursor-pet'),
        ],
      };
    }
    this.pushState();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (msg: CursorPetInboundMessage) => void this.handleMessage(msg),
      null,
      this.disposables
    );

    const service = CursorPetService.getInstance();
    if (service) {
      this.disposables.push(service.onDidChange(() => this.pushState()));
    }
  }

  static async createOrShow(): Promise<void> {
    if (!(await ensureCursorPetEnabled())) {
      return;
    }

    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    if (CursorPetPanel.currentPanel) {
      CursorPetPanel.currentPanel.panel.reveal(column);
      CursorPetPanel.currentPanel.pushState();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'cursorToysCursorPet',
      'Cursor Pet',
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    CursorPetPanel.currentPanel = new CursorPetPanel(panel);
  }

  static refreshIfOpen(): void {
    CursorPetPanel.currentPanel?.pushState();
  }

  private htmlLoaded = false;

  private pushState(): void {
    const service = CursorPetService.getInstance();
    if (!service) {
      return;
    }
    const extensionUri = getExtensionUri();
    if (!extensionUri) {
      return;
    }
    const state = buildCursorPetWebviewState(service, 'panel');
    if (!this.htmlLoaded) {
      this.panel.webview.html = buildCursorPetPanelHtml(state, {
        webview: this.panel.webview,
        extensionUri,
      });
      this.htmlLoaded = true;
    } else {
      this.panel.webview.postMessage({ type: 'state', state });
    }
  }

  private async handleMessage(msg: CursorPetInboundMessage): Promise<void> {
    const service = CursorPetService.getInstance();
    if (!service) {
      return;
    }
    await handleCursorPetWebviewMessage(msg, service, () => this.pushState());
  }

  private dispose(): void {
    CursorPetPanel.currentPanel = undefined;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

export type { CursorPetInboundMessage };
