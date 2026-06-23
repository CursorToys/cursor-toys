import * as assert from 'assert';
import { applyCursorPetDebugScenario } from './cursorPetDebug';
import { createInitialCursorPetState } from './types';

function runTests(): void {
  const state = createInitialCursorPetState(100);
  const incubating = applyCursorPetDebugScenario(state, 'advance_incubation', 25);
  assert.strictEqual(incubating.phase, 'incubating');
  assert.ok(incubating.incubation.progress > 0);

  const hatched = applyCursorPetDebugScenario(state, 'force_hatch_coder', 25);
  assert.strictEqual(hatched.phase, 'alive');
  assert.strictEqual(hatched.archetype, 'coder');

  const dead = applyCursorPetDebugScenario(hatched, 'starvation', 25);
  assert.strictEqual(dead.phase, 'dead');
  assert.strictEqual(dead.lifecycle.deathReason, 'starvation');

  console.log('All cursorPet debug tests passed.');
}

runTests();
