/**
 * Spending status bar: shows Cursor API usage (Auto % and API %) in the status bar.
 * Token can be auto-detected from state.vscdb or set manually.
 */

import * as vscode from 'vscode';
import {
  clearCredentialsCache,
  fetchConsolidatedUsage,
  resolveSessionCookieValue,
  type PlanUsage,
} from './cursorUsage';
import {
  buildPanelHeader,
  buildWebviewDocument,
  configurePanelWebview,
} from './webviewUi';

export type { PlanUsage } from './cursorUsage';

const DASHBOARD_URL = 'https://cursor.com/dashboard?tab=spending';
const PROGRESS_BAR_WIDTH = 24;
const PROGRESS_FILL = '\u2588';
const PROGRESS_EMPTY = '\u2591';

let statusBarItem: vscode.StatusBarItem | undefined;
let refreshIntervalId: ReturnType<typeof setInterval> | undefined;
let extensionUri: vscode.Uri | undefined;

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cursorToys');
}

async function resolveSessionCookie(): Promise<string | null> {
  const config = getConfig();
  const autoDetect = config.get<boolean>('spending.autoDetectToken', true);
  const manualToken = (config.get<string>('spending.sessionToken', '') || '').trim();

  if (manualToken) {
    return resolveSessionCookieValue(manualToken);
  }
  if (autoDetect) {
    return resolveSessionCookieValue('');
  }
  return null;
}

function formatCentsAsUsd(cents: number): string {
  return (cents / 100).toFixed(2);
}

function progressBar(percent: number, width: number = PROGRESS_BAR_WIDTH): string {
  const filled = Math.min(width, Math.round((percent / 100) * width));
  const empty = width - filled;
  return PROGRESS_FILL.repeat(filled) + PROGRESS_EMPTY.repeat(empty);
}

function buildUsageTooltip(planUsage: PlanUsage): vscode.MarkdownString {
  const autoPercent =
    typeof planUsage.autoPercentUsed === 'number'
      ? planUsage.autoPercentUsed.toFixed(1)
      : '—';
  const apiPercent =
    typeof planUsage.apiPercentUsed === 'number'
      ? planUsage.apiPercentUsed.toFixed(1)
      : '—';
  const autoPercentNum =
    typeof planUsage.autoPercentUsed === 'number' ? planUsage.autoPercentUsed : 0;
  const apiPercentNum =
    typeof planUsage.apiPercentUsed === 'number' ? planUsage.apiPercentUsed : 0;

  const lines: string[] = [];
  lines.push(`### Auto: ${autoPercent}%`);
  lines.push('');
  lines.push('```');
  lines.push(progressBar(autoPercentNum));
  lines.push('```');
  lines.push('');
  lines.push('Consumed by Auto. Additional usage consumes API quota.');
  lines.push('');
  lines.push(`### API: ${apiPercent}%`);
  lines.push('');
  lines.push('```');
  lines.push(progressBar(apiPercentNum));
  lines.push('```');
  lines.push('');

  const apiUsageUSD =
    typeof planUsage.limit === 'number' ? planUsage.limit / 100 : null;
  lines.push(
    apiUsageUSD
      ? `Consumed by named models. Your plan includes at least $${apiUsageUSD.toFixed(2)} of API usage.`
      : 'Consumed by named models.'
  );

  const hasSpend =
    typeof planUsage.totalSpend === 'number' ||
    typeof planUsage.includedSpend === 'number' ||
    typeof planUsage.remaining === 'number';
  if (hasSpend) {
    lines.push('');
    const parts: string[] = [];
    if (typeof planUsage.totalSpend === 'number') {
      parts.push(`$${formatCentsAsUsd(planUsage.totalSpend)} used`);
    }
    if (typeof planUsage.includedSpend === 'number') {
      parts.push(`$${formatCentsAsUsd(planUsage.includedSpend)} included`);
    }
    if (typeof planUsage.remaining === 'number') {
      parts.push(`$${formatCentsAsUsd(planUsage.remaining)} remaining`);
    }
    lines.push('Spend: ' + parts.join(', ') + '.');
  }
  if (planUsage.bonusTooltip && planUsage.bonusTooltip.trim()) {
    lines.push('');
    lines.push(`*${planUsage.bonusTooltip.trim()}*`);
  }
  lines.push('');
  lines.push('[Refresh now](command:cursor-toys.spending.refresh) | [Hide spending](command:cursor-toys.spending.disable)');

  const md = new vscode.MarkdownString(lines.join('\n'));
  md.supportHtml = false;
  md.isTrusted = true;
  return md;
}

function setStatusBarUsage(item: vscode.StatusBarItem, planUsage: PlanUsage): void {
  const autoPercent =
    typeof planUsage.autoPercentUsed === 'number' ? planUsage.autoPercentUsed : null;
  const apiPercent =
    typeof planUsage.apiPercentUsed === 'number' ? planUsage.apiPercentUsed : null;
  const autoText =
    autoPercent !== null
      ? `$(cursor) Auto: ${autoPercent.toFixed(1)}%`
      : '$(cursor) Auto: —';
  const apiText =
    apiPercent !== null
      ? `$(cloud) API: ${apiPercent.toFixed(1)}%`
      : '$(cloud) API: —';
  item.text = `${autoText}  ${apiText}`;
  item.tooltip = buildUsageTooltip(planUsage);
  item.command = 'cursor-toys.controlView.focus';
}

function setStatusBarNoToken(
  item: vscode.StatusBarItem,
  displayText: string,
  tooltip: string
): void {
  item.text = displayText;
  const md = new vscode.MarkdownString(`${tooltip}\n\n[Hide spending](command:cursor-toys.spending.disable)`);
  md.isTrusted = true;
  item.tooltip = md;
  item.command = {
    title: 'Configure session token',
    command: 'cursor-toys.spending.openTokenSetup'
  };
}

function setStatusBarError(
  item: vscode.StatusBarItem,
  text: string,
  tooltip: string
): void {
  item.text = text;
  const md = new vscode.MarkdownString(`${tooltip}\n\n[Hide spending](command:cursor-toys.spending.disable)`);
  md.isTrusted = true;
  item.tooltip = md;
  item.command = {
    title: 'Open Cursor Dashboard',
    command: 'vscode.open',
    arguments: [vscode.Uri.parse(DASHBOARD_URL)]
  };
}

function setStatusBarUnsupported(
  item: vscode.StatusBarItem,
  text: string,
  tooltip: string
): void {
  item.text = text;
  const md = new vscode.MarkdownString(`${tooltip}\n\n[Hide spending](command:cursor-toys.spending.disable)`);
  md.isTrusted = true;
  item.tooltip = md;
  item.command = {
    title: 'Open Cursor Dashboard',
    command: 'vscode.open',
    arguments: [vscode.Uri.parse(DASHBOARD_URL)]
  };
}

async function fetchAndUpdateStatusBar(): Promise<void> {
  if (!statusBarItem) {
    return;
  }
  const config = getConfig();
  const manualToken = (config.get<string>('spending.sessionToken', '') || '').trim();
  const autoDetect = config.get<boolean>('spending.autoDetectToken', true);

  const cookie = await resolveSessionCookie();
  if (!cookie) {
    setStatusBarNoToken(
      statusBarItem,
      '$(cursor) Auto: —  $(cloud) API: —',
      autoDetect
        ? 'Could not read Cursor login from this machine. Click to paste a session token (optional).'
        : 'Token not configured. Click to set up.'
    );
    statusBarItem.show();
    return;
  }

  statusBarItem.text = '$(sync~spin) Refreshing...';
  statusBarItem.tooltip = 'Fetching usage…';
  statusBarItem.show();

  try {
    const consolidated = await fetchConsolidatedUsage(manualToken);
    const planUsage = consolidated?.planUsage;

    if (!planUsage) {
      setStatusBarUnsupported(
        statusBarItem,
        '$(cursor) Auto: —  $(cloud) API: —',
        'Usage data not available for your plan. Enterprise and some other plans do not expose plan usage via this API. Click to open the Cursor dashboard for details.'
      );
      statusBarItem.show();
      return;
    }

    setStatusBarUsage(statusBarItem, planUsage);
    statusBarItem.show();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    setStatusBarError(
      statusBarItem,
      '$(cursor) Auto: $(error)  $(cloud) API: $(error)',
      `Failed to fetch usage: ${message}`
    );
    statusBarItem.show();
  }
}

function startRefreshTimer(): void {
  stopRefreshTimer();
  const config = getConfig();
  const intervalMinutes = config.get<number>('spending.refreshInterval', 20);
  const intervalMs = intervalMinutes * 60 * 1000;
  refreshIntervalId = setInterval(() => {
    fetchAndUpdateStatusBar();
  }, intervalMs);
}

function stopRefreshTimer(): void {
  if (refreshIntervalId !== undefined) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = undefined;
  }
}

function applySpendingEnabled(enabled: boolean): void {
  if (!statusBarItem) {
    return;
  }
  if (enabled) {
    statusBarItem.show();
    startRefreshTimer();
    fetchAndUpdateStatusBar();
  } else {
    statusBarItem.hide();
    stopRefreshTimer();
  }
}

function getTokenSetupWebviewContent(webview: vscode.Webview, dashboardLink: string): string {
  const body =
    buildPanelHeader({ title: 'CursorToys', subtitle: 'Spending session token' }) +
    `<div class="ct-body fade-in">` +
    `<p class="hint">Usage is read automatically from your local Cursor login (<code>state.vscdb</code>) when <strong>auto-detect</strong> is enabled. Use the field below only if auto-detect fails.</p>` +
    `<p class="hint">Optional override: paste the <strong>WorkosCursorSessionToken</strong> cookie from the browser:</p>` +
    `<ol class="hint" style="margin: 0.5rem 0 1rem 1.25rem;">` +
    `<li>Open the <a href="${dashboardLink}" id="dashboard-link">Cursor dashboard</a> and log in.</li>` +
    `<li>Open DevTools (F12 or Cmd+Option+I) → Application → Cookies → cursor.com.</li>` +
    `<li>Copy the value of <strong>WorkosCursorSessionToken</strong> (or paste the JWT only).</li>` +
    `</ol>` +
    `<label class="ct-label" for="token-input">Manual session token (optional)</label>` +
    `<input type="text" class="ct-input" id="token-input" placeholder="Leave empty if auto-detect works" />` +
    `<div class="button-row">` +
    `<button type="button" class="ct-btn primary" id="save-btn">Save</button>` +
    `</div></div>`;

  if (!extensionUri) {
    return `<!DOCTYPE html><html><body>${body}</body></html>`;
  }

  return buildWebviewDocument({
    webview,
    extensionUri,
    title: 'Cursor Spending – Session Token',
    body,
    scripts: `
    const vscode = acquireVsCodeApi();
    const input = document.getElementById('token-input');
    const saveBtn = document.getElementById('save-btn');
    const dashboardLinkEl = document.getElementById('dashboard-link');

    dashboardLinkEl?.addEventListener('click', function(e) {
      e.preventDefault();
      vscode.postMessage({ type: 'openLink', url: ${JSON.stringify(dashboardLink)} });
    });

    saveBtn?.addEventListener('click', function() {
      const token = input?.value ?? '';
      if (token.trim()) {
        vscode.postMessage({ type: 'save', token: token.trim() });
      }
    });

    input?.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        saveBtn?.click();
      }
    });`,
  });
}

function openTokenSetupPanel(): void {
  const panel = vscode.window.createWebviewPanel(
    'cursorToysSpendingTokenSetup',
    'Cursor Spending – Session Token',
    vscode.ViewColumn.One,
    { enableScripts: true }
  );
  if (extensionUri) {
    configurePanelWebview(panel.webview, extensionUri);
  }
  panel.webview.html = getTokenSetupWebviewContent(panel.webview, DASHBOARD_URL);
  panel.webview.onDidReceiveMessage(async (message: { type: string; token?: string; url?: string }) => {
    if (message.type === 'save' && typeof message.token === 'string') {
      const trimmed = message.token.trim();
      if (!trimmed) {
        return;
      }
      await getConfig().update(
        'spending.sessionToken',
        trimmed,
        vscode.ConfigurationTarget.Global
      );
      clearCredentialsCache();
      panel.dispose();
      vscode.window.showInformationMessage(
        'CursorToys: Session token saved. Fetching usage…'
      );
      fetchAndUpdateStatusBar();
    } else if (message.type === 'openLink' && typeof message.url === 'string') {
      await vscode.env.openExternal(vscode.Uri.parse(message.url));
    }
  });
}

/**
 * Opens the token setup webview panel. Safe to call even when spending is disabled.
 */
export function openSpendingTokenSetup(): void {
  openTokenSetupPanel();
}

/**
 * Triggers a refresh of the spending status bar. No-op if spending is disabled or no status bar.
 */
export function refreshSpending(): void {
  fetchAndUpdateStatusBar();
}

/**
 * Initializes the spending status bar. Always creates the status bar item; visibility and
 * refresh timer are controlled by cursorToys.spending.enabled (config + listener).
 * Commands are registered in extension.ts so they are available even when spending is disabled.
 */
export function initSpendingStatusBar(context: vscode.ExtensionContext): void {
  extensionUri = context.extensionUri;
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    99
  );
  context.subscriptions.push(statusBarItem);

  const config = getConfig();
  const enabled = config.get<boolean>('spending.enabled', true);
  if (enabled) {
    startRefreshTimer();
    fetchAndUpdateStatusBar();
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('cursorToys.spending.enabled')) {
        const newEnabled = getConfig().get<boolean>('spending.enabled', true);
        applySpendingEnabled(newEnabled);
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      stopRefreshTimer();
    }
  });
}
