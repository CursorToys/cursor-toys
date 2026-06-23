import {
  createEmptyActivityScores,
  createInitialCare,
  createInitialLife,
  createInitialVitals,
  nowIso,
  type CursorPetState,
  type EggSkin,
  type PetArchetype,
} from './types';
import { initializeLifeOnHatch } from './cursorPetTamagotchi';

export type CursorPetDebugScenario =
  | 'advance_incubation'
  | 'force_hatch_balanced'
  | 'force_hatch_chatling'
  | 'force_hatch_coder'
  | 'low_vitals'
  | 'max_vitals'
  | 'starvation'
  | 'unhappy'
  | 'egg_selection';

export interface CursorPetDebugOption {
  id: CursorPetDebugScenario;
  label: string;
  description: string;
}

export const CURSOR_PET_DEBUG_OPTIONS: CursorPetDebugOption[] = [
  {
    id: 'advance_incubation',
    label: 'Advance incubation (+50%)',
    description: 'Bump egg progress to preview hatching soon',
  },
  {
    id: 'force_hatch_chatling',
    label: 'Force hatch: chatling',
    description: 'Skip to alive phase with chat-heavy archetype',
  },
  {
    id: 'force_hatch_coder',
    label: 'Force hatch: coder',
    description: 'Skip to alive phase with code-heavy archetype',
  },
  {
    id: 'force_hatch_balanced',
    label: 'Force hatch: balanced',
    description: 'Skip to alive phase with balanced archetype',
  },
  {
    id: 'low_vitals',
    label: 'Low vitals warning',
    description: 'Set hunger and happiness below warning threshold',
  },
  {
    id: 'max_vitals',
    label: 'Full care boost',
    description: 'Max hunger and happiness',
  },
  {
    id: 'starvation',
    label: 'Simulate starvation',
    description: 'Trigger death from zero hunger',
  },
  {
    id: 'unhappy',
    label: 'Simulate loneliness',
    description: 'Trigger death from zero happiness',
  },
  {
    id: 'egg_selection',
    label: 'Back to egg selection',
    description: 'Reset to choose a new egg',
  },
];

function touch(state: CursorPetState, ts: string): CursorPetState {
  return { ...state, updatedAt: ts };
}

function ensureEgg(state: CursorPetState, ts: string): CursorPetState {
  if (state.phase === 'egg_selection') {
    const egg: EggSkin = 'ember';
    return touch(
      {
        ...state,
        phase: 'incubating',
        selectedEgg: egg,
        incubation: {
          progress: 0,
          targetPoints: state.incubation.targetPoints,
          scores: createEmptyActivityScores(),
          startedAt: ts,
        },
      },
      ts
    );
  }
  return state;
}

function forceHatch(state: CursorPetState, archetype: PetArchetype, ts: string): CursorPetState {
  const base = ensureEgg(state, ts);
  const scores =
    archetype === 'chatling'
      ? { chat: 100, code: 10, explore: 10 }
      : archetype === 'coder'
        ? { chat: 10, code: 100, explore: 10 }
        : { chat: 40, code: 40, explore: 40 };

  return touch(
    {
      ...base,
      phase: 'alive',
      archetype,
      selectedEgg: base.selectedEgg ?? 'ember',
      incubation: {
        ...base.incubation,
        progress: base.incubation.targetPoints,
        scores,
      },
      vitals: createInitialVitals(ts),
      life: initializeLifeOnHatch(ts),
      care: createInitialCare(),
      lifecycle: {
        hatchedAt: ts,
        diedAt: null,
        deathReason: null,
      },
    },
    ts
  );
}

/**
 * Applies an internal debug scenario to pet state (debug mode only).
 */
export function applyCursorPetDebugScenario(
  state: CursorPetState,
  scenario: CursorPetDebugScenario,
  lowVitalsThreshold: number
): CursorPetState {
  const ts = nowIso();

  switch (scenario) {
    case 'advance_incubation': {
      const base = ensureEgg(state, ts);
      const bump = Math.max(10, base.incubation.targetPoints * 0.5);
      const progress = Math.min(base.incubation.targetPoints - 1, base.incubation.progress + bump);
      return touch(
        {
          ...base,
          phase: 'incubating',
          incubation: {
            ...base.incubation,
            progress,
            scores: { ...base.incubation.scores, chat: base.incubation.scores.chat + bump },
          },
        },
        ts
      );
    }
    case 'force_hatch_chatling':
      return forceHatch(state, 'chatling', ts);
    case 'force_hatch_coder':
      return forceHatch(state, 'coder', ts);
    case 'force_hatch_balanced':
      return forceHatch(state, 'balanced', ts);
    case 'low_vitals': {
      const base = state.phase === 'alive' ? state : forceHatch(state, 'balanced', ts);
      const value = Math.max(1, lowVitalsThreshold - 5);
      return touch(
        {
          ...base,
          phase: 'alive',
          vitals: {
            ...base.vitals,
            hunger: value,
            happiness: value,
          },
        },
        ts
      );
    }
    case 'max_vitals': {
      const base = state.phase === 'alive' ? state : forceHatch(state, 'balanced', ts);
      return touch(
        {
          ...base,
          phase: 'alive',
          vitals: {
            ...base.vitals,
            hunger: 100,
            happiness: 100,
            lastFedAt: ts,
            lastPlayedAt: ts,
          },
        },
        ts
      );
    }
    case 'starvation': {
      const base = state.phase === 'alive' ? state : forceHatch(state, 'balanced', ts);
      return touch(
        {
          ...base,
          phase: 'dead',
          vitals: { ...base.vitals, hunger: 0, happiness: base.vitals.happiness },
          lifecycle: {
            ...base.lifecycle,
            diedAt: ts,
            deathReason: 'starvation',
          },
        },
        ts
      );
    }
    case 'unhappy': {
      const base = state.phase === 'alive' ? state : forceHatch(state, 'balanced', ts);
      return touch(
        {
          ...base,
          phase: 'dead',
          vitals: { ...base.vitals, happiness: 0, hunger: base.vitals.hunger },
          lifecycle: {
            ...base.lifecycle,
            diedAt: ts,
            deathReason: 'unhappy',
          },
        },
        ts
      );
    }
    case 'egg_selection':
      return touch(
        {
          ...state,
          phase: 'egg_selection',
          selectedEgg: null,
          archetype: null,
          incubation: {
            progress: 0,
            targetPoints: state.incubation.targetPoints,
            scores: createEmptyActivityScores(),
            startedAt: null,
          },
          vitals: createInitialVitals(ts),
          life: createInitialLife(),
          care: createInitialCare(),
          lifecycle: {
            hatchedAt: null,
            diedAt: null,
            deathReason: null,
          },
        },
        ts
      );
    default:
      return state;
  }
}
