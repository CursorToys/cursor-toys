export type CursorPetPhase = 'egg_selection' | 'incubating' | 'alive' | 'dead';
export type EggSkin = 'ember' | 'mist' | 'moss';
export type PetArchetype = 'chatling' | 'coder' | 'balanced';
export type PetLifeStage = 'baby' | 'child' | 'teen' | 'adult' | 'elder';
export type AdultOutcome = 'good' | 'neutral' | 'poor' | null;
export type ActivityCategory = 'chat' | 'code' | 'explore' | 'heartbeat';
export type DeathReason =
  | 'starvation'
  | 'unhappy'
  | 'neglect'
  | 'sickness'
  | 'old_age'
  | 'no_tokens';

export interface ActivityScores {
  chat: number;
  code: number;
  explore: number;
}

export interface CursorPetVitals {
  hunger: number;
  happiness: number;
  lastFedAt: string;
  lastPlayedAt: string;
}

export interface CursorPetLife {
  gameDay: number;
  stage: PetLifeStage;
  careQuality: number;
  adultOutcome: AdultOutcome;
  hatchedAt: string | null;
}

export interface CursorPetCare {
  careMistakes: number;
  neglectTicks: number;
  attentionHunger: boolean;
  attentionHappiness: boolean;
  attentionSince: string | null;
  sick: boolean;
  sickTicks: number;
  poop: number;
  dirty: number;
  sleeping: boolean;
  lightsOn: boolean;
  lightsNeglectTicks: number;
  discipline: number;
  tantrum: boolean;
  treatAbuse: number;
}

export interface CursorPetLifecycle {
  hatchedAt: string | null;
  diedAt: string | null;
  deathReason: DeathReason | null;
}

export interface CursorPetIncubation {
  progress: number;
  targetPoints: number;
  scores: ActivityScores;
  startedAt: string | null;
}

export interface CursorPetState {
  schemaVersion: 2;
  phase: CursorPetPhase;
  selectedEgg: EggSkin | null;
  archetype: PetArchetype | null;
  incubation: CursorPetIncubation;
  vitals: CursorPetVitals;
  life: CursorPetLife;
  care: CursorPetCare;
  lifecycle: CursorPetLifecycle;
  lastActivityAt: string;
  lastAgentActivityAt: string;
  agentSessionActive: boolean;
  updatedAt: string;
}

export interface PetActivityEvent {
  ts: string;
  event: string;
  category: ActivityCategory;
  weight: number;
}

export interface CursorPetEngineConfig {
  incubationTargetPoints: number;
  hungerDecayPerTick: number;
  happinessDecayPerTick: number;
  lowVitalsWarningThreshold: number;
  feedGain: number;
  playGain: number;
  stopHappinessBonus: number;
  treatHappinessGain: number;
  decayIntervalMinutes: number;
  minutesPerGameDay: number;
  maxGameDays: number;
  stageBabyDays: number;
  stageChildDays: number;
  stageTeenDays: number;
  stageAdultDays: number;
  attentionGraceTicks: number;
  neglectDeathTicks: number;
  careMistakesBeforeDeath: number;
  poopChancePerTick: number;
  dirtyThresholdForSickness: number;
  sickTicksBeforeDeath: number;
  tantrumChancePerTick: number;
  treatAbuseThreshold: number;
  lightsOnHour: number;
  lightsOffHour: number;
  lightsNeglectTicksBeforeMistake: number;
  tokenDeathEnabled: boolean;
}

export interface CursorPetViewModel {
  phase: CursorPetPhase;
  selectedEgg: EggSkin | null;
  archetype: PetArchetype | null;
  lifeStage: PetLifeStage | null;
  gameDay: number;
  adultOutcome: AdultOutcome;
  hunger: number;
  happiness: number;
  hungerHearts: number;
  happinessHearts: number;
  incubationProgress: number;
  incubationTarget: number;
  visualState:
    | 'egg_select'
    | 'egg_wobble'
    | 'hatching'
    | 'idle'
    | 'eating'
    | 'playing'
    | 'sad'
    | 'sleeping'
    | 'sick'
    | 'dead';
  lowVitalsWarning: boolean;
  needsAttention: boolean;
  sick: boolean;
  tantrum: boolean;
  sleeping: boolean;
  lightsOn: boolean;
  poop: number;
  careMistakes: number;
  discipline: number;
  careQuality: number;
  deathReason: DeathReason | null;
  lastActivityAt: string;
  lastAgentActivityAt: string;
  agentActive: boolean;
}

export const DEFAULT_ENGINE_CONFIG: CursorPetEngineConfig = {
  incubationTargetPoints: 100,
  hungerDecayPerTick: 4,
  happinessDecayPerTick: 3,
  lowVitalsWarningThreshold: 25,
  feedGain: 12,
  playGain: 10,
  stopHappinessBonus: 5,
  treatHappinessGain: 18,
  decayIntervalMinutes: 30,
  minutesPerGameDay: 60,
  maxGameDays: 25,
  stageBabyDays: 2,
  stageChildDays: 5,
  stageTeenDays: 10,
  stageAdultDays: 20,
  attentionGraceTicks: 3,
  neglectDeathTicks: 8,
  careMistakesBeforeDeath: 6,
  poopChancePerTick: 0.12,
  dirtyThresholdForSickness: 4,
  sickTicksBeforeDeath: 12,
  tantrumChancePerTick: 0.06,
  treatAbuseThreshold: 4,
  lightsOnHour: 6,
  lightsOffHour: 20,
  lightsNeglectTicksBeforeMistake: 2,
  tokenDeathEnabled: true,
};

export const CATEGORY_WEIGHTS: Record<ActivityCategory, number> = {
  chat: 2,
  code: 3,
  explore: 2,
  heartbeat: 1,
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function createEmptyActivityScores(): ActivityScores {
  return { chat: 0, code: 0, explore: 0 };
}

export function createInitialVitals(ts: string): CursorPetVitals {
  return {
    hunger: 80,
    happiness: 80,
    lastFedAt: ts,
    lastPlayedAt: ts,
  };
}

export function createInitialLife(): CursorPetLife {
  return {
    gameDay: 0,
    stage: 'baby',
    careQuality: 50,
    adultOutcome: null,
    hatchedAt: null,
  };
}

export function createInitialCare(): CursorPetCare {
  return {
    careMistakes: 0,
    neglectTicks: 0,
    attentionHunger: false,
    attentionHappiness: false,
    attentionSince: null,
    sick: false,
    sickTicks: 0,
    poop: 0,
    dirty: 0,
    sleeping: false,
    lightsOn: true,
    lightsNeglectTicks: 0,
    discipline: 0,
    tantrum: false,
    treatAbuse: 0,
  };
}

export function createInitialCursorPetState(
  targetPoints = DEFAULT_ENGINE_CONFIG.incubationTargetPoints
): CursorPetState {
  const ts = nowIso();
  return {
    schemaVersion: 2,
    phase: 'egg_selection',
    selectedEgg: null,
    archetype: null,
    incubation: {
      progress: 0,
      targetPoints,
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
    lastActivityAt: ts,
    lastAgentActivityAt: ts,
    agentSessionActive: false,
    updatedAt: ts,
  };
}
