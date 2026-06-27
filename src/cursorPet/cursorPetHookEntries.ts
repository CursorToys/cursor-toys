import type { HooksConfig } from '../hooksManager';

export const CURSOR_PET_BRIDGE_SCRIPT = 'cursor-pet-bridge.js';
export const CURSOR_PET_FEED_SCRIPT = 'cursor-pet-feed.js';

function isCursorPetHookCommand(command: string): boolean {
  return (
    command.includes(CURSOR_PET_BRIDGE_SCRIPT) || command.includes(CURSOR_PET_FEED_SCRIPT)
  );
}

/**
 * Removes Cursor Pet hook entries from a hooks.json config.
 */
export function stripCursorPetHookEntries(config: HooksConfig): {
  config: HooksConfig;
  removedCount: number;
} {
  let removedCount = 0;
  const hooks: HooksConfig['hooks'] = { ...config.hooks };

  for (const event of Object.keys(hooks)) {
    const entries = hooks[event] ?? [];
    const filtered = entries.filter((entry) => {
      if (isCursorPetHookCommand(entry.command)) {
        removedCount += 1;
        return false;
      }
      return true;
    });
    hooks[event] = filtered;
  }

  return { config: { ...config, hooks }, removedCount };
}
