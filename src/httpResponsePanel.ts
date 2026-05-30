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

/** Context needed to re-run the same HTTP request block from the response panel. */
export interface HttpResendContext {
  requestUri: vscode.Uri;
  startLine?: number;
  endLine?: number;
  sectionTitle?: string;
}

/**
 * Reusable webview panel for HTTP responses (one panel per request/section key).
 */
export class HttpResponsePanel {
  private static readonly panels = new Map<string, HttpResponsePanel>();

  static showOrUpdate(
    key: string,
    data: HttpResponsePanelData,
    resendContext: HttpResendContext
  ): void {
    const existing = HttpResponsePanel.panels.get(key);
    if (existing) {
      existing.update(data, resendContext);
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      return;
    }
    const created = new HttpResponsePanel(key, data, resendContext);
    HttpResponsePanel.panels.set(key, created);
  }

  private readonly panel: vscode.WebviewPanel;
  private data: HttpResponsePanelData;
  private resendContext: HttpResendContext;

  private constructor(
    private readonly key: string,
    data: HttpResponsePanelData,
    resendContext: HttpResendContext
  ) {
    this.data = data;
    this.resendContext = resendContext;
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

    this.panel.webview.onDidReceiveMessage(async (msg: { command?: string; part?: string }) => {
      if (msg.command === 'copy') {
        await vscode.env.clipboard.writeText(this.data.rawFormatted);
        void vscode.window.showInformationMessage('HTTP response copied to clipboard.');
        return;
      }
      if (msg.command === 'copyPart') {
        if (msg.part === 'headers') {
          await vscode.env.clipboard.writeText(formatHeadersText(this.data.headers));
          void vscode.window.showInformationMessage('Response headers copied to clipboard.');
          return;
        }
        await vscode.env.clipboard.writeText(this.data.body);
        void vscode.window.showInformationMessage('Response body copied to clipboard.');
        return;
      }
      if (msg.command === 'resend') {
        await this.resendRequest();
      }
    });

    this.render();
  }

  private async resendRequest(): Promise<void> {
    const { requestUri, startLine, endLine, sectionTitle } = this.resendContext;
    await vscode.commands.executeCommand(
      'cursor-toys.sendHttpRequest',
      requestUri,
      startLine,
      endLine,
      sectionTitle
    );
  }

  update(data: HttpResponsePanelData, resendContext: HttpResendContext): void {
    this.data = data;
    this.resendContext = resendContext;
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

function formatHeadersText(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function tryFormatJson(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

function highlightJson(json: string): string {
  const escaped = escapeHtml(json);
  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        cls = match.endsWith(':') ? 'json-key' : 'json-string';
      } else if (match === 'true' || match === 'false') {
        cls = 'json-boolean';
      } else if (match === 'null') {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function buildCodeBlock(content: string): string {
  const formatted = tryFormatJson(content);
  if (formatted) {
    return `<pre class="code-block json">${highlightJson(formatted)}</pre>`;
  }
  return `<pre class="code-block">${escapeHtml(content)}</pre>`;
}

function buildAssertionsTabContent(results?: AssertionResult[]): string {
  if (!results || results.length === 0) {
    return '<p class="empty-state">No assertions were run for this request.</p>';
  }
  const passed = results.filter((r) => r.passed).length;
  const summary = `<p class="assert-summary">${passed}/${results.length} passed</p>`;
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
  return summary + rows;
}

function buildAssertionsTabBadge(results?: AssertionResult[]): string {
  if (!results || results.length === 0) {
    return '';
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const cls = failed > 0 ? 'badge-fail' : 'badge-pass';
  return `<span class="badge ${cls}">${passed}/${results.length}</span>`;
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
    ? `<section><h2>Request payload</h2>${buildCodeBlock(data.requestPayload)}</section>`
    : '';

  const bodyBlock = buildCodeBlock(data.body || '');
  const assertionsTab = buildAssertionsTabContent(data.assertionResults);
  const assertionsBadge = buildAssertionsTabBadge(data.assertionResults);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    html, body {
      height: 100%;
      box-sizing: border-box;
    }
    *, *::before, *::after { box-sizing: inherit; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      margin: 0;
      padding: 16px;
      line-height: 1.45;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
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
    button.primary { font-weight: 600; }
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
    .response-card {
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.25));
      border-radius: 8px;
      overflow: hidden;
      background: var(--vscode-editor-background);
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 560px;
    }
    .detail-tabs {
      display: flex;
      border-bottom: 1px solid var(--vscode-panel-border, #333);
      background: var(--vscode-editor-background);
    }
    .detail-tab {
      padding: 8px 16px;
      border: none;
      border-bottom: 2px solid transparent;
      background: transparent;
      color: var(--vscode-tab-inactiveForeground, inherit);
      cursor: pointer;
      font: inherit;
      font-size: 0.85em;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .detail-tab:hover { background: var(--vscode-list-hoverBackground); }
    .detail-tab.active {
      color: var(--vscode-tab-activeForeground, inherit);
      border-bottom-color: var(--vscode-focusBorder);
      font-weight: 600;
    }
    .detail-tab .badge {
      padding: 1px 6px;
      font-size: 0.75em;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
    }
    .detail-tab .badge.badge-pass { background: #2ea04333; color: #3fb950; }
    .detail-tab .badge.badge-fail { background: #f8514933; color: #f85149; }
    .detail-body {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 480px;
    }
    .detail-pane {
      display: none;
      padding: 14px 16px;
      min-height: 460px;
      box-sizing: border-box;
      flex: 1;
      flex-direction: column;
    }
    .detail-pane.active {
      display: flex;
    }
    .response-view-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
    }
    .response-view-bar label {
      font-size: 0.82em;
      opacity: 0.8;
    }
    .response-view-bar select {
      font: inherit;
      font-size: 0.88em;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border, transparent);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      min-width: 120px;
    }
    .response-view-bar button {
      padding: 4px 10px;
      font-size: 0.88em;
      margin-left: auto;
    }
    .response-part[hidden] { display: none; }
    .response-part:not([hidden]) {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 400px;
    }
    section { margin-top: 0; flex-shrink: 0; }
    section + .response-view-bar { margin-top: 16px; }
    section h2 { font-size: 1em; margin: 0 0 8px; font-weight: 600; }
    pre.code-block {
      margin: 0;
      padding: 12px;
      overflow: auto;
      flex: 1;
      min-height: 400px;
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border, transparent);
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 12px);
    }
    pre.code-block.json { white-space: pre; word-break: normal; }
    .json-key { color: #9cdcfe; }
    .json-string { color: #ce9178; }
    .json-number { color: #b5cea8; }
    .json-boolean { color: #569cd6; }
    .json-null { color: #569cd6; }
    pre {
      margin: 0;
      padding: 12px;
      overflow: auto;
      flex: 1;
      min-height: 400px;
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
    .assert-summary { margin: 0 0 12px; font-weight: 600; font-size: 0.92em; }
    .empty-state {
      margin: 0;
      padding: 24px 12px;
      text-align: center;
      opacity: 0.75;
      font-size: 0.92em;
    }
    .hint { font-size: 0.85em; opacity: 0.8; margin: 8px 0 0; }
    code { font-family: var(--vscode-editor-font-family, monospace); }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="badge ${statusClass(data.statusCode)}">${statusLine}</span>
    <span class="meta">${escapeHtml(data.executionTimeSeconds)}s${env}</span>
    <button type="button" id="resendBtn" class="primary">Send again</button>
    <button type="button" id="copyBtn">Copy response</button>
  </div>
  ${saved}
  <div class="response-card">
    <div class="detail-tabs" role="tablist">
      <button type="button" class="detail-tab active" data-tab="response">Response</button>
      <button type="button" class="detail-tab" data-tab="raw">Raw</button>
      <button type="button" class="detail-tab" data-tab="assertions">Assertions${assertionsBadge}</button>
    </div>
    <div class="detail-body">
      <div class="detail-pane active" data-tab="response">
        ${payloadBlock}
        <div class="response-view-bar">
          <label for="responsePartSelect">Show</label>
          <select id="responsePartSelect" aria-label="Response section">
            <option value="body" selected>Body</option>
            <option value="headers">Headers</option>
          </select>
          <button type="button" id="copyPartBtn">Copy body</button>
        </div>
        <div id="responsePartBody" class="response-part">
          ${bodyBlock}
        </div>
        <div id="responsePartHeaders" class="response-part" hidden>
          <table>${headerRows || '<tr><td colspan="2"><em>None</em></td></tr>'}</table>
        </div>
      </div>
      <div class="detail-pane" data-tab="raw">
        <pre>${escapeHtml(data.rawFormatted)}</pre>
      </div>
      <div class="detail-pane" data-tab="assertions">
        ${assertionsTab}
      </div>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const tabButtons = document.querySelectorAll('.detail-tab');
    const tabPanes = document.querySelectorAll('.detail-pane');

    function setTab(tab) {
      tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
      tabPanes.forEach((pane) => pane.classList.toggle('active', pane.dataset.tab === tab));
    }

    tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.tab));
    });

    const responsePartSelect = document.getElementById('responsePartSelect');
    const responsePartBody = document.getElementById('responsePartBody');
    const responsePartHeaders = document.getElementById('responsePartHeaders');
    const copyPartBtn = document.getElementById('copyPartBtn');

    function updateCopyPartLabel() {
      if (!copyPartBtn || !responsePartSelect) return;
      copyPartBtn.textContent = responsePartSelect.value === 'body' ? 'Copy body' : 'Copy headers';
    }

    if (responsePartSelect && responsePartBody && responsePartHeaders) {
      responsePartSelect.addEventListener('change', () => {
        const showBody = responsePartSelect.value === 'body';
        responsePartBody.hidden = !showBody;
        responsePartHeaders.hidden = showBody;
        updateCopyPartLabel();
      });
    }

    if (copyPartBtn && responsePartSelect) {
      updateCopyPartLabel();
      copyPartBtn.addEventListener('click', () => {
        vscode.postMessage({ command: 'copyPart', part: responsePartSelect.value });
      });
    }

    document.getElementById('resendBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'resend' });
    });
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
