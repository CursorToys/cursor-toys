import * as vscode from 'vscode';
import type { AssertionResult } from './assertionTypes';

export interface HttpResponsePanelData {
  requestLabel: string;
  statusCode: number;
  statusText: string;
  executionTimeSeconds: string;
  envName?: string;
  headers: Record<string, string>;
  body: string;
  requestPayload?: string;
  assertionResults?: AssertionResult[];
  rawFormatted: string;
  savePath?: string;
}

/**
 * Reusable webview panel for HTTP responses (one panel per request/section key).
 */
export class HttpResponsePanel {
  private static readonly panels = new Map<string, HttpResponsePanel>();

  static showOrUpdate(key: string, data: HttpResponsePanelData): void {
    const existing = HttpResponsePanel.panels.get(key);
    if (existing) {
      existing.update(data);
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    const created = new HttpResponsePanel(key, data);
    HttpResponsePanel.panels.set(key, created);
  }

  private readonly panel: vscode.WebviewPanel;
  private data: HttpResponsePanelData;

  private constructor(
    private readonly key: string,
    data: HttpResponsePanelData
  ) {
    this.data = data;
    const statusSuffix =
      data.statusCode > 0 ? `${data.statusCode}` : 'Error';
    this.panel = vscode.window.createWebviewPanel(
      'cursorToys.httpResponse',
      `HTTP ${statusSuffix} · ${truncateLabel(data.requestLabel)}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.onDidDispose(() => {
      HttpResponsePanel.panels.delete(this.key);
    });

    this.panel.webview.onDidReceiveMessage(async (msg: { command?: string }) => {
      if (msg.command === 'copy') {
        await vscode.env.clipboard.writeText(this.data.rawFormatted);
        void vscode.window.showInformationMessage('HTTP response copied to clipboard.');
      }
    });

    this.render();
  }

  update(data: HttpResponsePanelData): void {
    this.data = data;
    const statusSuffix =
      data.statusCode > 0 ? `${data.statusCode}` : 'Error';
    this.panel.title = `HTTP ${statusSuffix} · ${truncateLabel(data.requestLabel)}`;
    this.render();
  }

  private render(): void {
    this.panel.webview.html = buildHtml(this.data);
  }
}

function truncateLabel(label: string, max = 48): string {
  const oneLine = label.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= max) {
    return oneLine;
  }
  return `${oneLine.slice(0, max - 1)}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusClass(statusCode: number): string {
  if (statusCode === 0) {
    return 'status-error';
  }
  if (statusCode >= 500) {
    return 'status-5xx';
  }
  if (statusCode >= 400) {
    return 'status-4xx';
  }
  if (statusCode >= 200 && statusCode < 300) {
    return 'status-2xx';
  }
  return 'status-other';
}

function buildAssertionsHtml(results: AssertionResult[]): string {
  if (results.length === 0) {
    return '';
  }
  const passed = results.filter((r) => r.passed).length;
  const rows = results
    .map((r) => {
      const desc = r.assertion.description || r.assertion.expression;
      const icon = r.passed ? '✓' : '✗';
      const cls = r.passed ? 'pass' : 'fail';
      const detail = r.error
        ? escapeHtml(r.error)
        : escapeHtml(String(r.actualValue ?? ''));
      return `<div class="assert ${cls}"><span class="icon">${icon}</span><div><strong>${escapeHtml(desc)}</strong><div class="meta">${detail}</div></div></div>`;
    })
    .join('');
  return `<section><h2>Assertions (${passed}/${results.length} passed)</h2>${rows}</section>`;
}

function buildHtml(data: HttpResponsePanelData): string {
  const statusLine =
    data.statusCode > 0
      ? `HTTP ${data.statusCode} ${escapeHtml(data.statusText)}`
      : escapeHtml(data.statusText || 'Request failed');
  const env = data.envName ? ` · env: ${escapeHtml(data.envName)}` : '';
  const saved = data.savePath
    ? `<p class="hint">Saved to <code>${escapeHtml(data.savePath)}</code></p>`
    : '';

  const headerRows = Object.entries(data.headers)
    .map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join('');

  const payloadBlock = data.requestPayload
    ? `<section><h2>Request payload</h2><pre>${escapeHtml(data.requestPayload)}</pre></section>`
    : '';

  const assertions = data.assertionResults
    ? buildAssertionsHtml(data.assertionResults)
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
      line-height: 1.45;
    }
    .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 600;
      font-size: 0.9em;
    }
    .status-2xx { background: #2ea04333; color: #3fb950; }
    .status-4xx { background: #d2992233; color: #e3b341; }
    .status-5xx, .status-error { background: #f8514933; color: #f85149; }
    .status-other { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .meta { opacity: 0.85; font-size: 0.92em; margin-top: 4px; }
    section { margin-top: 16px; }
    h2 { font-size: 1em; margin: 0 0 8px; font-weight: 600; }
    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border, transparent);
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 12px);
    }
    table { width: 100%; border-collapse: collapse; font-size: 0.92em; }
    td { padding: 4px 8px; border-bottom: 1px solid var(--vscode-panel-border, #3333); vertical-align: top; }
    td:first-child { color: var(--vscode-textLink-foreground); white-space: nowrap; width: 1%; }
    .assert { display: flex; gap: 8px; padding: 8px; border-radius: 6px; margin-bottom: 6px; }
    .assert.pass { background: #2ea04322; }
    .assert.fail { background: #f8514922; }
    .assert .icon { font-weight: bold; width: 1.2em; }
    .hint { font-size: 0.85em; opacity: 0.8; margin: 8px 0 0; }
    code { font-family: var(--vscode-editor-font-family, monospace); }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="badge ${statusClass(data.statusCode)}">${statusLine}</span>
    <span class="meta">${escapeHtml(data.executionTimeSeconds)}s${env}</span>
    <button id="copyBtn">Copy response</button>
  </div>
  ${saved}
  ${payloadBlock}
  ${assertions}
  <section>
    <h2>Headers</h2>
    <table>${headerRows || '<tr><td colspan="2"><em>None</em></td></tr>'}</table>
  </section>
  <section>
    <h2>Body</h2>
    <pre>${escapeHtml(data.body || '')}</pre>
  </section>
  <section>
    <h2>Raw</h2>
    <pre>${escapeHtml(data.rawFormatted)}</pre>
  </section>
  <script>
    const vscode = acquireVsCodeApi();
    document.getElementById('copyBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'copy' });
    });
  </script>
</body>
</html>`;
}

export function buildHttpResponsePanelKey(
  requestUri: vscode.Uri,
  startLine?: number,
  endLine?: number,
  sectionTitle?: string
): string {
  return `${requestUri.fsPath}|${startLine ?? ''}|${endLine ?? ''}|${sectionTitle ?? ''}`;
}
