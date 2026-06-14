import * as vscode from 'vscode';
import {
  buildPanelHeader,
  buildWebviewDocument,
  configurePanelWebview,
  getExtensionUri,
} from './webviewUi';

/** Data passed to the MCPB install preview panel. */
export interface McpbPreviewData {
  name: string;
  display_name?: string;
  version?: string;
  description?: string;
  author?: { name: string; email?: string; url?: string };
  serverId: string;
  serverType: string;
  serverConfig: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
  };
}

/** Result of the preview: either confirmed with (possibly edited) serverConfig or cancelled. */
export type McpbPreviewResult =
  | { confirmed: true; serverConfig: McpbPreviewData['serverConfig']; installTarget: 'global' | 'workspace' }
  | { confirmed: false };

const MCPB_EXTRA_STYLES = `
  .kv-row { margin: 6px 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .kv-label { font-family: var(--ct-mono); font-size: 9.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ct-mute2); min-width: 80px; }
  .kv-value { word-break: break-all; }
  .env-row { margin: 8px 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .env-row label { min-width: 120px; }
  .env-row input { flex: 1; min-width: 180px; }
  .select-row { margin: 8px 0 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .select-row label { min-width: 120px; }
  .select-row select { min-width: 240px; width: auto; }
  ul.args { margin: 4px 0 0; padding-left: 20px; }
  ul.args li { margin: 4px 0; word-break: break-all; }
`;

const MCPB_CLIENT_SCRIPT = `
  const data = JSON.parse(document.getElementById('preview-data').textContent);
  const content = document.getElementById('content');
  const installTargetSelect = document.getElementById('installTarget');
  const installHint = document.getElementById('installHint');
  const btnConfirm = document.getElementById('btnConfirm');

  function escapeHtml(s) {
    if (s == null) return '';
    const t = String(s);
    return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  let html = '';
  html += '<div class="section"><h2>Package</h2>';
  html += '<div class="kv-row"><span class="kv-label">Name</span><span class="kv-value">' + escapeHtml(data.display_name || data.name) + '</span></div>';
  html += '<div class="kv-row"><span class="kv-label">ID</span><span class="kv-value"><code>' + escapeHtml(data.serverId) + '</code></span></div>';
  if (data.version) html += '<div class="kv-row"><span class="kv-label">Version</span><span class="kv-value">' + escapeHtml(data.version) + '</span></div>';
  if (data.description) html += '<div class="kv-row"><span class="kv-label">Description</span><span class="kv-value">' + escapeHtml(data.description) + '</span></div>';
  if (data.author && data.author.name) html += '<div class="kv-row"><span class="kv-label">Author</span><span class="kv-value">' + escapeHtml(data.author.name) + '</span></div>';
  html += '</div>';

  html += '<div class="section"><h2>Server</h2>';
  html += '<div class="kv-row"><span class="kv-label">Type</span><span class="kv-value"><code>' + escapeHtml(data.serverType) + '</code></span></div>';
  html += '<div class="kv-row"><span class="kv-label">Command</span><span class="kv-value"><code>' + escapeHtml(data.serverConfig.command) + '</code></span></div>';
  if (data.serverConfig.args && data.serverConfig.args.length > 0) {
    html += '<div class="kv-row"><span class="kv-label">Args</span></div><ul class="args">';
    data.serverConfig.args.forEach(function(a) {
      html += '<li><code>' + escapeHtml(a) + '</code></li>';
    });
    html += '</ul>';
  }
  if (data.serverConfig.env && Object.keys(data.serverConfig.env).length > 0) {
    html += '<div class="kv-row"><span class="kv-label">Environment</span></div>';
    html += '<p class="hint" style="margin-top:4px;">Edit values below; they will be saved to mcp.json.</p>';
    Object.entries(data.serverConfig.env).forEach(function(entry, idx) {
      var key = entry[0];
      var val = (entry[1] == null ? '' : String(entry[1]))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      html += '<div class="env-row"><label class="ct-label" for="env-' + idx + '">' + escapeHtml(key) + '</label>';
      html += '<input type="text" class="ct-input" id="env-' + idx + '" data-env-key="' + escapeHtml(key) + '" value="' + val + '" placeholder="(value)">';
      html += '</div>';
    });
  }
  html += '</div>';
  content.innerHTML = html;

  const vscode = acquireVsCodeApi();
  function updateInstallTargetUi() {
    const target = (installTargetSelect && installTargetSelect.value) ? installTargetSelect.value : 'global';
    if (installHint) {
      if (target === 'workspace') {
        installHint.innerHTML = 'The following will be added to your workspace MCP config (<code>.cursor/mcp.json</code>). Review and confirm to proceed.';
      } else {
        installHint.innerHTML = 'The following will be added to your Cursor MCP config (<code>~/.cursor/mcp.json</code>). Review and confirm to proceed.';
      }
    }
    if (btnConfirm) {
      btnConfirm.textContent = target === 'workspace' ? 'Add to Workspace MCP' : 'Add to Cursor MCP';
    }
  }

  if (installTargetSelect) {
    installTargetSelect.addEventListener('change', updateInstallTargetUi);
  }
  updateInstallTargetUi();

  btnConfirm.addEventListener('click', function() {
    var serverConfig = {
      command: data.serverConfig.command,
      args: data.serverConfig.args || undefined,
      env: {}
    };
    var envInputs = document.querySelectorAll('input[data-env-key]');
    for (var i = 0; i < envInputs.length; i++) {
      var inp = envInputs[i];
      var k = inp.getAttribute('data-env-key');
      if (k) serverConfig.env[k] = inp.value;
    }
    if (Object.keys(serverConfig.env).length === 0) serverConfig.env = undefined;
    var installTarget = (installTargetSelect && installTargetSelect.value) ? installTargetSelect.value : 'global';
    if (installTarget !== 'workspace') installTarget = 'global';
    vscode.postMessage({ command: 'confirm', serverConfig: serverConfig, installTarget: installTarget });
  });
  document.getElementById('btnCancel').addEventListener('click', function() {
    vscode.postMessage({ command: 'cancel' });
  });
`;

/**
 * Shows an interactive preview of what will be added to Cursor MCP config.
 * Environment variables are editable; the returned serverConfig (when confirmed) includes any edits.
 */
export function showMcpbInstallPreview(data: McpbPreviewData): Promise<McpbPreviewResult> {
  return new Promise((resolve) => {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;
    const panel = vscode.window.createWebviewPanel(
      'cursorToysMcpbPreview',
      'MCPB Install Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: false
      }
    );

    const extensionUri = getExtensionUri();
    if (extensionUri) {
      configurePanelWebview(panel.webview, extensionUri);
    }

    const resolveOnce = (value: McpbPreviewResult) => {
      resolve(value);
      panel.dispose();
    };

    panel.onDidDispose(() => {
      resolveOnce({ confirmed: false });
    });

    panel.webview.onDidReceiveMessage(
      (msg: { command: string; serverConfig?: McpbPreviewData['serverConfig']; installTarget?: 'global' | 'workspace' }) => {
        if (msg.command === 'confirm' && msg.serverConfig && msg.installTarget) {
          resolveOnce({ confirmed: true, serverConfig: msg.serverConfig, installTarget: msg.installTarget });
      } else if (msg.command === 'cancel') {
        resolveOnce({ confirmed: false });
      }
      }
    );

    const dataJson = JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\//g, '\\u002f');

    panel.webview.html = getWebviewHtml(panel.webview, dataJson, extensionUri);
  });
}

function getWebviewHtml(
  webview: vscode.Webview,
  dataJson: string,
  extensionUri: vscode.Uri | undefined
): string {
  const body =
    buildPanelHeader({ title: 'CursorToys', subtitle: 'MCPB install preview' }) +
    `<div class="ct-body fade-in">` +
    `<p class="hint" id="installHint">The following will be added to your Cursor MCP config (<code>~/.cursor/mcp.json</code>). Review and confirm to proceed.</p>` +
    `<div class="section">` +
    `<h2>Install target</h2>` +
    `<div class="select-row">` +
    `<label class="ct-label" for="installTarget">Write config to</label>` +
    `<select id="installTarget" class="ct-input">` +
    `<option value="global">Global (~/.cursor/mcp.json)</option>` +
    `<option value="workspace">Workspace (.cursor/mcp.json)</option>` +
    `</select></div>` +
    `<p class="hint" style="margin-top:10px;">The MCPB package itself remains installed in <code>~/.mcpb</code>.</p>` +
    `</div>` +
    `<div id="content"></div>` +
    `<div class="buttons">` +
    `<button type="button" class="ct-btn primary" id="btnConfirm">Add to Cursor MCP</button>` +
    `<button type="button" class="ct-btn secondary" id="btnCancel">Cancel</button>` +
    `</div>` +
    `<script type="application/json" id="preview-data">${dataJson}</script>` +
    `</div>`;

  if (!extensionUri) {
    return `<!DOCTYPE html><html><body>${body}<script>${MCPB_CLIENT_SCRIPT}</script></body></html>`;
  }

  return buildWebviewDocument({
    webview,
    extensionUri,
    title: 'MCPB Install Preview',
    body,
    extraStyles: MCPB_EXTRA_STYLES,
    scripts: MCPB_CLIENT_SCRIPT,
  });
}
