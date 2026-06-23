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

let currentProvider: CursorPetViewProvider | undefined;

/**
 * Focuses the Cursor Pet activity bar view.
 */
export async function focusCursorPetView(): Promise<void> {
  if (!(await ensureCursorPetEnabled())) {
    return;
  }
  await vscode.commands.executeCommand('workbench.view.extension.cursor-pet');
  currentProvider?.postState();
}

/**
 * Refreshes the sidebar webview when visible.
 */
export function refreshCursorPetViewIfVisible(): void {
  currentProvider?.postState();
}

/**
 * Sidebar webview for Cursor Pet (activity bar), similar to vscode-pets explorer panel.
 */
export class CursorPetViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private htmlLoaded = false;
  private readonly viewDisposables: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    currentProvider = this;
    const service = CursorPetService.getInstance();
    if (service) {
      context.subscriptions.push(service.onDidChange(() => this.postState()));
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    while (this.viewDisposables.length) {
      this.viewDisposables.pop()?.dispose();
    }

    this.view = webviewView;
    const extensionUri = getExtensionUri();
    if (extensionUri) {
      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media', 'ui'),
          vscode.Uri.joinPath(extensionUri, 'media', 'cursor-pet'),
        ],
      };
    } else {
      webviewView.webview.options = { enableScripts: true };
    }

    this.htmlLoaded = false;
    this.postState();

    this.viewDisposables.push(
      webviewView.webview.onDidReceiveMessage((msg: CursorPetInboundMessage) =>
        void this.onMessage(msg)
      ),
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this.postState();
        }
      })
    );
  }

  postState(): void {
    if (!this.view) {
      return;
    }
    const service = CursorPetService.getInstance();
    const extensionUri = getExtensionUri();
    if (!service || !extensionUri) {
      return;
    }

    const state = buildCursorPetWebviewState(service, 'sidebar');
    if (!this.htmlLoaded) {
      this.view.webview.html = buildCursorPetPanelHtml(state, {
        webview: this.view.webview,
        extensionUri,
      });
      this.htmlLoaded = true;
      return;
    }
    if (this.view.visible) {
      void this.view.webview.postMessage({ type: 'state', state });
    }
  }

  private async onMessage(msg: CursorPetInboundMessage): Promise<void> {
    const service = CursorPetService.getInstance();
    if (!service) {
      return;
    }
    await handleCursorPetWebviewMessage(msg, service, () => this.postState());
  }
}

/**
 * Registers the Cursor Pet activity bar webview and focus command.
 */
export function registerCursorPetView(context: vscode.ExtensionContext): void {
  const provider = new CursorPetViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cursor-toys.cursorPetView', provider),
    vscode.commands.registerCommand('cursor-toys.cursorPet.focusView', () => {
      void focusCursorPetView();
    }),
    vscode.commands.registerCommand('cursor-toys.cursorPet.refresh', () => {
      provider.postState();
      refreshCursorPetViewIfVisible();
    })
  );
}
