import * as assert from 'assert';
import { stripCursorPetHookEntries } from './cursorPetHookEntries';
import type { HooksConfig } from '../hooksManager';

function sampleConfig(): HooksConfig {
  return {
    version: 1,
    hooks: {
      stop: [
        { command: 'node ./hooks/cursor-pet-bridge.js stop' },
        { command: 'echo keep-me' },
      ],
      afterFileEdit: [{ command: 'node ./hooks/cursor-pet-feed.js' }],
      sessionStart: [{ command: 'node ./hooks/other-hook.js' }],
    },
  };
}

function runTests(): void {
  const { config, removedCount } = stripCursorPetHookEntries(sampleConfig());
  assert.equal(removedCount, 2);
  assert.deepEqual(config.hooks.stop, [{ command: 'echo keep-me' }]);
  assert.deepEqual(config.hooks.afterFileEdit, []);
  assert.deepEqual(config.hooks.sessionStart, [{ command: 'node ./hooks/other-hook.js' }]);

  const empty = stripCursorPetHookEntries({ version: 1, hooks: { stop: [] } });
  assert.equal(empty.removedCount, 0);

  console.log('All cursorPet hook entries tests passed.');
}

runTests();
