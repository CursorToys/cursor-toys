import * as vscode from 'vscode';
import {
  DEFAULT_ENGINE_CONFIG,
  type CursorPetEngineConfig,
} from './types';

/**
 * Updates VS Code context keys for the Cursor Pet feature.
 */
export async function syncCursorPetContext(): Promise<void> {
  const enabled = isCursorPetEnabled();
  await vscode.commands.executeCommand('setContext', 'cursorToys.cursorPet.enabled', enabled);
  await vscode.commands.executeCommand(
    'setContext',
    'cursorToys.cursorPet.debugMode',
    isCursorPetDebugMode()
  );
}

export function isCursorPetDebugMode(): boolean {
  return vscode.workspace.getConfiguration('cursorToys').get<boolean>('cursorPet.debugMode', false);
}

export function isCursorPetEnabled(): boolean {
  return vscode.workspace.getConfiguration('cursorToys').get<boolean>('cursorPet.enabled', false);
}

export function getCursorPetEngineConfig(): CursorPetEngineConfig {
  const config = vscode.workspace.getConfiguration('cursorToys');
  const decayIntervalMinutes = config.get<number>(
    'cursorPet.decayIntervalMinutes',
    DEFAULT_ENGINE_CONFIG.decayIntervalMinutes
  );
  return {
    incubationTargetPoints: config.get<number>(
      'cursorPet.incubationTargetPoints',
      DEFAULT_ENGINE_CONFIG.incubationTargetPoints
    ),
    hungerDecayPerTick: config.get<number>(
      'cursorPet.hungerDecayPerTick',
      DEFAULT_ENGINE_CONFIG.hungerDecayPerTick
    ),
    happinessDecayPerTick: config.get<number>(
      'cursorPet.happinessDecayPerTick',
      DEFAULT_ENGINE_CONFIG.happinessDecayPerTick
    ),
    lowVitalsWarningThreshold: config.get<number>(
      'cursorPet.lowVitalsWarningThreshold',
      DEFAULT_ENGINE_CONFIG.lowVitalsWarningThreshold
    ),
    feedGain: DEFAULT_ENGINE_CONFIG.feedGain,
    playGain: DEFAULT_ENGINE_CONFIG.playGain,
    stopHappinessBonus: DEFAULT_ENGINE_CONFIG.stopHappinessBonus,
    treatHappinessGain: DEFAULT_ENGINE_CONFIG.treatHappinessGain,
    decayIntervalMinutes,
    minutesPerGameDay: config.get<number>(
      'cursorPet.minutesPerGameDay',
      DEFAULT_ENGINE_CONFIG.minutesPerGameDay
    ),
    maxGameDays: config.get<number>('cursorPet.maxGameDays', DEFAULT_ENGINE_CONFIG.maxGameDays),
    stageBabyDays: DEFAULT_ENGINE_CONFIG.stageBabyDays,
    stageChildDays: DEFAULT_ENGINE_CONFIG.stageChildDays,
    stageTeenDays: DEFAULT_ENGINE_CONFIG.stageTeenDays,
    stageAdultDays: DEFAULT_ENGINE_CONFIG.stageAdultDays,
    attentionGraceTicks: DEFAULT_ENGINE_CONFIG.attentionGraceTicks,
    neglectDeathTicks: DEFAULT_ENGINE_CONFIG.neglectDeathTicks,
    careMistakesBeforeDeath: DEFAULT_ENGINE_CONFIG.careMistakesBeforeDeath,
    poopChancePerTick: DEFAULT_ENGINE_CONFIG.poopChancePerTick,
    dirtyThresholdForSickness: DEFAULT_ENGINE_CONFIG.dirtyThresholdForSickness,
    sickTicksBeforeDeath: DEFAULT_ENGINE_CONFIG.sickTicksBeforeDeath,
    tantrumChancePerTick: DEFAULT_ENGINE_CONFIG.tantrumChancePerTick,
    treatAbuseThreshold: DEFAULT_ENGINE_CONFIG.treatAbuseThreshold,
    lightsOnHour: DEFAULT_ENGINE_CONFIG.lightsOnHour,
    lightsOffHour: DEFAULT_ENGINE_CONFIG.lightsOffHour,
    lightsNeglectTicksBeforeMistake: DEFAULT_ENGINE_CONFIG.lightsNeglectTicksBeforeMistake,
    tokenDeathEnabled: config.get<boolean>(
      'cursorPet.tokenDeathEnabled',
      DEFAULT_ENGINE_CONFIG.tokenDeathEnabled
    ),
  };
}

export function getCursorPetDecayIntervalMs(): number {
  if (isCursorPetDebugMode()) {
    return 5_000;
  }
  const minutes = vscode.workspace
    .getConfiguration('cursorToys')
    .get<number>('cursorPet.decayIntervalMinutes', 30);
  return Math.max(1, minutes) * 60 * 1000;
}

export function shouldAutoInstallCursorPetHooks(): boolean {
  return vscode.workspace.getConfiguration('cursorToys').get<boolean>('cursorPet.autoInstallHooks', true);
}

export function shouldShowCursorPetStatusBar(): boolean {
  return (
    isCursorPetEnabled() &&
    vscode.workspace.getConfiguration('cursorToys').get<boolean>('cursorPet.showStatusBar', false)
  );
}
