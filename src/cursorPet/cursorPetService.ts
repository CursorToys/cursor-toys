import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getCursorPetDecayIntervalMs,
  getCursorPetEngineConfig,
  isCursorPetDebugMode,
  isCursorPetEnabled,
  shouldAutoInstallCursorPetHooks,
  shouldShowCursorPetStatusBar,
  syncCursorPetContext,
} from './cursorPetConfig';
import { applyCursorPetDebugScenario, CURSOR_PET_DEBUG_OPTIONS } from './cursorPetDebug';
import { applyActivity, buildViewModel, resetAfterDeath, selectEgg, tick } from './cursorPetEngine';
import { parseActivityLine, buildInternalActivityEvent } from './cursorPetActivity';
import { applyTokenExhaustionDeath } from './cursorPetTamagotchi';
import { isCursorPlanExhausted } from './cursorPetUsageCheck';
import {
  getCursorPetActivityPath,
  CursorPetStore,
} from './cursorPetStore';
import {
  installCursorPetHookBridge,
  isCursorPetBridgeInstalled,
  readActivityTail,
  uninstallCursorPetHookBridge,
} from './cursorPetHookInstaller';
import { CursorPetTranscriptWatcher } from './cursorPetTranscriptWatcher';
import type { CursorPetViewModel, EggSkin } from './types';
import { createInitialCursorPetState } from './types';
import { getExtensionDataFolderName } from '../utils';
import { getPersonalHooksPath } from '../hooksManager';
import { refreshControlViewIfVisible } from '../control/controlViewProvider';
import { CursorPetPanel } from './cursorPetPanel';
import { refreshCursorPetViewIfVisible, registerCursorPetView } from './cursorPetViewProvider';
import { buildCursorPetStatusBarPresentation } from './cursorPetStatusBar';

let serviceInstance: CursorPetService | undefined;

export class CursorPetService {
  private readonly store = CursorPetStore.getInstance();
  private readonly transcriptWatcher = new CursorPetTranscriptWatcher();
  private readonly disposables: vscode.Disposable[] = [];
  private decayTimer: ReturnType<typeof setInterval> | undefined;
  private activityOffset = 0;
  private activityWatcher: fs.FSWatcher | undefined;
  private activityDebounce: ReturnType<typeof setTimeout> | undefined;
  private textDocumentDisposable: vscode.Disposable | undefined;
  private statusBarItem: vscode.StatusBarItem | undefined;
  private lastLowVitalsWarningAt = 0;
  private lastAngryNotificationAt = 0;
  private lastTantrumWarningAt = 0;
  private lastSleepLightsWarningAt = 0;
  private bridgeInstalled = false;
  private transcriptActivityDisposable: vscode.Disposable | undefined;

  static getInstance(): CursorPetService | undefined {
    return serviceInstance;
  }

  static async initialize(context: vscode.ExtensionContext): Promise<void> {
    if (serviceInstance) {
      await serviceInstance.syncEnabledState();
      return;
    }
    serviceInstance = new CursorPetService(context);
    await serviceInstance.syncEnabledState();
    context.subscriptions.push({
      dispose: () => serviceInstance?.dispose(),
    });
  }

  private constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('cursorToys.cursorPet')) {
          void this.syncEnabledState();
          if (
            event.affectsConfiguration('cursorToys.cursorPet.debugMode') ||
            event.affectsConfiguration('cursorToys.cursorPet.decayIntervalMinutes')
          ) {
            this.restartDecayTimer();
          }
          if (event.affectsConfiguration('cursorToys.cursorPet.showStatusBar')) {
            this.setupStatusBar();
          }
        }
      }),
      this.store.onDidChange(() => {
        this.updateStatusBar();
        void CursorPetPanel.refreshIfOpen();
        refreshCursorPetViewIfVisible();
        refreshControlViewIfVisible();
      })
    );
  }

  async syncEnabledState(): Promise<void> {
    await syncCursorPetContext();
    const enabled = isCursorPetEnabled();
    if (!enabled) {
      this.stopRuntime();
      this.statusBarItem?.hide();
      await this.removeHooksOnDisable();
      return;
    }
    await this.store.load();
    await this.ensureHooks();
    this.startRuntime();
    this.setupStatusBar();
    this.updateStatusBar();
  }

  private async removeHooksOnDisable(): Promise<void> {
    try {
      await uninstallCursorPetHookBridge();
      this.bridgeInstalled = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(`Cursor Pet: failed to remove activity hooks. ${message}`);
    }
  }

  /**
   * Restarts decay timer when debug mode or interval settings change.
   */
  restartDecayTimer(): void {
    if (!isCursorPetEnabled()) {
      return;
    }
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = undefined;
    }
    const intervalMs = getCursorPetDecayIntervalMs();
    this.decayTimer = setInterval(() => {
      void this.runDecayTickAsync();
    }, intervalMs);
  }

  private async ensureHooks(): Promise<void> {
    if (!shouldAutoInstallCursorPetHooks()) {
      this.bridgeInstalled = await isCursorPetBridgeInstalled();
      return;
    }
    try {
      const result = await installCursorPetHookBridge();
      this.bridgeInstalled = result.installed;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showWarningMessage(`Cursor Pet: failed to install activity hooks. ${message}`);
      this.bridgeInstalled = false;
    }
  }

  private startRuntime(): void {
    this.stopRuntime();
    const homePath = process.env.HOME || process.env.USERPROFILE || '';
    const activityPath = getCursorPetActivityPath(homePath, getExtensionDataFolderName());
    void fs.promises.mkdir(path.dirname(activityPath), { recursive: true }).catch(() => {});
    try {
      this.activityWatcher = fs.watch(activityPath, () => {
        if (this.activityDebounce) {
          clearTimeout(this.activityDebounce);
        }
        this.activityDebounce = setTimeout(() => {
          void this.processActivityFile(activityPath);
        }, 300);
      });
    } catch {
      // activity file may not exist yet
    }

    this.transcriptActivityDisposable?.dispose();
    this.transcriptActivityDisposable = this.transcriptWatcher.onActivity((event) => {
      this.handleActivity(event);
    });
    this.transcriptWatcher.start();

    this.textDocumentDisposable?.dispose();
    this.textDocumentDisposable = vscode.workspace.onDidChangeTextDocument(() => {
        this.handleActivity({
          ts: new Date().toISOString(),
          event: 'manualEdit',
          category: 'code',
          weight: 0.5,
        });
    });

    const intervalMs = getCursorPetDecayIntervalMs();
    this.decayTimer = setInterval(() => {
      void this.runDecayTickAsync();
    }, intervalMs);
  }

  private stopRuntime(): void {
    this.transcriptWatcher.stop();
    this.transcriptActivityDisposable?.dispose();
    this.transcriptActivityDisposable = undefined;
    this.textDocumentDisposable?.dispose();
    this.textDocumentDisposable = undefined;
    this.activityWatcher?.close();
    this.activityWatcher = undefined;
    if (this.activityDebounce) {
      clearTimeout(this.activityDebounce);
      this.activityDebounce = undefined;
    }
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = undefined;
    }
  }

  private async processActivityFile(filePath: string): Promise<void> {
    const { lines, nextOffset } = await readActivityTail(filePath, this.activityOffset);
    this.activityOffset = nextOffset;
    for (const line of lines) {
      const event = parseActivityLine(line);
      if (event) {
        this.handleActivity(event);
      }
    }
  }

  private handleActivity(event: import('./types').PetActivityEvent): void {
    const config = getCursorPetEngineConfig();
    const previous = this.store.getState();
    const next = applyActivity(previous, event, config);
    if (next !== previous) {
      this.store.setState(next);
      this.checkTransitions(previous, next);
    }
  }

  private async runDecayTickAsync(): Promise<void> {
    const config = getCursorPetEngineConfig();
    const previous = this.store.getState();
    let next = tick(previous, config);

    if (config.tokenDeathEnabled && next.phase === 'alive') {
      try {
        const exhausted = await isCursorPlanExhausted();
        next = applyTokenExhaustionDeath(next, exhausted);
      } catch {
        // usage API unavailable — skip token death
      }
    }

    if (next !== previous) {
      this.store.setState(next);
      this.checkTransitions(previous, next);
      return;
    }

    if (next.phase !== 'alive') {
      return;
    }

    const vm = buildViewModel(next, config);
    const now = Date.now();

    if (vm.needsAttention && now - this.lastLowVitalsWarningAt > 15 * 60 * 1000) {
      this.lastLowVitalsWarningAt = now;
      void vscode.window.showWarningMessage(
        'Cursor Pet needs attention! Hunger or happiness hit zero — feed or play before a care mistake.',
        'Open pet'
      ).then((choice) => {
        if (choice === 'Open pet') {
          void vscode.commands.executeCommand('cursor-toys.cursorPet.focusView');
        }
      });
    } else if (vm.lowVitalsWarning && now - this.lastLowVitalsWarningAt > 60 * 60 * 1000) {
      this.lastLowVitalsWarningAt = now;
      void vscode.window.showWarningMessage(
        'Cursor Pet: hunger or happiness is low. Use Cursor to feed and play with your pet.'
      );
    }

    if (vm.sick && now - this.lastLowVitalsWarningAt > 20 * 60 * 1000) {
      void vscode.window.showWarningMessage(
        'Cursor Pet is sick! Ask the agent to run cursor_pet_medicine via CursorToys MCP.',
        'Open pet'
      );
    }

    if (vm.tantrum && now - this.lastTantrumWarningAt > 15 * 60 * 1000) {
      this.lastTantrumWarningAt = now;
      void vscode.window.showInformationMessage(
        'Cursor Pet is throwing a tantrum. Ask the agent to run cursor_pet_discipline via CursorToys MCP.',
        'Open pet'
      );
    }

    if (vm.sleeping && vm.lightsOn && now - this.lastSleepLightsWarningAt > 20 * 60 * 1000) {
      this.lastSleepLightsWarningAt = now;
      void vscode.window.showInformationMessage(
        'Cursor Pet is sleeping — ask the agent to run cursor_pet_lights_off via CursorToys MCP.',
        'Open pet'
      );
    }
  }

  private checkTransitions(
    previous: import('./types').CursorPetState,
    next: import('./types').CursorPetState
  ): void {
    if (previous.phase !== 'alive' && next.phase === 'alive') {
      void vscode.window.showInformationMessage(
        `Cursor Pet hatched! Your companion is a ${next.archetype ?? 'balanced'} pet.`
      );
    }
    if (previous.phase !== 'dead' && next.phase === 'dead') {
      const reasonLabels: Record<string, string> = {
        starvation: 'starvation',
        unhappy: 'loneliness',
        neglect: 'neglect',
        sickness: 'illness',
        old_age: 'old age',
        no_tokens: 'Cursor plan tokens running out',
      };
      const reason = reasonLabels[next.lifecycle.deathReason ?? ''] ?? 'unknown causes';
      void vscode.window.showWarningMessage(
        `Cursor Pet died from ${reason}. Choose a new egg to start again.`
      );
    }
  }

  getViewModel(): CursorPetViewModel {
    return buildViewModel(this.store.getState(), getCursorPetEngineConfig());
  }

  getState() {
    return this.store.getState();
  }

  readonly onDidChange = this.store.onDidChange;

  isBridgeInstalled(): boolean {
    return this.bridgeInstalled;
  }

  async selectEgg(egg: EggSkin, options?: { skipConfirm?: boolean }): Promise<boolean> {
    const current = this.store.getState();
    if (!options?.skipConfirm && current.phase === 'dead' && current.archetype) {
      const choice = await vscode.window.showWarningMessage(
        `Start a new egg (${egg})? Your previous pet will be replaced.`,
        'Start new egg',
        'Cancel'
      );
      if (choice !== 'Start new egg') {
        return false;
      }
    }
    const next = selectEgg(current, egg);
    this.store.setState(next);
    return true;
  }

  async resetPet(options?: { skipConfirm?: boolean }): Promise<boolean> {
    const current = this.store.getState();
    if (
      !options?.skipConfirm &&
      (current.phase === 'alive' || current.phase === 'incubating')
    ) {
      const label =
        current.phase === 'alive'
          ? 'Your living pet will be lost forever.'
          : 'Incubation progress will be lost.';
      const choice = await vscode.window.showWarningMessage(
        `Start a new egg? ${label}`,
        'Start new egg',
        'Cancel'
      );
      if (choice !== 'Start new egg') {
        return false;
      }
    } else if (!options?.skipConfirm && current.phase === 'dead' && current.archetype) {
      const choice = await vscode.window.showWarningMessage(
        'Clear the grave and choose a fresh egg?',
        'Start new egg',
        'Cancel'
      );
      if (choice !== 'Start new egg') {
        return false;
      }
    }
    const next =
      current.phase === 'dead'
        ? resetAfterDeath(current)
        : createInitialCursorPetState(getCursorPetEngineConfig().incubationTargetPoints);
    this.store.setState(next);
    return true;
  }

  async installHooks(): Promise<void> {
    await installCursorPetHookBridge();
    this.bridgeInstalled = true;
    vscode.window.showInformationMessage('Cursor Pet activity hooks installed.');
  }

  async runDebugScenario(scenario: import('./cursorPetDebug').CursorPetDebugScenario): Promise<void> {
    if (!isCursorPetDebugMode()) {
      throw new Error('Enable cursorToys.cursorPet.debugMode first.');
    }
    const config = getCursorPetEngineConfig();
    const previous = this.store.getState();
    const next = applyCursorPetDebugScenario(previous, scenario, config.lowVitalsWarningThreshold);
    this.store.setState(next);
    this.checkTransitions(previous, next);
  }

  async showDebugMenu(): Promise<void> {
    if (!isCursorPetEnabled()) {
      void vscode.window.showWarningMessage('Enable Cursor Pet before using debug previews.');
      return;
    }
    if (!isCursorPetDebugMode()) {
      void vscode.window.showWarningMessage(
        'Cursor Pet debug mode is off. Set cursorToys.cursorPet.debugMode to true in settings.json.'
      );
      return;
    }

    const pick = await vscode.window.showQuickPick(
      CURSOR_PET_DEBUG_OPTIONS.map((option) => ({
        label: option.label,
        description: option.description,
        scenario: option.id,
      })),
      { placeHolder: 'Preview a Cursor Pet flow (debug / internal test)' }
    );
    if (!pick) {
      return;
    }
    await this.runDebugScenario(pick.scenario);
    void vscode.window.showInformationMessage(`Cursor Pet debug: ${pick.label}`);
  }

  isDebugMode(): boolean {
    return isCursorPetDebugMode();
  }

  /**
   * Applies a manual feed activity event (hooks, MCP, or command).
   */
  feedPet(weight = 1): void {
    this.handleActivity(buildInternalActivityEvent('petFeed', 'code', weight));
  }

  /**
   * Applies a manual play activity event (hooks or command).
   */
  playPet(weight = 1): void {
    this.handleActivity(buildInternalActivityEvent('petPlay', 'chat', weight));
  }

  cleanPet(): void {
    this.handleActivity(buildInternalActivityEvent('petClean', 'code', 1));
  }

  medicatePet(): void {
    this.handleActivity(buildInternalActivityEvent('petMedicine', 'explore', 1));
  }

  disciplinePet(): void {
    this.handleActivity(buildInternalActivityEvent('petDiscipline', 'chat', 1));
  }

  lightsOff(): void {
    this.handleActivity(buildInternalActivityEvent('petLightsOff', 'heartbeat', 1));
  }

  treatPet(weight = 1): void {
    this.handleActivity(buildInternalActivityEvent('petTreat', 'code', weight));
  }

  /**
   * Shows how hunger and happiness are restored via Cursor activity and hooks.
   */
  async showFeedHelp(): Promise<void> {
    const feedScript = `node ${path.join(path.dirname(getPersonalHooksPath()), 'hooks', 'cursor-pet-feed.js')}`;
    await vscode.window.showInformationMessage(
      'Cursor Pet: how to feed & play',
      { modal: true, detail: [
        'Organic care (editor only — no feed/play buttons):',
        '• Feed: save/edit code, terminal runs (afterFileEdit, afterShellExecution)',
        '• Play: chat prompts, agent responses, MCP/subagent activity',
        '• Treats: agent stop hook gives bonus happiness (do not overuse)',
        '',
        'Hook scripts (optional automation, not manual feeding UI):',
        `• ${feedScript}`,
        '• node ./hooks/cursor-pet-bridge.js petFeed',
        '',
        'Care via CursorToys MCP: cursor_pet_clean, cursor_pet_medicine, cursor_pet_play, cursor_pet_discipline, cursor_pet_lights_off, cursor_pet_treat',
      ].join('\n') }
    );
  }

  /**
   * Notifies the user when the pet becomes angry from rapid clicks.
   */
  handlePetAngry(clicks?: number): void {
    const now = Date.now();
    if (now - this.lastAngryNotificationAt < 8000) {
      return;
    }
    this.lastAngryNotificationAt = now;
    const count = clicks ?? 5;
    void vscode.window
      .showWarningMessage(
        `Cursor Pet got angry after ${count} rapid clicks! Stop poking — feed it with code activity instead.`,
        'How to feed?',
        'Open pet'
      )
      .then(async (choice) => {
        if (choice === 'How to feed?') {
          await this.showFeedHelp();
        } else if (choice === 'Open pet') {
          await vscode.commands.executeCommand('cursor-toys.cursorPet.focusView');
        }
      });
  }

  private setupStatusBar(): void {
    if (!shouldShowCursorPetStatusBar()) {
      this.statusBarItem?.hide();
      return;
    }
    if (!this.statusBarItem) {
      this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
      this.statusBarItem.command = 'cursor-toys.cursorPet.focusView';
      this.context.subscriptions.push(this.statusBarItem);
    }
    this.statusBarItem.show();
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem || !shouldShowCursorPetStatusBar()) {
      return;
    }
    const presentation = buildCursorPetStatusBarPresentation(this.getViewModel());
    this.statusBarItem.text = presentation.text;
    this.statusBarItem.tooltip = presentation.tooltip;
  }

  dispose(): void {
    this.stopRuntime();
    this.statusBarItem?.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

export async function initCursorPet(context: vscode.ExtensionContext): Promise<void> {
  registerCursorPetView(context);
  context.subscriptions.push(
    vscode.commands.registerCommand('cursor-toys.cursorPet.open', () => {
      void CursorPetPanel.createOrShow();
    }),
    vscode.commands.registerCommand('cursor-toys.cursorPet.installHooks', async () => {
      const service = CursorPetService.getInstance();
      if (service) {
        await service.installHooks();
      }
    }),
    vscode.commands.registerCommand('cursor-toys.cursorPet.reset', async () => {
      const service = CursorPetService.getInstance();
      if (!service) {
        return;
      }
      await service.resetPet();
    }),
    vscode.commands.registerCommand('cursor-toys.cursorPet.debugMenu', async () => {
      const service = CursorPetService.getInstance();
      if (service) {
        await service.showDebugMenu();
      }
    }),
    vscode.commands.registerCommand('cursor-toys.cursorPet.feedHelp', async () => {
      const service = CursorPetService.getInstance();
      if (service) {
        await service.showFeedHelp();
      } else {
        await vscode.window.showInformationMessage(
          'Enable Cursor Pet first, then use code edits and agent chat to feed and play.'
        );
      }
    }),
    vscode.commands.registerCommand('cursor-toys.cursorPet.discipline', () => {
      CursorPetService.getInstance()?.disciplinePet();
    }),
    vscode.commands.registerCommand('cursor-toys.cursorPet.lightsOff', () => {
      CursorPetService.getInstance()?.lightsOff();
    })
  );
  await CursorPetService.initialize(context);
}
