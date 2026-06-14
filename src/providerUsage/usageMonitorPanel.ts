import * as vscode from 'vscode';
import {
  buildPanelHeader,
  buildRefreshButton,
  buildWebviewDocument,
  configurePanelWebview,
} from '../webviewUi';
import {
  DEEPINFRA_BILLING_URL,
  DEEPINFRA_KEYS_URL,
  OPENROUTER_KEYS_URL,
} from './constants';
import { maskApiKey } from './maskApiKey';
import type { OpenRouterDashboard } from './usageFetcher';
import { fetchAllProviderUsage, type ProviderUsageSnapshot } from './usageFetcher';
import { getProviderApiKey, hasProviderApiKey } from './secrets';
import {
  resolveUsageMonitorPanelState,
  type UsageMonitorPanelState,
} from './usageMonitorPanelState';

let panel: vscode.WebviewPanel | undefined;
let extensionContext: vscode.ExtensionContext | undefined;
const visibleKeys = { openRouter: false, deepInfra: false };

function formatUsd(n: number): string {
  return n.toFixed(2);
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}K`;
  }
  return String(n);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLimitProgress(keyInfo: NonNullable<OpenRouterDashboard['keyInfo']>): string {
  if (keyInfo.limit === null || keyInfo.limit <= 0) {
    return '';
  }
  const used = Math.max(0, keyInfo.usage);
  const pct = Math.min(100, Math.round((used / keyInfo.limit) * 100));
  const remaining = keyInfo.limitRemaining ?? Math.max(0, keyInfo.limit - used);
  return `
    <div class="limit-block">
      <div class="limit-header">
        <span>Alert limit</span>
        <span>$${formatUsd(remaining)} remaining of $${formatUsd(keyInfo.limit)}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>`;
}

function renderOpenRouterDashboard(snap: ProviderUsageSnapshot): string {
  if (!snap.configured) {
    return `
      <section class="provider-card">
        <p class="muted">No OpenRouter API key saved for monitoring.</p>
        <button class="configure-btn" data-provider="openRouter">Configure OpenRouter</button>
      </section>`;
  }

  if (snap.error) {
    return `
      <section class="provider-card">
        <p class="error">${escapeHtml(snap.error)}</p>
        <button class="configure-btn" data-provider="openRouter">Update API Key</button>
        <a href="${OPENROUTER_KEYS_URL}" class="ext-link">OpenRouter keys</a>
      </section>`;
  }

  const dashboard = snap.openRouterDashboard;
  const credits = dashboard?.credits ?? snap.openRouter;
  if (!credits) {
    return `<section class="provider-card"><p class="muted">No OpenRouter data</p></section>`;
  }

  const keyInfo = dashboard?.keyInfo;
  const activity = dashboard?.activity;

  const modelsTable =
    activity && activity.models.length > 0
      ? `
    <table class="models-table">
      <thead>
        <tr><th>Model</th><th>Requests</th><th>Tokens (in/out)</th><th>Cost</th></tr>
      </thead>
      <tbody>
        ${activity.models
          .slice(0, 10)
          .map(
            (m) => `
          <tr>
            <td title="${escapeHtml(m.modelPermaslug)}">${escapeHtml(m.model)}</td>
            <td>${m.requests}</td>
            <td>${formatTokens(m.promptTokens)} / ${formatTokens(m.completionTokens)}</td>
            <td>$${formatUsd(m.usageUsd)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>`
      : dashboard?.activityError
        ? `<p class="muted warn">${escapeHtml(dashboard.activityError)}</p>`
        : `<p class="muted">No model activity in the last 30 days.</p>`;

  const metricsBlock = activity
    ? `
    <div class="metrics-grid">
      <div class="metric-card">
        <span class="metric-label">Requests (30d)</span>
        <span class="metric-value">${activity.totalRequests}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Prompt tokens</span>
        <span class="metric-value">${formatTokens(activity.totalPromptTokens)}</span>
      </div>
      <div class="metric-card">
        <span class="metric-label">Completion tokens</span>
        <span class="metric-value">${formatTokens(activity.totalCompletionTokens)}</span>
      </div>
    </div>`
    : '';

  return `
  <section class="provider-card openrouter-dashboard">
    <div class="card-header">
      <h2>OpenRouter</h2>
      ${keyInfo ? `<span class="key-label">${escapeHtml(keyInfo.label)}</span>` : ''}
    </div>

    <div class="summary-grid">
      <div class="summary-card highlight-card">
        <span class="metric-label">Remaining balance</span>
        <span class="metric-value-lg">$${formatUsd(credits.remaining)}</span>
      </div>
      <div class="summary-card">
        <span class="metric-label">Accumulated usage</span>
        <span class="metric-value-lg">$${formatUsd(credits.totalUsage)}</span>
      </div>
      <div class="summary-card">
        <span class="metric-label">Total purchased</span>
        <span class="metric-value-lg">$${formatUsd(credits.totalCredits)}</span>
      </div>
    </div>

    ${keyInfo ? renderLimitProgress(keyInfo) : dashboard?.keyInfoError ? `<p class="muted warn">${escapeHtml(dashboard.keyInfoError)}</p>` : ''}

    <h3 class="section-title">Performance &amp; requests</h3>
    ${metricsBlock || '<p class="muted">Detailed metrics require a management API key (sk-mgmt-…).</p>'}

    <h3 class="section-title">Top models (30 days)</h3>
    ${modelsTable}

    <div class="card-actions">
      <button class="configure-btn" data-provider="openRouter">Update API Key</button>
      <a href="${OPENROUTER_KEYS_URL}" class="ext-link">Dashboard</a>
    </div>
  </section>`;
}

function renderDeepInfraCard(
  snap: ProviderUsageSnapshot,
  apiKey: string | null,
  showKey: boolean
): string {
  const isActive = snap.configured && !snap.error && Boolean(snap.deepInfra);
  const statusClass = isActive ? 'status-active' : 'status-inactive';
  const statusLabel = isActive ? 'Active' : snap.configured ? 'Error' : 'Inactive';

  const keyDisplay =
    apiKey && showKey ? escapeHtml(apiKey) : apiKey ? escapeHtml(maskApiKey(apiKey)) : '';

  let usageText = 'Configure an API key to view usage.';
  if (snap.error) {
    usageText = snap.error;
  } else if (snap.deepInfra) {
    const b = snap.deepInfra;
    usageText =
      b.owedUsd > 0
        ? `Amount owed: $${formatUsd(b.owedUsd)} · Used $${formatUsd(b.recentUsageUsd)} since last invoice`
        : `Remaining: $${formatUsd(b.remainingUsd)} · Used $${formatUsd(b.recentUsageUsd)} since last invoice`;
  }

  return `
  <section class="provider-card deepinfra-card">
    <div class="card-header">
      <h2>DeepInfra</h2>
      <span class="status-badge ${statusClass}">${statusLabel}</span>
    </div>

    <label class="field-label" for="di-key">API Key</label>
    <div class="key-row">
      <input id="di-key" class="key-input" type="text" readonly value="${keyDisplay}" placeholder="Not configured" />
      ${
        apiKey
          ? `<button class="toggle-key-btn" data-provider="deepInfra">${showKey ? 'Hide' : 'Show'}</button>`
          : ''
      }
    </div>

    <div class="usage-line">
      <span class="metric-label">Usage</span>
      <span class="${snap.error ? 'error' : 'usage-value'}">${escapeHtml(usageText)}</span>
    </div>

    <div class="card-actions">
      <button class="configure-btn" data-provider="deepInfra">Configure API Key</button>
      <a href="${DEEPINFRA_BILLING_URL}" class="ext-link">Billing</a>
    </div>
  </section>`;
}

function renderEmptyState(): string {
  return `
  <section class="empty-state">
    <h2>No providers configured</h2>
    <p class="muted">Add an API key to monitor OpenRouter or DeepInfra usage from this panel and the status bar.</p>
    <div class="empty-actions">
      <button class="configure-btn primary" data-provider="openRouter">Configure OpenRouter</button>
      <button class="configure-btn primary" data-provider="deepInfra">Configure DeepInfra</button>
    </div>
  </section>`;
}

function renderTabs(activeTab: 'openRouter' | 'deepInfra'): string {
  return `
  <nav class="tabs">
    <button class="tab-btn ${activeTab === 'openRouter' ? 'active' : ''}" data-tab="openRouter">OpenRouter</button>
    <button class="tab-btn ${activeTab === 'deepInfra' ? 'active' : ''}" data-tab="deepInfra">DeepInfra</button>
  </nav>`;
}

const USAGE_DASHBOARD_STYLES = `
  .card-header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; margin-bottom: 1rem; }
  .card-header h2 { font-size: 12px; margin: 0; font-weight: 600; }
  .key-label { font-size: 10px; font-family: var(--ct-mono); color: var(--ct-mute2); }
  .summary-grid, .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; }
  .summary-card, .metric-card { border: 1px solid var(--ct-hair); border-radius: 8px; padding: 0.75rem; background: var(--ct-hair-soft); }
  .metric-value { font-size: 1.1rem; font-weight: 600; }
  .metric-value-lg { font-size: 1.25rem; font-weight: 600; }
  .limit-block { margin-top: 1rem; }
  .limit-header { display: flex; justify-content: space-between; font-size: 10px; font-family: var(--ct-mono); color: var(--ct-mute2); margin-bottom: 0.35rem; }
  .models-table { margin-top: 0.35rem; }
  .empty-state { text-align: center; padding: 2rem 1rem; max-width: 420px; margin: 1rem auto; }
  .empty-actions { display: flex; flex-direction: column; gap: 0.65rem; margin-top: 1.25rem; align-items: center; }
  .add-provider { margin-top: 0.5rem; text-align: right; }
  .tab-panel { display: none; }
  .tab-panel.active { display: block; }
  .status-badge { font-size: 10px; font-family: var(--ct-mono); padding: 2px 8px; border-radius: 20px; border: 1px solid var(--ct-hair); }
  .status-active { color: var(--ct-success); border-color: color-mix(in srgb, var(--ct-success) 40%, transparent); }
  .key-row { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.85rem; }
  .key-input { flex: 1; }
  .usage-line { margin-bottom: 1rem; }
  .usage-value { display: block; margin-top: 0.25rem; font-weight: 500; }
  .hidden { display: none !important; }
  h3.section-title { font-size: 11px; font-family: var(--ct-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--ct-mute2); margin: 1rem 0 0.65rem; }
`;

function panelScripts(initialTab: 'openRouter' | 'deepInfra'): string {
  return `
    const vscode = acquireVsCodeApi();
    let activeTab = ${JSON.stringify(initialTab)};

    document.getElementById('refresh-btn')?.addEventListener('click', () => {
      vscode.postMessage({ type: 'refresh' });
    });

    document.querySelectorAll('.configure-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'configure', provider: btn.getAttribute('data-provider') });
      });
    });

    document.querySelectorAll('.add-provider-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'configure', provider: btn.getAttribute('data-provider') });
      });
    });

    document.querySelectorAll('.toggle-key-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ type: 'toggleKey', provider: btn.getAttribute('data-provider') });
      });
    });

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-tab') === activeTab);
        });
        document.querySelectorAll('.tab-panel').forEach((panel) => {
          panel.classList.toggle('active', panel.getAttribute('data-tab') === activeTab);
        });
      });
    });

    document.querySelectorAll('a.ext-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        vscode.postMessage({ type: 'openLink', url: a.getAttribute('href') });
      });
    });`;
}

interface PanelHtmlInput {
  webview: vscode.Webview;
  extensionUri: vscode.Uri;
  snapshots: ProviderUsageSnapshot[];
  state: UsageMonitorPanelState;
  openRouterKey: string | null;
  deepInfraKey: string | null;
}

function getPanelHtml(input: PanelHtmlInput): string {
  const { webview, extensionUri, snapshots, state, openRouterKey, deepInfraKey } = input;
  const openRouter = snapshots.find((s) => s.provider === 'openRouter')!;
  const deepInfra = snapshots.find((s) => s.provider === 'deepInfra')!;

  let bodyContent = '';

  switch (state) {
    case 'empty':
      bodyContent = renderEmptyState();
      break;
    case 'openRouterOnly':
      bodyContent = `
        ${renderOpenRouterDashboard(openRouter)}
        <div class="add-provider">
          <button class="add-provider-btn" data-provider="deepInfra">+ Add DeepInfra</button>
        </div>`;
      break;
    case 'deepInfraOnly':
      bodyContent = renderDeepInfraCard(deepInfra, deepInfraKey, visibleKeys.deepInfra);
      break;
    case 'both':
      bodyContent = `
        ${renderTabs('openRouter')}
        <div class="tab-panel active" data-tab="openRouter">${renderOpenRouterDashboard(openRouter)}</div>
        <div class="tab-panel" data-tab="deepInfra">${renderDeepInfraCard(deepInfra, deepInfraKey, visibleKeys.deepInfra)}</div>`;
      break;
  }

  const body =
    buildPanelHeader({
      title: 'CursorToys',
      subtitle: 'Usage monitor',
      toolbarHtml: buildRefreshButton('refresh-btn'),
    }) +
    `<div class="ct-body fade-in">${bodyContent}</div>`;

  return buildWebviewDocument({
    webview,
    extensionUri,
    title: 'Usage Monitor',
    body,
    extraStyles: USAGE_DASHBOARD_STYLES,
    scripts: panelScripts('openRouter'),
  });
}

async function refreshPanelContent(): Promise<void> {
  if (!panel || !extensionContext) {
    return;
  }

  const snapshots = await fetchAllProviderUsage(extensionContext);
  const keyFlags = {
    openRouter: snapshots.some((s) => s.provider === 'openRouter' && s.configured),
    deepInfra: snapshots.some((s) => s.provider === 'deepInfra' && s.configured),
  };
  const state = resolveUsageMonitorPanelState(keyFlags);
  const openRouterKey = await getProviderApiKey(extensionContext, 'openRouter');
  const deepInfraKey = await getProviderApiKey(extensionContext, 'deepInfra');

  panel.webview.html = getPanelHtml({
    webview: panel.webview,
    extensionUri: extensionContext.extensionUri,
    snapshots,
    state,
    openRouterKey,
    deepInfraKey,
  });
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

  configurePanelWebview(panel.webview, context.extensionUri);

  panel.onDidDispose(() => {
    panel = undefined;
    visibleKeys.openRouter = false;
    visibleKeys.deepInfra = false;
  });

  panel.webview.onDidReceiveMessage(async (message: { type?: string; provider?: string; url?: string }) => {
    if (message.type === 'refresh') {
      await refreshPanelContent();
      return;
    }
    if (message.type === 'toggleKey' && message.provider === 'deepInfra') {
      visibleKeys.deepInfra = !visibleKeys.deepInfra;
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

// Exported for unit tests
export { getPanelHtml, resolveUsageMonitorPanelState };
