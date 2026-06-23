import * as assert from 'assert';
import { categoryFromHookEvent, parseActivityLine } from './cursorPetActivity';
import { applyActivity, buildViewModel, resetAfterDeath, selectEgg, tick } from './cursorPetEngine';
import { createInitialCursorPetState, DEFAULT_ENGINE_CONFIG, type PetActivityEvent } from './types';

function event(category: PetActivityEvent['category'], eventName: string, weight = 1): PetActivityEvent {
  return {
    ts: new Date().toISOString(),
    event: eventName,
    category,
    weight,
  };
}

function runTests(): void {
  testSelectEggStartsIncubation();
  testHatchChatlingArchetype();
  testHatchCoderArchetype();
  testHatchBalancedArchetype();
  testDeathByNeglect();
  testNoDeathOnTickWhenVitalsPositive();
  testResetAfterDeath();
  testActivityMapping();
  testAgentSessionLifecycle();
  console.log('All cursorPet engine tests passed.');
}

function testAgentSessionLifecycle(): void {
  let state = selectEgg(createInitialCursorPetState(6), 'ember');
  while (state.phase === 'incubating') {
    state = applyActivity(state, event('code', 'afterFileEdit'), DEFAULT_ENGINE_CONFIG);
  }
  assert.strictEqual(state.phase, 'alive');
  state = applyActivity(state, event('explore', 'subagentStart'), DEFAULT_ENGINE_CONFIG);
  assert.strictEqual(state.agentSessionActive, true);
  const vm = buildViewModel(state, DEFAULT_ENGINE_CONFIG);
  assert.strictEqual(vm.agentActive, true);
  state = applyActivity(state, event('explore', 'subagentStop'), DEFAULT_ENGINE_CONFIG);
  assert.strictEqual(state.agentSessionActive, false);
}

function testSelectEggStartsIncubation(): void {
  const state = selectEgg(createInitialCursorPetState(), 'ember');
  assert.strictEqual(state.phase, 'incubating');
  assert.strictEqual(state.selectedEgg, 'ember');
}

function testHatchChatlingArchetype(): void {
  let state = selectEgg(createInitialCursorPetState(20), 'mist');
  for (let i = 0; i < 15; i++) {
    state = applyActivity(state, event('chat', 'beforeSubmitPrompt'), DEFAULT_ENGINE_CONFIG);
  }
  assert.strictEqual(state.phase, 'alive');
  assert.strictEqual(state.archetype, 'chatling');
}

function testHatchCoderArchetype(): void {
  let state = selectEgg(createInitialCursorPetState(20), 'moss');
  for (let i = 0; i < 15; i++) {
    state = applyActivity(state, event('code', 'afterFileEdit'), DEFAULT_ENGINE_CONFIG);
  }
  assert.strictEqual(state.phase, 'alive');
  assert.strictEqual(state.archetype, 'coder');
}

function testHatchBalancedArchetype(): void {
  let state = selectEgg(createInitialCursorPetState(30), 'ember');
  for (let i = 0; i < 5; i++) {
    state = applyActivity(state, event('chat', 'beforeSubmitPrompt'), DEFAULT_ENGINE_CONFIG);
    state = applyActivity(state, event('code', 'afterFileEdit'), DEFAULT_ENGINE_CONFIG);
    state = applyActivity(state, event('explore', 'postToolUse'), DEFAULT_ENGINE_CONFIG);
  }
  assert.strictEqual(state.phase, 'alive');
  assert.strictEqual(state.archetype, 'balanced');
}

function testDeathByNeglect(): void {
  let state = selectEgg(createInitialCursorPetState(4), 'ember');
  for (let i = 0; i < 3; i++) {
    state = applyActivity(state, event('chat', 'beforeSubmitPrompt'), DEFAULT_ENGINE_CONFIG);
  }
  assert.strictEqual(state.phase, 'alive');
  state = {
    ...state,
    vitals: { ...state.vitals, hunger: 0, happiness: 50 },
    care: {
      ...state.care,
      careMistakes: DEFAULT_ENGINE_CONFIG.careMistakesBeforeDeath,
    },
  };
  state = tick(state, DEFAULT_ENGINE_CONFIG);
  assert.strictEqual(state.phase, 'dead');
  assert.strictEqual(state.lifecycle.deathReason, 'neglect');
}

function testNoDeathOnTickWhenVitalsPositive(): void {
  let state = selectEgg(createInitialCursorPetState(6), 'ember');
  for (let i = 0; i < 3; i++) {
    state = applyActivity(state, event('code', 'afterFileEdit'), DEFAULT_ENGINE_CONFIG);
  }
  assert.strictEqual(state.phase, 'alive');
  state = tick(state, DEFAULT_ENGINE_CONFIG);
  assert.strictEqual(state.phase, 'alive');
}

function testResetAfterDeath(): void {
  let state = selectEgg(createInitialCursorPetState(6), 'ember');
  for (let i = 0; i < 3; i++) {
    state = applyActivity(state, event('code', 'afterFileEdit'), DEFAULT_ENGINE_CONFIG);
  }
  assert.strictEqual(state.phase, 'alive');
  state = { ...state, phase: 'dead', lifecycle: { ...state.lifecycle, diedAt: new Date().toISOString(), deathReason: 'starvation' } };
  state = resetAfterDeath(state);
  assert.strictEqual(state.phase, 'egg_selection');
  assert.strictEqual(state.selectedEgg, null);
}

function testActivityMapping(): void {
  assert.strictEqual(categoryFromHookEvent('afterFileEdit'), 'code');
  const parsed = parseActivityLine(
    '{"ts":"2026-01-01T00:00:00.000Z","event":"afterFileEdit","category":"code","weight":1}'
  );
  assert.ok(parsed);
  assert.strictEqual(parsed?.category, 'code');
}

runTests();
