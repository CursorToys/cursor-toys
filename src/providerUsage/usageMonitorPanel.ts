import * as vscode from 'vscode';
import {
  DEEPINFRA_BILLING_URL,
  DEEPINFRA_CURSOR_BASE_URL,
  DEEPINFRA_KEYS_URL,
  OPENROUTER_CURSOR_BASE_URL,
  OPENROUTER_KEYS_URL,
} from './constants';
import { fetchAllProviderUsage, type ProviderUsageSnapshot } from './usageFetcher';
import { hasProviderApiKey } from './secrets';

let panel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

function formatUsd(n: number): string {
  return n.toFixed(2);
}

function renderCursorSetupInfo(): string {
  return `
  <section class="info-box">
    <h2>Using OpenRouter or DeepInfra in Cursor</h2>
    <p class="muted">CursorToys only <strong>monitors</strong> usage here. To run models in Cursor, configure each provider in <strong>Cursor Settings → Models</strong> (or the OpenAI-compatible override).</p>
    <div class="setup-grid">
      <div class="setup-card">
        <h3>OpenRouter</h3>
        <ol>
          <li>Enable <strong>Use your own API key</strong> (OpenAI-compatible).</li>
          <li>Set <strong>OpenAI Base URL</strong> to:<br><code>${OPENROUTER_CURSOR_BASE_URL}</code></li>
          <li>Paste your <strong>OpenRouter API key</strong> (from <a href="${OPENROUTER_KEYS_URL}" class="ext-link">openrouter.ai/keys</a>).</li>
          <li>Add the models you want (e.g. from the OpenRouter catalog).</li>
        </ol>
      </div>
      <div class="setup-card">
        <h3>DeepInfra</h3>
        <ol>
          <li>Enable <strong>Use your own API key</strong> (OpenAI-compatible).</li>
          <li>Set <strong>OpenAI Base URL</strong> to:<br><code>${DEEPINFRA_CURSOR_BASE_URL}</code></li>
          <li>Paste your <strong>DeepInfra API key</strong> (from <a href="${DEEPINFRA_KEYS_URL}" class="ext-link">dashboard API keys</a>).</li>
          <li>Add the DeepInfra model IDs you want to use.</li>
        </ol>
      </div>
    </div>
    <p class="muted tip">Use the <strong>Configure API Key</strong> buttons below only for the usage monitor (status bar). Keys can match the ones in Cursor Settings.</p>
  </section>`;
}

function renderProviderSection(snap: ProviderUsageSnapshot): string {
  const title = snap.provider === 'openRouter' ? 'OpenRouter' : 'DeepInfra';
  const keysUrl = snap.provider === 'openRouter' ? OPENROUTER_KEYS_URL : DEEPINFRA_BILLING_URL;

  if (!snap.configured) {
    return `
      <section class="provider" data-provider="${snap.provider}">
        <h2>${title} — usage</h2>
        <p class="muted">No API key saved for monitoring. Configure below to show usage in this panel and the status bar.</p>
        <button class="configure-btn" data-provider="${snap.provider}">Configure API Key</button>
      </section>`;
  }

  if (snap.error) {
    return `
      <section class="provider" data-provider="${snap.provider}">
        <h2>${title} — usage</h2>
        <p class="error">${escapeHtml(snap.error)}</p>
        <button class="configure-btn" data-provider="${snap.provider}">Update API Key</button>
        <a href="${keysUrl}" class="ext-link">Provider dashboard</a>
      </section>`;
  }

  if (snap.openRouter) {
    const c = snap.openRouter;
    return `
      <section class="provider" data-provider="${snap.provider}">
        <h2>${title} — usage</h2>
        <dl>
          <dt>Remaining</dt><dd class="highlight">$${formatUsd(c.remaining)}</dd>
          <dt>Used</dt><dd>$${formatUsd(c.totalUsage)}</dd>
          <dt>Purchased</dt><dd>$${formatUsd(c.totalCredits)}</dd>
        </dl>
        <button class="configure-btn" data-provider="${snap.provider}">Update API Key</button>
        <a href="${keysUrl}" class="ext-link">API keys</a>
      </section>`;
  }

  if (snap.deepInfra) {
    const b = snap.deepInfra;
    const limit =
      b.spendingLimitUsd === null ? 'No limit' : `$${formatUsd(b.spendingLimitUsd)}`;
    const remainingRow =
      b.owedUsd > 0
        ? `<dt>Amount owed</dt><dd class="highlight">$${formatUsd(b.owedUsd)}</dd>`
        : `<dt>Remaining</dt><dd class="highlight">$${formatUsd(b.remainingUsd)}</dd>`;
    return `
      <section class="provider" data-provider="${snap.provider}">
        <h2>${title} — usage</h2>
        <dl>
          ${remainingRow}
          <dt>Used (since last invoice)</dt><dd>$${formatUsd(b.recentUsageUsd)}</dd>
          <dt>Spending limit</dt><dd>${limit}</dd>
        </dl>
        <button class="configure-btn" data-provider="${snap.provider}">Update API Key</button>
        <a href="${keysUrl}" class="ext-link">Billing</a>
      </section>`;
  }

  return `<section class="provider"><h2>${title}</h2><p class="muted">No data</p></section>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPanelHtml(snapshots: ProviderUsageSnapshot[], nonce: string): string {
  const openRouter = snapshots.find((s) => s.provider === 'openRouter')!;
  const deepInfra = snapshots.find((s) => s.provider === 'deepInfra')!;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Usage Monitor</title>
  <style>
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 1rem 1.5rem; margin: 0; }
    h1 { font-size: 1.25rem; margin: 0 0 1rem 0; }
    h2 { font-size: 1rem; margin: 0 0 0.65rem 0; }
    h3 { font-size: 0.95rem; margin: 0 0 0.5rem 0; }
    .info-box { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 1rem; margin-bottom: 1rem; background: var(--vscode-editor-inactiveSelectionBackground); }
    .setup-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 0.75rem; }
    @media (max-width: 720px) { .setup-grid { grid-template-columns: 1fr; } }
    .setup-card { border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 0.75rem; background: var(--vscode-editor-background); }
    .setup-card ol { margin: 0.5rem 0 0 1.1rem; padding: 0; line-height: 1.55; }
    .setup-card li { margin-bottom: 0.35rem; }
    .setup-card code { font-size: 0.9em; word-break: break-all; }
    .provider { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 1rem; margin-bottom: 1rem; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; margin: 0 0 1rem 0; }
    dt { color: var(--vscode-descriptionForeground); }
    dd { margin: 0; }
    .highlight { font-weight: 600; font-size: 1.1rem; }
    .muted { color: var(--vscode-descriptionForeground); line-height: 1.5; }
    .tip { margin-top: 0.75rem; font-size: 0.92em; }
    .error { color: var(--vscode-errorForeground); }
    button { padding: 0.4rem 0.85rem; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; font: inherit; margin-right: 0.5rem; }
    button:hover { background: var(--vscode-button-hoverBackground); }
    a.ext-link { color: var(--vscode-textLink-foreground); font-size: 0.9em; }
    .toolbar { margin-bottom: 1rem; }
  </style>
</head>
<body>
  <h1>Usage Monitor</h1>
  <div class="toolbar">
    <button id="refresh-btn">Refresh</button>
  </div>
  ${renderCursorSetupInfo()}
  ${renderProviderSection(openRouter)}
  ${renderProviderSection(deepInfra)}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('refresh-btn').addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });
    document.querySelectorAll('.configure-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'configure', provider: btn.getAttribute('data-provider') });
      });
    });
    document.querySelectorAll('a.ext-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({ type: 'openLink', url: a.getAttribute('href') });
      });
    });
  </script>
</body>
</html>`;
}

async function refreshPanelContent(): Promise<void> {
  if (!panel || !extensionContext) {
    return;
  }
  const snapshots = await fetchAllProviderUsage(extensionContext);
  const nonce = String(Date.now());
  panel.webview.html = getPanelHtml(snapshots, nonce);
}

export function openUsageMonitorPanel(context: vscode.ExtensionContext): void {
  extensionContext = context;

  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    void refreshPanelContent();
    return;
  }

  panel = vscode.window.createWebviewPanel(
    'cursorToysUsageMonitor',
    'Usage Monitor',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.onDidDispose(() => {
    panel = undefined;
  });

  panel.webview.onDidReceiveMessage(async (message: { type?: string; provider?: string; url?: string }) => {
    if (message.type === 'refresh') {
      await refreshPanelContent();
      return;
    }
    if (message.type === 'configure' && message.provider) {
      const provider = message.provider as 'openRouter' | 'deepInfra';
      await vscode.commands.executeCommand(
        provider === 'openRouter'
          ? 'cursor-toys.usageMonitor.configureOpenRouter'
          : 'cursor-toys.usageMonitor.configureDeepInfra'
      );
      await refreshPanelContent();
      await vscode.commands.executeCommand('cursor-toys.usageMonitor.refresh');
      return;
    }
    if (message.type === 'openLink' && typeof message.url === 'string') {
      await vscode.env.openExternal(vscode.Uri.parse(message.url));
    }
  });

  void refreshPanelContent();
}

export async function refreshUsageMonitorPanelIfOpen(): Promise<void> {
  if (panel) {
    await refreshPanelContent();
  }
}

export async function getUsageMonitorKeyStatus(
  context: vscode.ExtensionContext
): Promise<{ openRouter: boolean; deepInfra: boolean }> {
  return {
    openRouter: await hasProviderApiKey(context, 'openRouter'),
    deepInfra: await hasProviderApiKey(context, 'deepInfra'),
  };
}
