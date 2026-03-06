import * as vscode from 'vscode';

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
  | { confirmed: true; serverConfig: McpbPreviewData['serverConfig'] }
  | { confirmed: false };

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

    const resolveOnce = (value: McpbPreviewResult) => {
      resolve(value);
      panel.dispose();
    };

    panel.onDidDispose(() => {
      resolveOnce({ confirmed: false });
    });

    panel.webview.onDidReceiveMessage((msg: { command: string; serverConfig?: McpbPreviewData['serverConfig'] }) => {
      if (msg.command === 'confirm' && msg.serverConfig) {
        resolveOnce({ confirmed: true, serverConfig: msg.serverConfig });
      } else if (msg.command === 'cancel') {
        resolveOnce({ confirmed: false });
      }
    });

    const dataJson = JSON.stringify(data)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026')
      .replace(/\//g, '\\u002f');
    panel.webview.html = getWebviewHtml(dataJson);
  });
}

function getWebviewHtml(dataJson: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCPB Install Preview</title>
  <style>
    body {
      font-family: var(--vscode-font-family);
      padding: 20px;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
      line-height: 1.5;
      font-size: 13px;
    }
    h1 {
      font-size: 1.3em;
      margin: 0 0 16px 0;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-widget-border);
    }
    h2 {
      font-size: 1em;
      margin: 18px 0 8px 0;
      color: var(--vscode-foreground);
    }
    .section {
      margin-bottom: 16px;
      padding: 12px;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 6px;
    }
    .row {
      margin: 6px 0;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .label {
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      min-width: 80px;
    }
    .value {
      word-break: break-all;
    }
    code, .code {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      background-color: var(--vscode-textBlockQuote-background);
      padding: 2px 6px;
      border-radius: 4px;
    }
    .env-row {
      margin: 8px 0;
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .env-row label {
      font-weight: 600;
      color: var(--vscode-descriptionForeground);
      min-width: 120px;
      font-size: 12px;
    }
    .env-row input {
      flex: 1;
      min-width: 180px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      padding: 6px 8px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      border-radius: 4px;
    }
    .env-row input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }
    ul.args {
      margin: 4px 0 0 0;
      padding-left: 20px;
    }
    ul.args li {
      margin: 4px 0;
      word-break: break-all;
    }
    .buttons {
      margin-top: 24px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    button {
      font-family: var(--vscode-font-family);
      padding: 8px 16px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      font-size: 13px;
    }
    button.primary {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    button.primary:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    .hint {
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <h1>Review MCP server configuration</h1>
  <p class="hint">The following will be added to your Cursor MCP config (<code>~/.cursor/mcp.json</code>). Review and confirm to proceed.</p>

  <div id="content"></div>

  <div class="buttons">
    <button class="primary" id="btnConfirm">Add to Cursor MCP</button>
    <button class="secondary" id="btnCancel">Cancel</button>
  </div>

  <script type="application/json" id="preview-data">DATA_PLACEHOLDER</script>
  <script>
    const data = JSON.parse(document.getElementById('preview-data').textContent);
    const content = document.getElementById('content');

    function escapeHtml(s) {
      if (s == null) return '';
      const t = String(s);
      return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    let html = '';

    html += '<div class="section"><h2>Package</h2>';
    html += '<div class="row"><span class="label">Name</span><span class="value">' + escapeHtml(data.display_name || data.name) + '</span></div>';
    html += '<div class="row"><span class="label">ID</span><span class="value code">' + escapeHtml(data.serverId) + '</span></div>';
    if (data.version) html += '<div class="row"><span class="label">Version</span><span class="value">' + escapeHtml(data.version) + '</span></div>';
    if (data.description) html += '<div class="row"><span class="label">Description</span><span class="value">' + escapeHtml(data.description) + '</span></div>';
    if (data.author && data.author.name) html += '<div class="row"><span class="label">Author</span><span class="value">' + escapeHtml(data.author.name) + '</span></div>';
    html += '</div>';

    html += '<div class="section"><h2>Server</h2>';
    html += '<div class="row"><span class="label">Type</span><span class="value code">' + escapeHtml(data.serverType) + '</span></div>';
    html += '<div class="row"><span class="label">Command</span><span class="value code">' + escapeHtml(data.serverConfig.command) + '</span></div>';
    if (data.serverConfig.args && data.serverConfig.args.length > 0) {
      html += '<div class="row"><span class="label">Args</span></div><ul class="args">';
      data.serverConfig.args.forEach(function(a) {
        html += '<li><code>' + escapeHtml(a) + '</code></li>';
      });
      html += '</ul>';
    }
    if (data.serverConfig.env && Object.keys(data.serverConfig.env).length > 0) {
      html += '<div class="row"><span class="label">Environment</span></div>';
      html += '<p class="hint" style="margin-top:4px;">Edit values below; they will be saved to mcp.json.</p>';
      Object.entries(data.serverConfig.env).forEach(function(entry, idx) {
        var key = entry[0];
        var val = (entry[1] == null ? '' : String(entry[1]))
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        html += '<div class="env-row"><label for="env-' + idx + '">' + escapeHtml(key) + '</label>';
        html += '<input type="text" id="env-' + idx + '" data-env-key="' + escapeHtml(key) + '" value="' + val + '" placeholder="(value)">';
        html += '</div>';
      });
    }
    html += '</div>';

    content.innerHTML = html;

    const vscode = acquireVsCodeApi();
    document.getElementById('btnConfirm').addEventListener('click', function() {
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
      vscode.postMessage({ command: 'confirm', serverConfig: serverConfig });
    });
    document.getElementById('btnCancel').addEventListener('click', function() {
      vscode.postMessage({ command: 'cancel' });
    });
  </script>
</body>
</html>`.replace('DATA_PLACEHOLDER', dataJson);
}
