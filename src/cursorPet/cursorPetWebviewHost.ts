import * as vscode from 'vscode';
import { getCursorPetEngineConfig } from './cursorPetConfig';
import { CursorPetService } from './cursorPetService';
import type { CursorPetPanelState } from './cursorPetPanelHtml';
import type { EggSkin } from './types';

export interface CursorPetInboundMessage {
  type: string;
  egg?: EggSkin;
  clicks?: number;
}

export type CursorPetWebviewLayout = 'panel' | 'sidebar';

/**
 * Prompts to enable Cursor Pet when the feature is turned off.
 */
export async function ensureCursorPetEnabled(): Promise<boolean> {
  if (vscode.workspace.getConfiguration('cursorToys').get<boolean>('cursorPet.enabled', false)) {
    return true;
  }
  const enable = await vscode.window.showInformationMessage(
    'Cursor Pet is disabled. Enable it in settings?',
    'Enable',
    'Cancel'
  );
  if (enable !== 'Enable') {
    return false;
  }
  await vscode.workspace
    .getConfiguration('cursorToys')
    .update('cursorPet.enabled', true, vscode.ConfigurationTarget.Global);
  return true;
}

/**
 * Builds webview state from the active pet service.
 */
export function buildCursorPetWebviewState(
  service: CursorPetService,
  layout: CursorPetWebviewLayout
): CursorPetPanelState {
  return {
    viewModel: service.getViewModel(),
    bridgeInstalled: service.isBridgeInstalled(),
    debugMode: service.isDebugMode(),
    lowVitalsThreshold: getCursorPetEngineConfig().lowVitalsWarningThreshold,
    layout,
  };
}

/**
 * Handles inbound messages from Cursor Pet webviews.
 */
export async function handleCursorPetWebviewMessage(
  msg: CursorPetInboundMessage,
  service: CursorPetService,
  onUpdated: () => void
): Promise<void> {
  if (msg.type === 'refresh') {
    onUpdated();
    return;
  }
  if (msg.type === 'beginNewEgg') {
    const current = service.getState();
    if (current.phase !== 'dead') {
      return;
    }
    const ok = await service.resetPet({ skipConfirm: true });
    if (ok) {
      onUpdated();
    }
    return;
  }
  if (msg.type === 'selectEgg' && msg.egg) {
    const ok = await service.selectEgg(msg.egg);
    if (ok) {
      onUpdated();
    }
    return;
  }
  if (msg.type === 'reset') {
    const ok = await service.resetPet();
    if (ok) {
      onUpdated();
    }
    return;
  }
  if (msg.type === 'debugMenu') {
    await service.showDebugMenu();
    onUpdated();
  }
  if (msg.type === 'petAngry') {
    service.handlePetAngry(msg.clicks);
    return;
  }
  if (msg.type === 'installHooks') {
    await service.installHooks();
    onUpdated();
    return;
  }
  if (msg.type === 'feedHelp') {
    await service.showFeedHelp();
    return;
  }
  if (msg.type === 'discipline') {
    service.disciplinePet();
    onUpdated();
    return;
  }
  if (msg.type === 'lightsOff') {
    service.lightsOff();
    onUpdated();
    return;
  }
}
