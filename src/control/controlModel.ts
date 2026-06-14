import * as vscode from 'vscode';
import { fetchConsolidatedUsage } from '../cursorUsage';
import { fetchAllProviderUsage } from '../providerUsage/usageFetcher';
import { getBaseFolderName } from '../utils';
import { buildConfigSettingsItems } from '../cursorToysSettingsTreeProvider';
import { UTILS_ITEMS, type UtilsTreeItemModel } from '../utilsTreeProvider';
import {
  getPersonalScopeLabel,
  getProjectScopeLabel,
  listMcpbPackages,
  listPersonalCommands,
  listPersonalHooks,
  listPersonalKanban,
  listPersonalNotepads,
  listPersonalPlans,
  listPersonalPrompts,
  listPersonalRules,
  listPersonalSkills,
  listProjectCommands,
  listProjectHooks,
  listProjectHttp,
  listProjectKanban,
  listProjectNotepads,
  listProjectPlans,
  listProjectPrompts,
  listProjectRules,
  listProjectSkills,
  type ControlAssetItem,
} from './assetLister';
import {
  buildClipboardData,
  buildCodeAnchorsData,
  buildInlineAnnotationsDataForRoot,
  buildProjectsData,
  type ControlClipboardData,
  type ControlCodeAnchorsData,
  type ControlInlineAnnotationsData,
  type ControlProjectsData,
} from './controlExtras';
import { ProjectRegistry } from '../projects/projectRegistry';
import {
  applyItemOrder,
  getControlPanelOrder,
  orderSettingsTree,
} from './controlPanelOrder';

export interface ControlAction {
  id: string;
  label: string;
  description?: string;
  commandId: string;
}

export interface ControlProjectScope {
  name: string;
  root: string;
  commands: ControlAssetItem[];
  prompts: ControlAssetItem[];
  rules: ControlAssetItem[];
  skills: ControlAssetItem[];
  http: ControlAssetItem[];
  notepads: ControlAssetItem[];
  kanban: ControlAssetItem[];
  plans: ControlAssetItem[];
  hooks: ControlAssetItem[];
  inlineAnnotations: ControlInlineAnnotationsData;
}

export interface ControlUsageBar {
  label: string;
  percent: number | null;
  extra?: string;
}

export interface ControlUsageSection {
  id: string;
  title: string;
  bars: ControlUsageBar[];
  error?: string;
  actions: ControlAction[];
}

export interface ControlConfigScope {
  shortcuts: ControlAction[];
  settingsCategories: import('../cursorToysSettingsTreeProvider').ControlSettingsItem[];
}

export interface ControlModel {
  version: string;
  pollSeconds: number;
  baseFolder: string;
  personal: {
    scopeLabel: string;
    commands: ControlAssetItem[];
    prompts: ControlAssetItem[];
    skills: ControlAssetItem[];
    rules: ControlAssetItem[];
    notepads: ControlAssetItem[];
    kanban: ControlAssetItem[];
    plans: ControlAssetItem[];
    hooks: ControlAssetItem[];
    mcpb: ControlAssetItem[];
    utils: UtilsTreeItemModel[];
    clipboard: ControlClipboardData;
    projects: ControlProjectsData;
    codeAnchors: ControlCodeAnchorsData;
  };
  config: ControlConfigScope;
  projects: ControlProjectScope[];
  usageSections: ControlUsageSection[];
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('cursorToys');
}

function buildConfigShortcuts(): ControlAction[] {
  return [
    {
      id: 'open-settings-json',
      label: 'Open settings.json',
      description: 'CursorToys extension settings file',
      commandId: 'cursor-toys.settings.openSettingsJson',
    },
    {
      id: 'command-palette',
      label: 'CursorToys Command Palette',
      description: 'Ctrl+T / Cmd+T',
      commandId: 'cursor-toys.showMenu',
    },
    {
      id: 'whats-new',
      label: "What's New",
      commandId: 'cursor-toys.showReleaseNotes',
    },
  ];
}

function formatUsd(n: number): string {
  return n.toFixed(2);
}

function leftTime(iso?: string): string {
  if (!iso) {
    return '';
  }
  try {
    const s = (new Date(iso).getTime() - Date.now()) / 1000;
    if (s <= 0) {
      return '';
    }
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    return hh ? `${hh}h${String(mm).padStart(2, '0')}m` : `${mm}m`;
  } catch {
    return '';
  }
}

async function buildUsageSections(context: vscode.ExtensionContext): Promise<ControlUsageSection[]> {
  const sections: ControlUsageSection[] = [];

  const manualToken = (getConfig().get<string>('spending.sessionToken', '') || '').trim();
  const consolidated = await fetchConsolidatedUsage(manualToken);
  const plan = consolidated?.planUsage;
  const cursorBars: ControlUsageBar[] = [];
  if (plan?.autoPercentUsed != null) {
    cursorBars.push({
      label: 'Auto',
      percent: plan.autoPercentUsed,
      extra: leftTime(consolidated?.resetsAt),
    });
  }
  if (plan?.apiPercentUsed != null) {
    cursorBars.push({
      label: 'API',
      percent: plan.apiPercentUsed,
    });
  }
  sections.push({
    id: 'cursor',
    title: 'Cursor plan',
    bars: cursorBars,
    error:
      cursorBars.length === 0
        ? 'Usage not available. Enable spending or configure a session token.'
        : undefined,
    actions: [
      {
        id: 'cursor-refresh',
        label: 'Refresh spending',
        commandId: 'cursor-toys.spending.refresh',
      },
      {
        id: 'cursor-token',
        label: 'Configure session token',
        commandId: 'cursor-toys.spending.openTokenSetup',
      },
      {
        id: 'cursor-dashboard',
        label: 'Open Cursor dashboard',
        commandId: 'cursor-toys.control.openCursorDashboard',
      },
    ],
  });

  const snapshots = await fetchAllProviderUsage(context);
  for (const snap of snapshots) {
    if (snap.provider === 'openRouter') {
      const bars: ControlUsageBar[] = [];
      let error: string | undefined;
      if (!snap.configured) {
        error = 'No OpenRouter API key configured.';
      } else if (snap.error) {
        error = snap.error;
      } else if (snap.openRouter) {
        const c = snap.openRouter;
        const usedPct =
          c.totalCredits > 0 ? Math.min(100, Math.round((c.totalUsage / c.totalCredits) * 100)) : 0;
        bars.push({
          label: 'Used',
          percent: usedPct,
          extra: `$${formatUsd(c.remaining)} left`,
        });
      }
      sections.push({
        id: 'openRouter',
        title: 'OpenRouter',
        bars,
        error,
        actions: [
          {
            id: 'or-configure',
            label: 'Configure OpenRouter key',
            commandId: 'cursor-toys.usageMonitor.configureOpenRouter',
          },
          {
            id: 'or-panel',
            label: 'Open usage monitor',
            commandId: 'cursor-toys.usageMonitor.open',
          },
        ],
      });
    }
    if (snap.provider === 'deepInfra') {
      const bars: ControlUsageBar[] = [];
      let error: string | undefined;
      if (!snap.configured) {
        error = 'No DeepInfra API key configured.';
      } else if (snap.error) {
        error = snap.error;
      } else if (snap.deepInfra) {
        const b = snap.deepInfra;
        const total = b.balanceUsd + b.recentUsageUsd;
        const usedPct = total > 0 ? Math.min(100, Math.round((b.recentUsageUsd / total) * 100)) : 0;
        bars.push({
          label: 'Recent',
          percent: usedPct,
          extra: b.owedUsd > 0 ? `$${formatUsd(b.owedUsd)} owed` : `$${formatUsd(b.remainingUsd)} left`,
        });
      }
      sections.push({
        id: 'deepInfra',
        title: 'DeepInfra',
        bars,
        error,
        actions: [
          {
            id: 'di-configure',
            label: 'Configure DeepInfra key',
            commandId: 'cursor-toys.usageMonitor.configureDeepInfra',
          },
          {
            id: 'di-panel',
            label: 'Open usage monitor',
            commandId: 'cursor-toys.usageMonitor.open',
          },
        ],
      });
    }
  }

  return sections;
}

/**
 * Builds the data model sent to the CursorToys Control webview.
 */
export async function buildControlModel(
  context: vscode.ExtensionContext,
  version: string
): Promise<ControlModel> {
  const refreshMinutes = getConfig().get<number>('usageMonitor.refreshIntervalMinutes', 15);
  const roots = (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);

  const personalResults = await Promise.all([
    listPersonalCommands(),
    listPersonalPrompts(),
    listPersonalSkills(),
    listPersonalRules(),
    listPersonalNotepads(),
    listPersonalKanban(),
    listPersonalPlans(),
    listPersonalHooks(),
    listMcpbPackages(),
    buildClipboardData(),
    buildCodeAnchorsData(context),
  ]);
  const [commands, prompts, skills, rules, notepads, kanban, plans, hooks, mcpb, clipboard, codeAnchors] =
    personalResults;
  const projectsData = buildProjectsData(ProjectRegistry.getInstance());

  const projects: ControlProjectScope[] = [];
  for (const root of roots) {
    const [pCommands, pPrompts, pRules, pSkills, pHttp, pNotepads, pKanban, pPlans, pHooks] =
      await Promise.all([
      listProjectCommands(root),
      listProjectPrompts(root),
      listProjectRules(root),
      listProjectSkills(root),
      listProjectHttp(root),
      listProjectNotepads(root),
      listProjectKanban(root),
      listProjectPlans(root),
      listProjectHooks(root),
    ]);
    projects.push({
      name: getProjectScopeLabel(root),
      root,
      commands: pCommands,
      prompts: pPrompts,
      rules: pRules,
      skills: pSkills,
      http: pHttp,
      notepads: pNotepads,
      kanban: pKanban,
      plans: pPlans,
      hooks: pHooks,
      inlineAnnotations: buildInlineAnnotationsDataForRoot(root),
    });
  }

  const usageSections = await buildUsageSections(context);
  const orderMap = getControlPanelOrder(context);
  const settingsCategories = orderSettingsTree(
    applyItemOrder(buildConfigSettingsItems(getConfig()), 'cfg-categories', orderMap),
    'cfg-categories',
    orderMap
  );

  return {
    version,
    pollSeconds: refreshMinutes * 60,
    baseFolder: getBaseFolderName(),
    personal: {
      scopeLabel: getPersonalScopeLabel(),
      commands,
      prompts,
      skills,
      rules,
      notepads,
      kanban,
      plans,
      hooks,
      mcpb,
      utils: UTILS_ITEMS,
      clipboard: clipboard as ControlClipboardData,
      projects: projectsData,
      codeAnchors: codeAnchors as ControlCodeAnchorsData,
    },
    config: {
      shortcuts: applyItemOrder(buildConfigShortcuts(), 'cfg-shortcuts', orderMap),
      settingsCategories,
    },
    projects,
    usageSections,
  };
}
