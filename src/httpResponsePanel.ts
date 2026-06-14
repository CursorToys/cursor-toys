import * as vscode from 'vscode';
import type { AssertionResult } from './assertionTypes';
import {
  buildPanelHeader,
  buildWebviewDocument,
  configurePanelWebview,
  escapeWebviewHtml,
  getExtensionUri,
} from './webviewUi';

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

    const extensionUri = getExtensionUri();
    if (extensionUri) {
      configurePanelWebview(this.panel.webview, extensionUri);
    }

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
    this.panel.webview.html = buildHtml(this.data, this.panel.webview);
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
  return escapeWebviewHtml(value);
}

const HTTP_RESPONSE_EXTRA_STYLES = `
  html, body { height: 100%; }
  body.ct-panel-fill .http-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 12px 14px 16px; }
  .response-card {
    border: 1px solid var(--ct-hair);
    border-radius: 9px;
    overflow: hidden;
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 560px;
  }
  .detail-tabs { display: flex; border-bottom: 1px solid var(--ct-hair); background: var(--vscode-editor-background); }
  .detail-tab {
    padding: 8px 16px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ct-mute);
    cursor: pointer;
    font: inherit;
    font-size: 10px;
    font-family: var(--ct-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .detail-tab:hover { color: var(--vscode-foreground); background: var(--ct-row-hover); }
  .detail-tab.active { color: var(--ct-accent); border-bottom-color: var(--ct-accent); font-weight: 600; }
  .detail-body { flex: 1; display: flex; flex-direction: column; min-height: 480px; }
  .detail-pane { display: none; padding: 14px 16px; min-height: 460px; flex: 1; flex-direction: column; }
  .detail-pane.active { display: flex; }
  .response-view-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .response-view-bar label { font-size: 10px; font-family: var(--ct-mono); color: var(--ct-mute2); text-transform: uppercase; }
  .response-view-bar select { width: auto; min-width: 120px; }
  .response-view-bar button { margin-left: auto; padding: 5px 10px; font-size: 11px; }
  .response-part[hidden] { display: none; }
  .response-part:not([hidden]) { flex: 1; display: flex; flex-direction: column; min-height: 400px; }
  section h2 { font-size: 11px; font-family: var(--ct-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ct-mute2); margin: 0 0 8px; }
  pre.code-block { flex: 1; min-height: 400px; }
  pre.code-block.json { white-space: pre; word-break: normal; }
  .json-key { color: #9cdcfe; }
  .json-string { color: #ce9178; }
  .json-number { color: #b5cea8; }
  .json-boolean, .json-null { color: #569cd6; }
  td:first-child { color: var(--ct-accent); white-space: nowrap; width: 1%; }
  .assert { display: flex; gap: 8px; padding: 8px; border-radius: 8px; margin-bottom: 6px; border: 1px solid var(--ct-hair-soft); }
  .assert.pass { background: color-mix(in srgb, var(--ct-success) 12%, transparent); }
  .assert.fail { background: color-mix(in srgb, var(--ct-error) 12%, transparent); }
  .assert .icon { font-weight: bold; width: 1.2em; }
  .assert-summary { margin: 0 0 12px; font-weight: 600; font-size: 12px; }
`;

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

function buildHtml(data: HttpResponsePanelData, webview: vscode.Webview): string {
  const extensionUri = getExtensionUri();
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

  const innerBody =
    `<div class="toolbar">` +
    `<span class="badge ${statusClass(data.statusCode)}">${statusLine}</span>` +
    `<span class="hint">${escapeHtml(data.executionTimeSeconds)}s${env}</span>` +
    `<span class="ct-spacer"></span>` +
    `<button type="button" id="resendBtn" class="ct-btn primary">Send again</button>` +
    `<button type="button" id="copyBtn" class="ct-btn secondary">Copy response</button>` +
    `</div>` +
    saved +
    `<div class="response-card">` +
    `<div class="detail-tabs" role="tablist">` +
    `<button type="button" class="detail-tab active" data-tab="response">Response</button>` +
    `<button type="button" class="detail-tab" data-tab="raw">Raw</button>` +
    `<button type="button" class="detail-tab" data-tab="assertions">Assertions${assertionsBadge}</button>` +
    `</div>` +
    `<div class="detail-body">` +
    `<div class="detail-pane active" data-tab="response">` +
    payloadBlock +
    `<div class="response-view-bar">` +
    `<label for="responsePartSelect">Show</label>` +
    `<select id="responsePartSelect" class="ct-input" aria-label="Response section">` +
    `<option value="body" selected>Body</option><option value="headers">Headers</option>` +
    `</select>` +
    `<button type="button" id="copyPartBtn" class="ct-btn secondary">Copy body</button>` +
    `</div>` +
    `<div id="responsePartBody" class="response-part">${bodyBlock}</div>` +
    `<div id="responsePartHeaders" class="response-part" hidden>` +
    `<table>${headerRows || '<tr><td colspan="2"><em>None</em></td></tr>'}</table></div>` +
    `</div>` +
    `<div class="detail-pane" data-tab="raw"><pre>${escapeHtml(data.rawFormatted)}</pre></div>` +
    `<div class="detail-pane" data-tab="assertions">${assertionsTab}</div>` +
    `</div></div>`;

  const body =
    buildPanelHeader({ title: 'CursorToys', subtitle: 'HTTP response' }) +
    `<div class="http-body fade-in">${innerBody}</div>`;

  const scripts = `
    const vscode = acquireVsCodeApi();
    const tabButtons = document.querySelectorAll('.detail-tab');
    const tabPanes = document.querySelectorAll('.detail-pane');
    function setTab(tab) {
      tabButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
      tabPanes.forEach((pane) => pane.classList.toggle('active', pane.dataset.tab === tab));
    }
    tabButtons.forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
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
    document.getElementById('resendBtn')?.addEventListener('click', () => vscode.postMessage({ command: 'resend' }));
    document.getElementById('copyBtn')?.addEventListener('click', () => vscode.postMessage({ command: 'copy' }));`;

  if (!extensionUri) {
    return `<!DOCTYPE html><html><body>${body}<script>${scripts}</script></body></html>`;
  }

  return buildWebviewDocument({
    webview,
    extensionUri,
    title: 'HTTP Response',
    body,
    bodyClass: 'ct-panel-fill',
    extraStyles: HTTP_RESPONSE_EXTRA_STYLES,
    scripts,
  });
}

export function buildHttpResponsePanelKey(
  requestUri: vscode.Uri,
  startLine?: number,
  endLine?: number,
  sectionTitle?: string
): string {
  return `${requestUri.fsPath}|${startLine ?? ''}|${endLine ?? ''}|${sectionTitle ?? ''}`;
}
