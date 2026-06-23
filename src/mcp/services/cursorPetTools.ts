import * as vscode from 'vscode';
import { isCursorPetEnabled } from '../../cursorPet/cursorPetConfig';
import { CursorPetService } from '../../cursorPet/cursorPetService';
import type { EggSkin } from '../../cursorPet/types';

function requireService(): CursorPetService {
  if (!isCursorPetEnabled()) {
    throw new Error('Cursor Pet is disabled. Enable cursorToys.cursorPet.enabled first.');
  }
  const service = CursorPetService.getInstance();
  if (!service) {
    throw new Error('Cursor Pet service is not active');
  }
  return service;
}

function isEggSkin(value: unknown): value is EggSkin {
  return value === 'ember' || value === 'mist' || value === 'moss';
}

function parseOptionalWeight(args: Record<string, unknown>): number {
  const weight = args.weight;
  if (typeof weight === 'number' && weight > 0) {
    return weight;
  }
  return 1;
}

export async function cursorPetStatus(): Promise<unknown> {
  const enabled = isCursorPetEnabled();
  if (!enabled) {
    return { enabled: false };
  }
  const service = CursorPetService.getInstance();
  if (!service) {
    return { enabled: true, active: false };
  }
  return {
    enabled: true,
    active: true,
    state: service.getState(),
    viewModel: service.getViewModel(),
    bridgeInstalled: service.isBridgeInstalled(),
  };
}

export async function cursorPetSelectEgg(args: Record<string, unknown>): Promise<unknown> {
  const egg = args.egg;
  if (!isEggSkin(egg)) {
    throw new Error('egg must be one of: ember, mist, moss');
  }
  const service = requireService();
  await service.selectEgg(egg);
  return { ok: true, viewModel: service.getViewModel() };
}

export async function cursorPetFeed(): Promise<unknown> {
  const service = requireService();
  return {
    ok: true,
    organicOnly: true,
    message: 'Feeding is editor-only: code edits and shell hooks increase hunger. No manual feed button.',
    viewModel: service.getViewModel(),
  };
}

export async function cursorPetPlay(args: Record<string, unknown>): Promise<unknown> {
  const service = requireService();
  const before = service.getState();
  if (before.phase !== 'alive') {
    return {
      ok: false,
      message: 'Pet must be alive to play.',
      viewModel: service.getViewModel(),
    };
  }
  if (before.care.sick) {
    return {
      ok: false,
      message: 'Pet is sick — give medicine first.',
      viewModel: service.getViewModel(),
    };
  }
  const weight = parseOptionalWeight(args);
  service.playPet(weight);
  return {
    ok: true,
    message: 'Played with the pet (+happiness).',
    weight,
    viewModel: service.getViewModel(),
  };
}

export async function cursorPetReset(): Promise<unknown> {
  const service = requireService();
  await service.resetPet();
  return { ok: true, viewModel: service.getViewModel() };
}

export async function cursorPetRefresh(): Promise<unknown> {
  const service = requireService();
  return {
    ok: true,
    viewModel: service.getViewModel(),
    bridgeInstalled: service.isBridgeInstalled(),
  };
}

export async function cursorPetInstallHooks(): Promise<unknown> {
  const service = requireService();
  await service.installHooks();
  return { ok: true, bridgeInstalled: service.isBridgeInstalled() };
}

export async function cursorPetOpen(): Promise<unknown> {
  await vscode.commands.executeCommand('cursor-toys.cursorPet.focusView');
  return { ok: true };
}

export async function cursorPetClean(): Promise<unknown> {
  const service = requireService();
  const before = service.getState();
  if (before.phase !== 'alive') {
    return {
      ok: false,
      message: 'Pet must be alive to clean.',
      viewModel: service.getViewModel(),
    };
  }
  if (before.care.poop <= 0) {
    return {
      ok: false,
      message: 'Nothing to clean — no mess on screen.',
      viewModel: service.getViewModel(),
    };
  }
  service.cleanPet();
  return {
    ok: true,
    message: 'Pet area cleaned.',
    viewModel: service.getViewModel(),
  };
}

export async function cursorPetMedicine(): Promise<unknown> {
  const service = requireService();
  const before = service.getState();
  if (before.phase !== 'alive') {
    return {
      ok: false,
      message: 'Pet must be alive to give medicine.',
      viewModel: service.getViewModel(),
    };
  }
  if (!before.care.sick) {
    return {
      ok: false,
      message: 'Pet is not sick — medicine not needed.',
      viewModel: service.getViewModel(),
    };
  }
  service.medicatePet();
  return {
    ok: true,
    message: 'Medicine administered — pet recovered from sickness.',
    viewModel: service.getViewModel(),
  };
}

export async function cursorPetDiscipline(): Promise<unknown> {
  const service = requireService();
  const before = service.getState();
  if (before.phase !== 'alive') {
    return {
      ok: false,
      message: 'Pet must be alive to discipline.',
      viewModel: service.getViewModel(),
    };
  }
  if (!before.care.tantrum) {
    return {
      ok: false,
      message: 'Pet is not having a tantrum.',
      viewModel: service.getViewModel(),
    };
  }
  service.disciplinePet();
  return {
    ok: true,
    message: 'Disciplined during tantrum (+training).',
    viewModel: service.getViewModel(),
  };
}

export async function cursorPetLightsOff(): Promise<unknown> {
  const service = requireService();
  const vm = service.getViewModel();
  if (vm.phase !== 'alive') {
    return {
      ok: false,
      message: 'Pet must be alive to turn off lights.',
      viewModel: vm,
    };
  }
  if (!vm.sleeping) {
    return {
      ok: false,
      message: 'Pet is not sleeping — lights stay as they are.',
      viewModel: vm,
    };
  }
  if (!vm.lightsOn) {
    return {
      ok: false,
      message: 'Lights are already off.',
      viewModel: vm,
    };
  }
  service.lightsOff();
  return {
    ok: true,
    message: 'Lights turned off for sleeping pet.',
    viewModel: service.getViewModel(),
  };
}

export async function cursorPetTreat(args: Record<string, unknown>): Promise<unknown> {
  const service = requireService();
  const before = service.getState();
  if (before.phase !== 'alive') {
    return {
      ok: false,
      message: 'Pet must be alive to give a treat.',
      viewModel: service.getViewModel(),
    };
  }
  const weight = parseOptionalWeight(args);
  service.treatPet(weight);
  return {
    ok: true,
    message: 'Treat given (+happiness). Overuse causes sickness.',
    weight,
    viewModel: service.getViewModel(),
  };
}
