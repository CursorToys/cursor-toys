import * as vscode from 'vscode';
import { saveContentAsCommandPromptOrSkill } from './deeplinkImporter';
import { sendToChat } from './sendToChat';
import {
  buildPanelHeader,
  buildWebviewDocument,
  configurePanelWebview,
  escapeWebviewHtml,
  getExtensionUri,
} from './webviewUi';

export interface AnnotationParams {
  id?: string;
  file?: string;
  line?: string;
  code?: string;
  message?: string;
  type?: 'error' | 'warning' | 'info';
  /** URL of the source page (e.g. from Chrome extension web selection) */
  sourceUrl?: string;
  /** Document title of the source page */
  sourceTitle?: string;
  [key: string]: string | undefined;
}

export class AnnotationPanel {
  private static currentPanel: AnnotationPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, params: AnnotationParams) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this.getWebviewContent(params);
    this.setupMessageListener(params);
  }

  public static createOrShow(params: AnnotationParams) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (AnnotationPanel.currentPanel) {
      AnnotationPanel.currentPanel._panel.reveal(column);
      AnnotationPanel.currentPanel.update(params);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'cursorSidekickAnnotation',
      'Cursor Toys - Annotation',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const extensionUri = getExtensionUri();
    if (extensionUri) {
      configurePanelWebview(panel.webview, extensionUri);
    }

    AnnotationPanel.currentPanel = new AnnotationPanel(panel, params);
  }

  private update(params: AnnotationParams) {
    this._panel.webview.html = this.getWebviewContent(params);
    this.setupMessageListener(params);
  }

  private setupMessageListener(params: AnnotationParams) {
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'fixInChat':
            await this.sendToChat(params);
            break;
          case 'saveAs':
            await this.saveAsCommandPromptOrSkill(params);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async sendToChat(params: AnnotationParams) {
    const prompt = this.buildFixPrompt(params);
    const code = params.code || '';
    
    await sendToChat(code, prompt);
  }

  private async saveAsCommandPromptOrSkill(params: AnnotationParams) {
    const content = params.code || params.text || '';
    const suggestedName = params.sourceTitle;

    const typePick = await vscode.window.showQuickPick(
      [
        { label: 'Command', description: 'Save as a Cursor command (.md)', value: 'command' as const },
        { label: 'Prompt', description: 'Save as a Cursor prompt (.md)', value: 'prompt' as const },
        { label: 'Skill', description: 'Save as an Agent Skill (SKILL.md)', value: 'skill' as const }
      ],
      { placeHolder: 'Save as Command, Prompt, or Skill?' }
    );

    if (!typePick) {
      return;
    }

    await saveContentAsCommandPromptOrSkill(typePick.value, content, suggestedName);
  }

  private buildFixPrompt(params: AnnotationParams): string {
    const parts: string[] = [];

    if (params.message) {
      parts.push(`**Erro:** ${params.message}`);
    }
    if (params.sourceUrl) {
      parts.push(`**Source URL:** ${params.sourceUrl}`);
      if (params.sourceTitle) {
        parts.push(`**Source title:** ${params.sourceTitle}`);
      }
    }
    if (params.file) {
      parts.push(`**File:** ${params.file}`);
    }
    if (params.line) {
      parts.push(`**Line:** ${params.line}`);
    }
    if (params.type) {
      parts.push(`**Type:** ${params.type}`);
    }

    // TODO add custom message from user
    //parts.push('\nPlease fix this problem:');

    return parts.join('\n');
  }

  private getWebviewContent(params: AnnotationParams): string {
    const code = params.code || 'No code provided';
    const hasSourceUrl = Boolean(params.sourceUrl);
    const message = params.message || (hasSourceUrl ? 'Content from web page' : 'No message');
    const file = params.file || (hasSourceUrl ? 'Web page' : 'Unknown file');
    const line = params.line || (hasSourceUrl ? '—' : '?');

    const sourceUrlBlock = hasSourceUrl
      ? `<strong>Source URL:</strong> <a href="${escapeWebviewHtml(params.sourceUrl ?? '')}" title="${escapeWebviewHtml(params.sourceUrl ?? '')}">${escapeWebviewHtml(params.sourceUrl ?? '')}</a><br>${params.sourceTitle ? `<strong>Source title:</strong> ${escapeWebviewHtml(params.sourceTitle)}<br>` : ''}`
      : '';

    const extensionUri = getExtensionUri();
    const body =
      buildPanelHeader({ title: 'CursorToys', subtitle: 'Annotation' }) +
      `<div class="ct-body fade-in">` +
      `<div class="info">` +
      sourceUrlBlock +
      `<strong>File:</strong> ${escapeWebviewHtml(file)}<br>` +
      `<strong>Line:</strong> ${line}<br>` +
      `<strong>Message:</strong> ${escapeWebviewHtml(message)}` +
      `</div>` +
      `<div class="buttons">` +
      `<button type="button" class="ct-btn primary" id="fixInChatBtn">Send to Chat</button>` +
      `<button type="button" class="ct-btn secondary" id="saveAsBtn">Save as…</button>` +
      `</div>` +
      `<pre class="code-block"><code>${escapeWebviewHtml(code)}</code></pre>` +
      `</div>`;

    if (!extensionUri) {
      return `<!DOCTYPE html><html><body>${body}</body></html>`;
    }

    return buildWebviewDocument({
      webview: this._panel.webview,
      extensionUri,
      title: 'CursorToys - Annotation',
      body,
      scripts: `
        const vscode = acquireVsCodeApi();
        document.getElementById('fixInChatBtn')?.addEventListener('click', () => {
          vscode.postMessage({ command: 'fixInChat' });
        });
        document.getElementById('saveAsBtn')?.addEventListener('click', () => {
          vscode.postMessage({ command: 'saveAs' });
        });`,
    });
  }

  private escapeHtml(text: string): string {
    return escapeWebviewHtml(text);
  }

  public dispose() {
    AnnotationPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}

