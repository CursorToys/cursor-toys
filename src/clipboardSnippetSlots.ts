/**
 * Named snippet slots (clip01 … clip99) with optional user labels, persisted as JSON.
 */

export const CLIP_SLOT_MIN = 1;
export const CLIP_SLOT_MAX = 99;

export interface ClipboardSlotEntry {
  text: string;
  label?: string;
}

export type ClipboardSlotsStore = Record<string, ClipboardSlotEntry>;

/**
 * Validates and normalizes a slot id (e.g. clip01).
 */
export function normalizeClipSlotId(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const match = /^clip(\d{1,2})$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const num = parseInt(match[1], 10);
  if (num < CLIP_SLOT_MIN || num > CLIP_SLOT_MAX) {
    return null;
  }
  return `clip${String(num).padStart(2, '0')}`;
}

/**
 * Display name for sidebar and Quick Pick (user label, else slot id).
 */
export function formatSlotDisplayLabel(slotId: string, entry?: ClipboardSlotEntry): string {
  const label = entry?.label?.trim();
  if (label) {
    return label;
  }
  return slotId;
}

/**
 * Parses slot JSON from disk (migrates legacy string-only values).
 */
export function parseClipboardSlotsJson(raw: string): ClipboardSlotsStore {
  if (!raw.trim()) {
    return {};
  }
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const result: ClipboardSlotsStore = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    const slotId = normalizeClipSlotId(key);
    if (!slotId) {
      continue;
    }
    if (typeof value === 'string') {
      result[slotId] = { text: value };
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      if (typeof obj.text === 'string') {
        result[slotId] = {
          text: obj.text,
          label: typeof obj.label === 'string' ? obj.label : undefined,
        };
      }
    }
  }
  return result;
}

/**
 * Serializes slots store to JSON.
 */
export function serializeClipboardSlots(store: ClipboardSlotsStore): string {
  const sorted: ClipboardSlotsStore = {};
  const keys = Object.keys(store)
    .map((k) => normalizeClipSlotId(k))
    .filter((k): k is string => k !== null)
    .sort();
  for (const key of keys) {
    const entry = store[key];
    if (entry?.text) {
      sorted[key] = {
        text: entry.text,
        ...(entry.label?.trim() ? { label: entry.label.trim() } : {}),
      };
    }
  }
  return JSON.stringify(sorted, null, 2);
}

/**
 * Assigns text (and optional label) to a slot (immutable return).
 */
export function assignClipSlot(
  store: ClipboardSlotsStore,
  slotId: string,
  text: string,
  label?: string
): ClipboardSlotsStore {
  const normalized = normalizeClipSlotId(slotId);
  if (!normalized) {
    return store;
  }
  const trimmedLabel = label?.trim();
  return {
    ...store,
    [normalized]: {
      text,
      ...(trimmedLabel ? { label: trimmedLabel } : {}),
    },
  };
}

/**
 * Updates only the label on an existing slot.
 */
export function renameClipSlotLabel(
  store: ClipboardSlotsStore,
  slotId: string,
  label: string
): ClipboardSlotsStore {
  const normalized = normalizeClipSlotId(slotId);
  if (!normalized || !store[normalized]) {
    return store;
  }
  const trimmed = label.trim();
  const entry = store[normalized];
  return {
    ...store,
    [normalized]: {
      ...entry,
      ...(trimmed ? { label: trimmed } : { label: undefined }),
    },
  };
}

/**
 * Removes a slot from the store.
 */
export function removeClipSlot(store: ClipboardSlotsStore, slotId: string): ClipboardSlotsStore {
  const normalized = normalizeClipSlotId(slotId);
  if (!normalized || !store[normalized]) {
    return store;
  }
  const next = { ...store };
  delete next[normalized];
  return next;
}

/**
 * Returns the first free clipNN id, or null if all slots are used.
 */
export function findNextFreeSlotId(store: ClipboardSlotsStore): string | null {
  for (let i = CLIP_SLOT_MIN; i <= CLIP_SLOT_MAX; i++) {
    const slotId = `clip${String(i).padStart(2, '0')}`;
    if (!store[slotId]?.text) {
      return slotId;
    }
  }
  return null;
}

/**
 * Sorted slot list for UI (by display label).
 */
export function listClipSlots(store: ClipboardSlotsStore): { slotId: string; entry: ClipboardSlotEntry }[] {
  return Object.entries(store)
    .filter(([, entry]) => entry.text.length > 0)
    .map(([slotId, entry]) => ({ slotId, entry }))
    .sort((a, b) =>
      formatSlotDisplayLabel(a.slotId, a.entry).localeCompare(
        formatSlotDisplayLabel(b.slotId, b.entry),
        undefined,
        { sensitivity: 'base' }
      )
    );
}
