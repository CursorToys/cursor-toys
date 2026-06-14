/**
 * Status bar items for OpenRouter and DeepInfra usage when enabled in settings.
 */

import * as vscode from 'vscode';
import {
  CONFIG_SECTION,
  DEEPINFRA_CONFIG,
  DEFAULT_REFRESH_INTERVAL_MINUTES,
  MIN_REFRESH_INTERVAL_MINUTES,
  OPENROUTER_CONFIG,
} from './constants';
import { fetchDeepInfraBilling, DeepInfraBillingError } from './deepInfraBilling';
import { fetchOpenRouterCredits, OpenRouterCreditsError } from './openRouterCredits';
import { getProviderApiKey } from './secrets';

let openRouterItem: vscode.StatusBarItem | undefined;
let deepInfraItem: vscode.StatusBarItem | undefined;
let refreshIntervalId: ReturnType<typeof setInterval> | undefined;
let extensionContext: vscode.ExtensionContext | undefined;

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cursorToys');
}

function statusBarConfigKey(provider: 'openRouter' | 'deepInfra'): string {
  return `${CONFIG_SECTION}.${provider === 'openRouter' ? OPENROUTER_CONFIG : DEEPINFRA_CONFIG}.showInStatusBar`;
}

function getRefreshIntervalMinutes(): number {
  const raw = getConfig().get<number>(
    `${CONFIG_SECTION}.refreshIntervalMinutes`,
    DEFAULT_REFRESH_INTERVAL_MINUTES
  );
  return Math.max(MIN_REFRESH_INTERVAL_MINUTES, raw);
}

function formatUsd(amount: number): string {
  return amount.toFixed(2);
}

async function updateOpenRouterBar(): Promise<void> {
  if (!openRouterItem || !extensionContext) {
    return;
  }

  const apiKey = await getProviderApiKey(extensionContext, 'openRouter');
  if (!apiKey) {
    openRouterItem.text = '$(cloud) OR: —';
    openRouterItem.tooltip = 'OpenRouter: configure API key in CursorToys → Usage Monitor';
    openRouterItem.command = 'cursor-toys.usageMonitor.configureOpenRouter';
    return;
  }

  openRouterItem.text = '$(sync~spin) OR…';
  try {
    const credits = await fetchOpenRouterCredits(apiKey);
    openRouterItem.text = `$(cloud) OR rem $${formatUsd(credits.remaining)}`;
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(
      `**OpenRouter** — remaining $${formatUsd(credits.remaining)} · used $${formatUsd(credits.totalUsage)} / $${formatUsd(credits.totalCredits)} purchased\n\n[Refresh](command:cursor-toys.usageMonitor.refresh) · [Monitor](command:cursor-toys.usageMonitor.open)`
    );
    openRouterItem.tooltip = md;
    openRouterItem.command = 'cursor-toys.controlView.focus';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    openRouterItem.text = '$(error) OR';
    openRouterItem.tooltip = `OpenRouter: ${msg}`;
    openRouterItem.command = 'cursor-toys.usageMonitor.configureOpenRouter';
    if (err instanceof OpenRouterCreditsError && err.code === 'forbidden') {
      openRouterItem.tooltip += '\n\nCredits API may require a management key (sk-mgmt-…).';
    }
  }
}

async function updateDeepInfraBar(): Promise<void> {
  if (!deepInfraItem || !extensionContext) {
    return;
  }

  const apiKey = await getProviderApiKey(extensionContext, 'deepInfra');
  if (!apiKey) {
    deepInfraItem.text = '$(server) DI: —';
    deepInfraItem.tooltip = 'DeepInfra: configure API key in CursorToys → Usage Monitor';
    deepInfraItem.command = 'cursor-toys.usageMonitor.configureDeepInfra';
    return;
  }

  deepInfraItem.text = '$(sync~spin) DI…';
  try {
    const billing = await fetchDeepInfraBilling(apiKey);
    deepInfraItem.text =
      billing.owedUsd > 0
        ? `$(server) DI owed $${formatUsd(billing.owedUsd)}`
        : `$(server) DI rem $${formatUsd(billing.remainingUsd)}`;
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    if (billing.owedUsd > 0) {
      md.appendMarkdown(
        `**DeepInfra** — owed $${formatUsd(billing.owedUsd)} · used $${formatUsd(billing.recentUsageUsd)} since last invoice\n\n[Refresh](command:cursor-toys.usageMonitor.refresh) · [Monitor](command:cursor-toys.usageMonitor.open)`
      );
    } else {
      md.appendMarkdown(
        `**DeepInfra** — remaining $${formatUsd(billing.remainingUsd)} (credit $${formatUsd(billing.balanceUsd)} − used $${formatUsd(billing.recentUsageUsd)})\n\n[Refresh](command:cursor-toys.usageMonitor.refresh) · [Monitor](command:cursor-toys.usageMonitor.open)`
      );
    }
    deepInfraItem.tooltip = md;
    deepInfraItem.command = 'cursor-toys.controlView.focus';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    deepInfraItem.text = '$(error) DI';
    deepInfraItem.tooltip = `DeepInfra: ${msg}`;
    deepInfraItem.command = 'cursor-toys.usageMonitor.configureDeepInfra';
  }
}

async function refreshVisibleBars(): Promise<void> {
  const config = getConfig();
  if (config.get<boolean>(statusBarConfigKey('openRouter'), false) && openRouterItem) {
    openRouterItem.show();
    await updateOpenRouterBar();
  }
  if (config.get<boolean>(statusBarConfigKey('deepInfra'), false) && deepInfraItem) {
    deepInfraItem.show();
    await updateDeepInfraBar();
  }
}

function applyStatusBarVisibility(): void {
  const config = getConfig();
  const orEnabled = config.get<boolean>(statusBarConfigKey('openRouter'), false);
  const diEnabled = config.get<boolean>(statusBarConfigKey('deepInfra'), false);

  if (openRouterItem) {
    if (orEnabled) {
      openRouterItem.show();
    } else {
      openRouterItem.hide();
    }
  }
  if (deepInfraItem) {
    if (diEnabled) {
      deepInfraItem.show();
    } else {
      deepInfraItem.hide();
    }
  }

  if (orEnabled || diEnabled) {
    startRefreshTimer();
    void refreshVisibleBars();
  } else {
    stopRefreshTimer();
  }
}

function startRefreshTimer(): void {
  stopRefreshTimer();
  const intervalMs = getRefreshIntervalMinutes() * 60 * 1000;
  refreshIntervalId = setInterval(() => {
    void refreshVisibleBars();
  }, intervalMs);
}

function stopRefreshTimer(): void {
  if (refreshIntervalId !== undefined) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = undefined;
  }
}

/** Same side as Cursor spending (Left); higher priority = closer to editor center. */
const STATUS_BAR_ALIGNMENT = vscode.StatusBarAlignment.Left;
/** Spending uses 99; OR/DI sit immediately beside it toward the left edge. */
const OPENROUTER_STATUS_PRIORITY = 98;
const DEEPINFRA_STATUS_PRIORITY = 97;

export function initUsageMonitorStatusBar(context: vscode.ExtensionContext): void {
  extensionContext = context;
  openRouterItem = vscode.window.createStatusBarItem(
    STATUS_BAR_ALIGNMENT,
    OPENROUTER_STATUS_PRIORITY
  );
  deepInfraItem = vscode.window.createStatusBarItem(
    STATUS_BAR_ALIGNMENT,
    DEEPINFRA_STATUS_PRIORITY
  );
  context.subscriptions.push(openRouterItem, deepInfraItem);

  applyStatusBarVisibility();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(`cursorToys.${CONFIG_SECTION}.openRouter.showInStatusBar`) ||
        e.affectsConfiguration(`cursorToys.${CONFIG_SECTION}.deepInfra.showInStatusBar`) ||
        e.affectsConfiguration(`cursorToys.${CONFIG_SECTION}.refreshIntervalMinutes`)
      ) {
        applyStatusBarVisibility();
      }
    })
  );

  context.subscriptions.push({ dispose: () => stopRefreshTimer() });
}

export function refreshUsageMonitorStatusBar(): void {
  void refreshVisibleBars();
}
