import { PET_MAX_HEARTS, vitalsToHearts } from './cursorPetHearts';
import {
  createInitialLife,
  nowIso,
  type CursorPetCare,
  type CursorPetEngineConfig,
  type CursorPetLife,
  type CursorPetState,
  type DeathReason,
  type PetActivityEvent,
  type PetLifeStage,
} from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function getHourOfDay(ts = nowIso()): number {
  return new Date(ts).getHours();
}

export function isNightHour(hour: number, config: CursorPetEngineConfig): boolean {
  if (config.lightsOnHour < config.lightsOffHour) {
    return hour >= config.lightsOffHour || hour < config.lightsOnHour;
  }
  return hour >= config.lightsOffHour && hour < config.lightsOnHour;
}

/**
 * Resolves life stage from accumulated game days.
 */
export function resolveLifeStage(gameDay: number, config: CursorPetEngineConfig): PetLifeStage {
  if (gameDay < config.stageBabyDays) {
    return 'baby';
  }
  if (gameDay < config.stageChildDays) {
    return 'child';
  }
  if (gameDay < config.stageTeenDays) {
    return 'teen';
  }
  if (gameDay < config.stageAdultDays) {
    return 'adult';
  }
  return 'elder';
}

function touchLife(life: CursorPetLife, gameDay: number, config: CursorPetEngineConfig): CursorPetLife {
  const stage = resolveLifeStage(gameDay, config);
  let adultOutcome = life.adultOutcome;
  if (stage === 'adult' && life.stage !== 'adult') {
    if (life.careQuality >= 70) {
      adultOutcome = 'good';
    } else if (life.careQuality >= 40) {
      adultOutcome = 'neutral';
    } else {
      adultOutcome = 'poor';
    }
  }
  return { ...life, gameDay, stage, adultOutcome };
}

function bumpCareQuality(life: CursorPetLife, delta: number): CursorPetLife {
  return { ...life, careQuality: clamp(life.careQuality + delta, 0, 100) };
}

function markDead(state: CursorPetState, reason: DeathReason, ts: string): CursorPetState {
  return {
    ...state,
    phase: 'dead',
    agentSessionActive: false,
    lifecycle: {
      ...state.lifecycle,
      diedAt: ts,
      deathReason: reason,
    },
    updatedAt: ts,
  };
}

function clearAttention(care: CursorPetCare): CursorPetCare {
  return {
    ...care,
    attentionHunger: false,
    attentionHappiness: false,
    attentionSince: null,
  };
}

/**
 * Initializes life tracking when the pet hatches.
 */
export function initializeLifeOnHatch(ts: string): CursorPetLife {
  return {
    ...createInitialLife(),
    hatchedAt: ts,
  };
}

/**
 * Advances game-day clock and life stage on periodic ticks.
 */
export function advanceLifeOnTick(
  state: CursorPetState,
  config: CursorPetEngineConfig,
  ts: string
): CursorPetState {
  if (state.phase !== 'alive') {
    return state;
  }
  const minutesPerDay = Math.max(1, config.minutesPerGameDay);
  const dayAdvance = config.decayIntervalMinutes / minutesPerDay;
  const nextDay = state.life.gameDay + dayAdvance;
  const life = touchLife(state.life, nextDay, config);
  if (nextDay >= config.maxGameDays) {
    return markDead({ ...state, life }, 'old_age', ts);
  }
  return { ...state, life, updatedAt: ts };
}

/**
 * Tamagotchi care simulation for one decay tick.
 */
export function processCareTick(
  state: CursorPetState,
  config: CursorPetEngineConfig,
  ts: string
): CursorPetState {
  if (state.phase !== 'alive') {
    return state;
  }

  let care = { ...state.care };
  let life = state.life;
  const hour = getHourOfDay(ts);
  const night = isNightHour(hour, config);

  care.sleeping = night;
  if (night && care.lightsOn) {
    care.lightsNeglectTicks += 1;
    if (care.lightsNeglectTicks >= config.lightsNeglectTicksBeforeMistake) {
      care.careMistakes += 1;
      care.lightsNeglectTicks = 0;
      life = bumpCareQuality(life, -8);
    }
  } else if (!night) {
    care.lightsOn = true;
    care.lightsNeglectTicks = 0;
  }

  if (care.poop > 0) {
    care.dirty = clamp(care.dirty + 1, 0, 10);
    if (care.dirty >= config.dirtyThresholdForSickness && !care.sick) {
      care.sick = true;
      care.sickTicks = 0;
    }
  }

  if (Math.random() < config.poopChancePerTick && care.poop < 3) {
    care.poop += 1;
  }

  const hungerHearts = vitalsToHearts(state.vitals.hunger);
  const happyHearts = vitalsToHearts(state.vitals.happiness);

  if (hungerHearts <= 0 && !care.attentionHunger) {
    care.attentionHunger = true;
    care.attentionSince = ts;
  }
  if (happyHearts <= 0 && !care.attentionHappiness) {
    care.attentionHappiness = true;
    care.attentionSince = ts;
  }

  if (care.attentionHunger || care.attentionHappiness) {
    care.neglectTicks += 1;
    if (care.neglectTicks >= config.attentionGraceTicks) {
      care.careMistakes += 1;
      care.neglectTicks = 0;
      life = bumpCareQuality(life, -5);
      care = clearAttention(care);
    }
  } else {
    care.neglectTicks = 0;
  }

  if (
    !care.sick &&
    !care.tantrum &&
    hungerHearts >= PET_MAX_HEARTS &&
    happyHearts >= PET_MAX_HEARTS &&
    Math.random() < config.tantrumChancePerTick
  ) {
    care.tantrum = true;
  }

  if (care.sick) {
    care.sickTicks += 1;
    if (care.sickTicks >= config.sickTicksBeforeDeath) {
      return markDead({ ...state, care, life }, 'sickness', ts);
    }
  }

  if (care.careMistakes >= config.careMistakesBeforeDeath) {
    return markDead({ ...state, care, life }, 'neglect', ts);
  }

  if (hungerHearts <= 0 && care.neglectTicks >= config.neglectDeathTicks) {
    return markDead({ ...state, care, life }, 'starvation', ts);
  }
  if (happyHearts <= 0 && care.neglectTicks >= config.neglectDeathTicks) {
    return markDead({ ...state, care, life }, 'unhappy', ts);
  }

  return { ...state, care, life, updatedAt: ts };
}

/**
 * Applies Tamagotchi-specific activity handlers (clean, treat, medicine, etc.).
 */
export function applyCareActivity(
  state: CursorPetState,
  event: PetActivityEvent,
  config: CursorPetEngineConfig,
  ts: string
): CursorPetState {
  if (state.phase !== 'alive') {
    return state;
  }

  let care = { ...state.care };
  let life = state.life;
  let hunger = state.vitals.hunger;
  let happiness = state.vitals.happiness;

  if (event.event === 'petClean') {
    care.poop = 0;
    care.dirty = 0;
    life = bumpCareQuality(life, 2);
    return { ...state, care, life, updatedAt: ts };
  }

  if (event.event === 'petMedicine' && care.sick) {
    care.sick = false;
    care.sickTicks = 0;
    care.dirty = 0;
    life = bumpCareQuality(life, 4);
    return { ...state, care, life, updatedAt: ts };
  }

  if (event.event === 'petDiscipline' && care.tantrum) {
    care.tantrum = false;
    care.discipline = clamp(care.discipline + 12, 0, 100);
    life = bumpCareQuality(life, 3);
    return { ...state, care, life, updatedAt: ts };
  }

  if (event.event === 'petLightsOff') {
    care.lightsOn = false;
    care.lightsNeglectTicks = 0;
    life = bumpCareQuality(life, 2);
    return { ...state, care, life, updatedAt: ts };
  }

  if (event.event === 'petTreat' || event.event === 'stop') {
    const isTreat = event.event === 'petTreat' || event.event === 'stop';
    if (isTreat) {
      happiness = clamp(happiness + config.treatHappinessGain * event.weight, 0, 100);
      care.treatAbuse += 1;
      if (care.treatAbuse >= config.treatAbuseThreshold) {
        care.sick = true;
        care.sickTicks = 0;
        care.treatAbuse = 0;
        life = bumpCareQuality(life, -10);
      }
    }
  }

  if (event.category === 'code' || event.event === 'petFeed') {
    hunger = clamp(hunger + config.feedGain * event.weight, 0, 100);
    if (vitalsToHearts(hunger) > 0) {
      care.attentionHunger = false;
    }
    life = bumpCareQuality(life, 1);
  }

  if (event.category === 'chat' || event.category === 'explore' || event.event === 'petPlay') {
    if (care.sick) {
      return state;
    }
    happiness = clamp(happiness + config.playGain * event.weight, 0, 100);
    if (vitalsToHearts(happiness) > 0) {
      care.attentionHappiness = false;
    }
    life = bumpCareQuality(life, 1);
  }

  if (vitalsToHearts(hunger) > 0 && vitalsToHearts(happiness) > 0) {
    care = clearAttention(care);
    care.neglectTicks = 0;
  }

  return {
    ...state,
    care,
    life,
    vitals: {
      ...state.vitals,
      hunger,
      happiness,
      lastFedAt: event.category === 'code' ? ts : state.vitals.lastFedAt,
      lastPlayedAt:
        event.category === 'chat' || event.category === 'explore' ? ts : state.vitals.lastPlayedAt,
    },
    updatedAt: ts,
  };
}

/**
 * Marks death when Cursor plan usage is fully exhausted (optional integration).
 */
export function applyTokenExhaustionDeath(
  state: CursorPetState,
  exhausted: boolean,
  ts = nowIso()
): CursorPetState {
  if (!exhausted || state.phase !== 'alive') {
    return state;
  }
  return markDead(state, 'no_tokens', ts);
}
