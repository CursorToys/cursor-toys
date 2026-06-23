import type { ActivityCategory, PetActivityEvent } from './types';

const HOOK_EVENT_CATEGORY: Record<string, ActivityCategory> = {
  beforeSubmitPrompt: 'chat',
  afterAgentResponse: 'chat',
  afterFileEdit: 'code',
  afterTabFileEdit: 'code',
  afterShellExecution: 'code',
  stop: 'code',
  postToolUse: 'explore',
  afterMCPExecution: 'explore',
  subagentStart: 'explore',
  subagentStop: 'explore',
  sessionStart: 'heartbeat',
  sessionEnd: 'heartbeat',
};

/**
 * Maps a Cursor hook event name to a pet activity category.
 */
export function categoryFromHookEvent(event: string): ActivityCategory | null {
  return HOOK_EVENT_CATEGORY[event] ?? null;
}

/**
 * Parses one NDJSON activity line from the hook bridge file.
 */
export function parseActivityLine(line: string): PetActivityEvent | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as Partial<PetActivityEvent>;
    if (
      typeof parsed.ts !== 'string' ||
      typeof parsed.event !== 'string' ||
      typeof parsed.category !== 'string' ||
      typeof parsed.weight !== 'number'
    ) {
      return null;
    }
    if (!['chat', 'code', 'explore', 'heartbeat'].includes(parsed.category)) {
      return null;
    }
    return {
      ts: parsed.ts,
      event: parsed.event,
      category: parsed.category as ActivityCategory,
      weight: parsed.weight,
    };
  } catch {
    return null;
  }
}

/**
 * Builds a pet activity event from an internal extension signal.
 */
export function buildInternalActivityEvent(
  event: string,
  category: ActivityCategory,
  weight = 1
): PetActivityEvent {
  return {
    ts: new Date().toISOString(),
    event,
    category,
    weight,
  };
}

export const CURSOR_PET_BRIDGE_HOOK_EVENTS = [
  'beforeSubmitPrompt',
  'afterAgentResponse',
  'afterFileEdit',
  'afterTabFileEdit',
  'afterShellExecution',
  'postToolUse',
  'afterMCPExecution',
  'subagentStart',
  'subagentStop',
  'sessionStart',
  'sessionEnd',
  'stop',
] as const;
