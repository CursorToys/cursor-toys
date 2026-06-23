import * as vscode from 'vscode';
import { generateWebviewNonce, getControlResourceRoots } from '../webviewUi';
import { refreshSpending } from '../spendingStatusBar';
import { refreshUsageMonitorStatusBar } from '../providerUsage/usageMonitorStatusBar';
import { isHttpRequestFile } from '../utils';
import { buildControlModel } from './controlModel';
import { saveControlPanelOrderScope } from './controlPanelOrder';

const CURSOR_DASHBOARD_URL = 'https://cursor.com/dashboard?tab=spending';

let currentProvider: ControlViewProvider | undefined;

/**
 * Focuses the CursorToys Control sidebar view.
 */
export async function focusControlView(): Promise<void> {
  await vscode.commands.executeCommand('cursor-toys.controlView.focus');
}

/**
 * Registers the CursorToys Control webview and related commands.
 */
export function registerControlView(context: vscode.ExtensionContext): void {
  const provider = new ControlViewProvider(context);
  currentProvider = provider;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('cursor-toys.controlView', provider),
    vscode.commands.registerCommand('cursor-toys.control.refresh', () => provider.post()),
    vscode.commands.registerCommand('cursor-toys.control.openCursorDashboard', () => {
      void vscode.env.openExternal(vscode.Uri.parse(CURSOR_DASHBOARD_URL));
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.post()),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cursorToys')) {
        provider.post();
      }
    })
  );
}

export function refreshControlViewIfVisible(): void {
  currentProvider?.post();
}

class ControlViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly version: string;
  private readonly viewDisposables: vscode.Disposable[] = [];
  private postGeneration = 0;
  private postTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.version = context.extension.packageJSON.version || '';
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    while (this.viewDisposables.length) {
      this.viewDisposables.pop()?.dispose();
    }

    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: getControlResourceRoots(this.context.extensionUri),
    };
    webviewView.webview.html = this.getHtml(webviewView.webview);

    this.viewDisposables.push(
      webviewView.webview.onDidReceiveMessage((msg) => this.onMessage(msg)),
      webviewView.onDidChangeVisibility(() => {
        if (webviewView.visible) {
          this.schedulePost();
        }
      })
    );
    this.schedulePost();
  }

  post(): void {
    this.schedulePost(0);
  }

  private schedulePost(delayMs = 120): void {
    if (!this.view) {
      return;
    }
    if (this.postTimer) {
      clearTimeout(this.postTimer);
    }
    this.postTimer = setTimeout(() => {
      this.postTimer = undefined;
      void this.publishModel();
    }, delayMs);
  }

  private async publishModel(): Promise<void> {
    if (!this.view) {
      return;
    }
    const generation = ++this.postGeneration;
    try {
      const model = await buildControlModel(this.context, this.version);
      if (generation !== this.postGeneration || !this.view) {
        return;
      }
      this.view.webview.postMessage({ type: 'data', model });
    } catch (err: unknown) {
      if (generation !== this.postGeneration || !this.view) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.view.webview.postMessage({ type: 'error', message });
    }
  }

  private async onMessage(msg: {
    type?: string;
    path?: string;
    settingKey?: string;
    commandId?: string;
    commandArgs?: string;
    scope?: string;
    orderedIds?: string[];
  }): Promise<void> {
    try {
      switch (msg.type) {
        case 'ready':
        case 'refresh':
          this.post();
          break;
        case 'toggle': {
          if (!msg.settingKey) {
            break;
          }
          const subKey = msg.settingKey.replace(/^cursorToys\./, '');
          const sectionCfg = vscode.workspace.getConfiguration('cursorToys');
          const inspected = sectionCfg.inspect<boolean>(subKey);
          const defaultValue =
            typeof inspected?.defaultValue === 'boolean' ? inspected.defaultValue : false;
          const current = sectionCfg.get<boolean>(subKey, defaultValue);
          await sectionCfg.update(subKey, !current, vscode.ConfigurationTarget.Global);
          this.post();
          break;
        }
        case 'open':
          if (msg.path) {
            const uri = vscode.Uri.file(msg.path);
            try {
              const stat = await vscode.workspace.fs.stat(uri);
              if (stat.type === vscode.FileType.Directory) {
                await vscode.commands.executeCommand('revealFileInOS', uri);
              } else if (isHttpRequestFile(msg.path)) {
                await vscode.commands.executeCommand('cursor-toys.openHttpRequest', msg.path);
              } else {
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc);
              }
            } catch {
              void vscode.window.showErrorMessage(`Could not open: ${msg.path}`);
            }
          }
          break;
        case 'reorder':
          if (msg.scope && msg.orderedIds?.length) {
            await saveControlPanelOrderScope(this.context, msg.scope, msg.orderedIds);
          }
          break;
        case 'runCommand':
          if (msg.commandId) {
            let args: unknown[] = [];
            if (msg.commandArgs) {
              try {
                const parsed = JSON.parse(msg.commandArgs) as unknown;
                args = Array.isArray(parsed) ? parsed : [parsed];
              } catch {
                args = [];
              }
            }
            if (msg.commandId === 'cursor-toys.goToAnchor' && args.length >= 2) {
              await vscode.commands.executeCommand(
                msg.commandId,
                vscode.Uri.file(String(args[0])),
                Number(args[1])
              );
            } else {
              await vscode.commands.executeCommand(msg.commandId, ...args);
            }
            if (
              msg.commandId === 'cursor-toys.spending.refresh' ||
              msg.commandId.includes('usageMonitor')
            ) {
              refreshSpending();
              refreshUsageMonitorStatusBar();
            }
            this.post();
          }
          break;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`CursorToys Control: ${message}`);
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const uri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'control', file));
    const themeUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', 'ui', 'theme.css')
    );
    const nonce = generateWebviewNonce();
    const csp =
      `default-src 'none'; img-src ${webview.cspSource} data:; ` +
      `style-src ${webview.cspSource} 'unsafe-inline'; ` +
      `font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${themeUri}" rel="stylesheet" />
  <link href="${uri('main.css')}" rel="stylesheet" />
</head>
<body>
  <div id="app"><div class="boot">Loading…</div></div>
  <script nonce="${nonce}" src="${uri('main.js')}"></script>
</body>
</html>`;
  }
}
