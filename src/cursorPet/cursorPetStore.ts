import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeExtensionDataFolderName } from '../extensionDataPaths';
import { getExtensionDataFolderName } from '../utils';
import {
  createEmptyActivityScores,
  createInitialCare,
  createInitialCursorPetState,
  createInitialLife,
  createInitialVitals,
  nowIso,
  type CursorPetCare,
  type CursorPetLife,
  type CursorPetState,
  type DeathReason,
  type EggSkin,
  type PetArchetype,
} from './types';

const SAVE_DEBOUNCE_MS = 200;

export function getCursorPetDataDir(homePath: string, extensionDataFolder: string): string {
  const folder = normalizeExtensionDataFolderName(extensionDataFolder);
  return path.join(homePath, `.${folder}`, 'cursor-pet');
}

export function getCursorPetStatePath(homePath: string, extensionDataFolder: string): string {
  return path.join(getCursorPetDataDir(homePath, extensionDataFolder), 'state.json');
}

export function getCursorPetActivityPath(homePath: string, extensionDataFolder: string): string {
  return path.join(getCursorPetDataDir(homePath, extensionDataFolder), 'activity.ndjson');
}

function isEggSkin(value: unknown): value is EggSkin {
  return value === 'ember' || value === 'mist' || value === 'moss';
}

function isArchetype(value: unknown): value is PetArchetype {
  return value === 'chatling' || value === 'coder' || value === 'balanced';
}

function isPhase(value: unknown): value is CursorPetState['phase'] {
  return value === 'egg_selection' || value === 'incubating' || value === 'alive' || value === 'dead';
}

function isDeathReason(value: unknown): value is DeathReason {
  return (
    value === 'starvation' ||
    value === 'unhappy' ||
    value === 'neglect' ||
    value === 'sickness' ||
    value === 'old_age' ||
    value === 'no_tokens'
  );
}

function parseLife(parsed: Partial<CursorPetState>, base: CursorPetLife): CursorPetLife {
  const life = parsed.life;
  return {
    gameDay: typeof life?.gameDay === 'number' ? life.gameDay : base.gameDay,
    stage:
      life?.stage === 'baby' ||
      life?.stage === 'child' ||
      life?.stage === 'teen' ||
      life?.stage === 'adult' ||
      life?.stage === 'elder'
        ? life.stage
        : base.stage,
    careQuality: typeof life?.careQuality === 'number' ? life.careQuality : base.careQuality,
    adultOutcome:
      life?.adultOutcome === 'good' ||
      life?.adultOutcome === 'neutral' ||
      life?.adultOutcome === 'poor'
        ? life.adultOutcome
        : base.adultOutcome,
    hatchedAt:
      typeof life?.hatchedAt === 'string'
        ? life.hatchedAt
        : typeof parsed.lifecycle?.hatchedAt === 'string'
          ? parsed.lifecycle.hatchedAt
          : base.hatchedAt,
  };
}

function parseCare(parsed: Partial<CursorPetState>, base: CursorPetCare): CursorPetCare {
  const care = parsed.care;
  return {
    careMistakes: typeof care?.careMistakes === 'number' ? care.careMistakes : base.careMistakes,
    neglectTicks: typeof care?.neglectTicks === 'number' ? care.neglectTicks : base.neglectTicks,
    attentionHunger: care?.attentionHunger === true,
    attentionHappiness: care?.attentionHappiness === true,
    attentionSince: typeof care?.attentionSince === 'string' ? care.attentionSince : base.attentionSince,
    sick: care?.sick === true,
    sickTicks: typeof care?.sickTicks === 'number' ? care.sickTicks : base.sickTicks,
    poop: typeof care?.poop === 'number' ? care.poop : base.poop,
    dirty: typeof care?.dirty === 'number' ? care.dirty : base.dirty,
    sleeping: care?.sleeping === true,
    lightsOn: care?.lightsOn !== false,
    lightsNeglectTicks:
      typeof care?.lightsNeglectTicks === 'number' ? care.lightsNeglectTicks : base.lightsNeglectTicks,
    discipline: typeof care?.discipline === 'number' ? care.discipline : base.discipline,
    tantrum: care?.tantrum === true,
    treatAbuse: typeof care?.treatAbuse === 'number' ? care.treatAbuse : base.treatAbuse,
  };
}

/**
 * Parses persisted pet state from JSON text.
 */
export function parseCursorPetState(raw: string, targetPoints = 100): CursorPetState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CursorPetState> & { schemaVersion?: number };
    if (!isPhase(parsed.phase)) {
      return null;
    }
    const version = parsed.schemaVersion ?? 1;
    if (version !== 1 && version !== 2) {
      return null;
    }
    const ts = nowIso();
    const base = createInitialCursorPetState(targetPoints);
    const scores = parsed.incubation?.scores ?? createEmptyActivityScores();
    return {
      schemaVersion: 2,
      phase: parsed.phase,
      selectedEgg: isEggSkin(parsed.selectedEgg) ? parsed.selectedEgg : null,
      archetype: isArchetype(parsed.archetype) ? parsed.archetype : null,
      incubation: {
        progress: typeof parsed.incubation?.progress === 'number' ? parsed.incubation.progress : 0,
        targetPoints:
          typeof parsed.incubation?.targetPoints === 'number'
            ? parsed.incubation.targetPoints
            : targetPoints,
        scores: {
          chat: typeof scores.chat === 'number' ? scores.chat : 0,
          code: typeof scores.code === 'number' ? scores.code : 0,
          explore: typeof scores.explore === 'number' ? scores.explore : 0,
        },
        startedAt:
          typeof parsed.incubation?.startedAt === 'string' ? parsed.incubation.startedAt : null,
      },
      vitals: {
        hunger: typeof parsed.vitals?.hunger === 'number' ? parsed.vitals.hunger : base.vitals.hunger,
        happiness:
          typeof parsed.vitals?.happiness === 'number' ? parsed.vitals.happiness : base.vitals.happiness,
        lastFedAt: typeof parsed.vitals?.lastFedAt === 'string' ? parsed.vitals.lastFedAt : ts,
        lastPlayedAt:
          typeof parsed.vitals?.lastPlayedAt === 'string' ? parsed.vitals.lastPlayedAt : ts,
      },
      life: parseLife(parsed, base.life),
      care: parseCare(parsed, base.care),
      lifecycle: {
        hatchedAt:
          typeof parsed.lifecycle?.hatchedAt === 'string' ? parsed.lifecycle.hatchedAt : null,
        diedAt: typeof parsed.lifecycle?.diedAt === 'string' ? parsed.lifecycle.diedAt : null,
        deathReason: isDeathReason(parsed.lifecycle?.deathReason) ? parsed.lifecycle.deathReason : null,
      },
      lastActivityAt:
        typeof parsed.lastActivityAt === 'string' ? parsed.lastActivityAt : ts,
      lastAgentActivityAt:
        typeof parsed.lastAgentActivityAt === 'string' ? parsed.lastAgentActivityAt : ts,
      agentSessionActive: parsed.agentSessionActive === true,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ts,
    };
  } catch {
    return null;
  }
}

export class CursorPetStore {
  private static instance: CursorPetStore | undefined;

  private state: CursorPetState = createInitialCursorPetState();
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  private constructor(
    private readonly statePath: string,
    private readonly targetPoints: number
  ) {}

  static getInstance(): CursorPetStore {
    if (!CursorPetStore.instance) {
      const homePath = process.env.HOME || process.env.USERPROFILE || '';
      const statePath = getCursorPetStatePath(homePath, getExtensionDataFolderName());
      CursorPetStore.instance = new CursorPetStore(statePath, 100);
    }
    return CursorPetStore.instance;
  }

  static resetForTests(): void {
    CursorPetStore.instance = undefined;
  }

  static createForTests(statePath: string, targetPoints = 100): CursorPetStore {
    return new CursorPetStore(statePath, targetPoints);
  }

  getState(): CursorPetState {
    return JSON.parse(JSON.stringify(this.state)) as CursorPetState;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.statePath, 'utf8');
      const parsed = parseCursorPetState(raw, this.targetPoints);
      if (parsed) {
        this.state = parsed;
        this.emitChange();
      }
    } catch {
      this.state = createInitialCursorPetState(this.targetPoints);
    }
  }

  setState(next: CursorPetState): void {
    this.state = next;
    this.emitChange();
    this.scheduleSave();
  }

  private emitChange(): void {
    this.changeEmitter.fire();
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      void this.saveNow();
    }, SAVE_DEBOUNCE_MS);
  }

  async saveNow(): Promise<void> {
    const dir = path.dirname(this.statePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(this.statePath, JSON.stringify(this.state, null, 2), 'utf8');
  }
}
