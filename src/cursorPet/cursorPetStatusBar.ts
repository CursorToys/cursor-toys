import type { CursorPetViewModel } from './types';

export interface CursorPetStatusBarPresentation {
  text: string;
  tooltip: string;
}

/**
 * Builds status bar label and tooltip for the current pet view model.
 */
export function buildCursorPetStatusBarPresentation(
  vm: CursorPetViewModel
): CursorPetStatusBarPresentation {
  const label = 'Cursor Pet:';

  if (vm.phase === 'alive') {
    const hunger = vm.hungerHearts;
    const happiness = vm.happinessHearts;
    const stage = vm.lifeStage ?? 'pet';
    const vitals = `${hunger}/4 hunger · ${happiness}/4 joy · day ${vm.gameDay.toFixed(1)}`;
    if (vm.needsAttention) {
      return {
        text: `$(bell) ${label} Attention!`,
        tooltip: `${vitals}. Click to open Cursor Pet.`,
      };
    }
    if (vm.sick) {
      return {
        text: `$(issue-opened) ${label} Sick`,
        tooltip: `${vitals}. Use cursor_pet_medicine via CursorToys MCP. Click to open.`,
      };
    }
    if (vm.lowVitalsWarning) {
      return {
        text: `$(warning) ${label} Needs care`,
        tooltip: `${vitals}. Click to open Cursor Pet.`,
      };
    }
    if (hunger >= 3 && happiness >= 3) {
      return {
        text: `$(smiley) ${label} ${stage}`,
        tooltip: `${vitals} · ${vm.archetype ?? 'pet'}. Click to open Cursor Pet.`,
      };
    }
    return {
      text: `$(heart) ${label} ${stage}`,
      tooltip: `${vitals} · ${vm.archetype ?? 'pet'}. Click to open Cursor Pet.`,
    };
  }

  if (vm.phase === 'incubating') {
    const pct =
      vm.incubationTarget > 0
        ? Math.round((vm.incubationProgress / vm.incubationTarget) * 100)
        : 0;
    return {
      text: `$(sync~spin) ${label} Incubating ${pct}%`,
      tooltip: `Egg is incubating (${vm.selectedEgg ?? 'egg'}). Click to open Cursor Pet.`,
    };
  }

  if (vm.phase === 'dead') {
    return {
      text: `$(skull) ${label} RIP`,
      tooltip: 'Your pet passed away. Click to choose a new egg.',
    };
  }

  return {
    text: `$(egg) ${label} Choose egg`,
    tooltip: 'Pick an egg to start incubation. Click to open Cursor Pet.',
  };
}
