import {
  CATEGORY_WEIGHTS,
  createEmptyActivityScores,
  createInitialCare,
  createInitialLife,
  createInitialVitals,
  nowIso,
  type ActivityCategory,
  type CursorPetEngineConfig,
  type CursorPetState,
  type CursorPetViewModel,
  type DeathReason,
  type EggSkin,
  type PetActivityEvent,
  type PetArchetype,
} from './types';
import { vitalsToHearts } from './cursorPetHearts';
import {
  advanceLifeOnTick,
  applyCareActivity,
  initializeLifeOnHatch,
  processCareTick,
} from './cursorPetTamagotchi';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function touchState(state: CursorPetState, ts: string): CursorPetState {
  return { ...state, updatedAt: ts };
}

function resolveArchetype(scores: { chat: number; code: number; explore: number }): PetArchetype {
  const total = scores.chat + scores.code + scores.explore;
  if (total <= 0) {
    return 'balanced';
  }
  const chatRatio = scores.chat / total;
  const codeRatio = scores.code / total;
  const exploreRatio = scores.explore / total;
  const maxRatio = Math.max(chatRatio, codeRatio, exploreRatio);
  const minRatio = Math.min(chatRatio, codeRatio, exploreRatio);
  if (maxRatio - minRatio <= 0.15) {
    return 'balanced';
  }
  if (scores.chat >= scores.code && scores.chat >= scores.explore) {
    return 'chatling';
  }
  if (scores.code >= scores.chat && scores.code >= scores.explore) {
    return 'coder';
  }
  return 'balanced';
}

function markDead(state: CursorPetState, reason: DeathReason, ts: string): CursorPetState {
  return touchState(
    {
      ...state,
      phase: 'dead',
      agentSessionActive: false,
      lifecycle: {
        ...state.lifecycle,
        diedAt: ts,
        deathReason: reason,
      },
    },
    ts
  );
}

function hatch(state: CursorPetState, ts: string): CursorPetState {
  const archetype = resolveArchetype(state.incubation.scores);
  const life = initializeLifeOnHatch(ts);
  return touchState(
    {
      ...state,
      phase: 'alive',
      archetype,
      vitals: createInitialVitals(ts),
      life,
      care: createInitialCare(),
      incubation: {
        ...state.incubation,
        progress: state.incubation.targetPoints,
      },
      lifecycle: {
        hatchedAt: ts,
        diedAt: null,
        deathReason: null,
      },
    },
    ts
  );
}

function applyIncubationActivity(
  state: CursorPetState,
  event: PetActivityEvent,
  _config: CursorPetEngineConfig,
  ts: string
): CursorPetState {
  if (state.phase !== 'incubating' || event.category === 'heartbeat') {
    return state;
  }
  const weight = event.weight * (CATEGORY_WEIGHTS[event.category] ?? 1);
  const scores = { ...state.incubation.scores };
  if (event.category === 'chat') {
    scores.chat += weight;
  } else if (event.category === 'code') {
    scores.code += weight;
  } else if (event.category === 'explore') {
    scores.explore += weight;
  }
  const progress = Math.min(state.incubation.targetPoints, state.incubation.progress + weight);
  const next: CursorPetState = touchState(
    {
      ...state,
      incubation: {
        ...state.incubation,
        progress,
        scores,
      },
      lastActivityAt: ts,
      lastAgentActivityAt:
        event.category === 'chat' || event.category === 'explore' ? ts : state.lastAgentActivityAt,
    },
    ts
  );
  if (progress >= state.incubation.targetPoints) {
    return hatch(next, ts);
  }
  return next;
}

/**
 * Selects an egg skin and starts incubation.
 */
export function selectEgg(state: CursorPetState, egg: EggSkin, ts = nowIso()): CursorPetState {
  if (state.phase !== 'egg_selection' && state.phase !== 'dead') {
    return state;
  }
  return touchState(
    {
      ...state,
      phase: 'incubating',
      selectedEgg: egg,
      archetype: null,
      incubation: {
        progress: 0,
        targetPoints: state.incubation.targetPoints,
        scores: createEmptyActivityScores(),
        startedAt: ts,
      },
      vitals: createInitialVitals(ts),
      life: createInitialLife(),
      care: createInitialCare(),
      lifecycle: {
        hatchedAt: null,
        diedAt: null,
        deathReason: null,
      },
      lastActivityAt: ts,
      agentSessionActive: false,
    },
    ts
  );
}

const AGENT_SESSION_STOP_EVENTS = new Set(['subagentStop', 'stop', 'sessionEnd']);
const AGENT_SESSION_START_EVENTS = new Set([
  'subagentStart',
  'beforeSubmitPrompt',
  'afterAgentResponse',
  'postToolUse',
  'afterMCPExecution',
  'agentTranscriptChange',
  'agentTranscriptPoll',
]);

function resolveAgentSessionActive(state: CursorPetState, event: PetActivityEvent): boolean {
  if (AGENT_SESSION_STOP_EVENTS.has(event.event)) {
    return false;
  }
  if (AGENT_SESSION_START_EVENTS.has(event.event)) {
    return true;
  }
  if (event.category === 'explore' && !AGENT_SESSION_STOP_EVENTS.has(event.event)) {
    return true;
  }
  return state.agentSessionActive;
}

const AGENT_IDLE_MS = 90_000;

/**
 * Returns whether the agent is considered active for pet animations.
 */
export function computeAgentActive(state: CursorPetState, now = Date.now()): boolean {
  if (!state.agentSessionActive) {
    return false;
  }
  const last = Date.parse(state.lastAgentActivityAt);
  if (Number.isNaN(last)) {
    return state.agentSessionActive;
  }
  return now - last < AGENT_IDLE_MS;
}

export function applyActivity(
  state: CursorPetState,
  event: PetActivityEvent,
  config: CursorPetEngineConfig
): CursorPetState {
  const ts = event.ts || nowIso();
  if (state.phase === 'dead' || state.phase === 'egg_selection') {
    if (event.category === 'heartbeat') {
      return touchState({ ...state, lastActivityAt: ts }, ts);
    }
    return state;
  }

  let next = touchState(
    {
      ...state,
      lastActivityAt: ts,
      lastAgentActivityAt:
        event.category === 'chat' || event.category === 'explore' ? ts : state.lastAgentActivityAt,
      agentSessionActive: resolveAgentSessionActive(state, event),
    },
    ts
  );

  if (state.phase === 'incubating') {
    next = applyIncubationActivity(next, event, config, ts);
  } else if (state.phase === 'alive') {
    next = applyCareActivity(next, event, config, ts);
  }

  return next;
}

/**
 * Applies periodic vitals decay and Tamagotchi care simulation.
 */
export function tick(state: CursorPetState, config: CursorPetEngineConfig, ts = nowIso()): CursorPetState {
  if (state.phase !== 'alive') {
    return state;
  }

  let next = advanceLifeOnTick(state, config, ts);
  if (next.phase === 'dead') {
    return next;
  }

  const hunger = clamp(next.vitals.hunger - config.hungerDecayPerTick, 0, 100);
  const happiness = clamp(next.vitals.happiness - config.happinessDecayPerTick, 0, 100);
  next = touchState(
    {
      ...next,
      vitals: {
        ...next.vitals,
        hunger,
        happiness,
      },
    },
    ts
  );

  return processCareTick(next, config, ts);
}

/**
 * Resets to egg selection after death.
 */
export function resetAfterDeath(state: CursorPetState, ts = nowIso()): CursorPetState {
  if (state.phase !== 'dead') {
    return state;
  }
  return touchState(
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
      agentSessionActive: false,
    },
    ts
  );
}

function resolveVisualState(state: CursorPetState, config: CursorPetEngineConfig): CursorPetViewModel['visualState'] {
  if (state.phase === 'egg_selection') {
    return 'egg_select';
  }
  if (state.phase === 'dead') {
    return 'dead';
  }
  if (state.phase === 'incubating') {
    const ratio =
      state.incubation.targetPoints > 0
        ? state.incubation.progress / state.incubation.targetPoints
        : 0;
    return ratio >= 0.95 ? 'hatching' : 'egg_wobble';
  }
  if (state.care.sick) {
    return 'sick';
  }
  if (state.care.sleeping && state.care.lightsOn) {
    return 'sleeping';
  }
  const low =
    state.vitals.hunger < config.lowVitalsWarningThreshold ||
    state.vitals.happiness < config.lowVitalsWarningThreshold;
  if (low) {
    return 'sad';
  }
  return 'idle';
}

/**
 * Builds a view model for webview and control panel rendering.
 */
export function buildViewModel(
  state: CursorPetState,
  config: CursorPetEngineConfig
): CursorPetViewModel {
  const lowVitalsWarning =
    state.phase === 'alive' &&
    (state.vitals.hunger < config.lowVitalsWarningThreshold ||
      state.vitals.happiness < config.lowVitalsWarningThreshold);

  const needsAttention =
    state.phase === 'alive' &&
    (state.care.attentionHunger || state.care.attentionHappiness);

  return {
    phase: state.phase,
    selectedEgg: state.selectedEgg,
    archetype: state.archetype,
    lifeStage: state.phase === 'alive' ? state.life.stage : null,
    gameDay: state.life.gameDay,
    adultOutcome: state.life.adultOutcome,
    hunger: state.vitals.hunger,
    happiness: state.vitals.happiness,
    hungerHearts: vitalsToHearts(state.vitals.hunger),
    happinessHearts: vitalsToHearts(state.vitals.happiness),
    incubationProgress: state.incubation.progress,
    incubationTarget: state.incubation.targetPoints,
    visualState: resolveVisualState(state, config),
    lowVitalsWarning,
    needsAttention,
    sick: state.care.sick,
    tantrum: state.care.tantrum,
    sleeping: state.care.sleeping,
    lightsOn: state.care.lightsOn,
    poop: state.care.poop,
    careMistakes: state.care.careMistakes,
    discipline: state.care.discipline,
    careQuality: state.life.careQuality,
    deathReason: state.lifecycle.deathReason,
    lastActivityAt: state.lastActivityAt,
    lastAgentActivityAt: state.lastAgentActivityAt,
    agentActive: computeAgentActive(state),
  };
}

export function categoryFromActivityEvent(event: PetActivityEvent): ActivityCategory {
  return event.category;
}
