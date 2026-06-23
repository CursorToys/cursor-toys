import * as assert from 'assert';
import { buildCursorPetStatusBarPresentation } from './cursorPetStatusBar';
import type { CursorPetViewModel } from './types';

function vm(partial: Partial<CursorPetViewModel>): CursorPetViewModel {
  return {
    phase: 'egg_selection',
    selectedEgg: null,
    archetype: null,
    lifeStage: null,
    gameDay: 0,
    adultOutcome: null,
    incubationProgress: 0,
    incubationTarget: 100,
    hunger: 100,
    happiness: 100,
    hungerHearts: 4,
    happinessHearts: 4,
    visualState: 'egg_select',
    lowVitalsWarning: false,
    needsAttention: false,
    sick: false,
    tantrum: false,
    sleeping: false,
    lightsOn: true,
    poop: 0,
    careMistakes: 0,
    discipline: 0,
    careQuality: 50,
    deathReason: null,
    lastActivityAt: '',
    lastAgentActivityAt: '',
    agentActive: false,
    ...partial,
  };
}

function runTests(): void {
  const choose = buildCursorPetStatusBarPresentation(vm({ phase: 'egg_selection' }));
  assert.match(choose.text, /\$\(egg\) Cursor Pet: Choose egg/);

  const incubating = buildCursorPetStatusBarPresentation(
    vm({
      phase: 'incubating',
      selectedEgg: 'ember',
      incubationProgress: 50,
      incubationTarget: 100,
      visualState: 'egg_wobble',
    })
  );
  assert.match(incubating.text, /Incubating 50%/);

  const happy = buildCursorPetStatusBarPresentation(
    vm({
      phase: 'alive',
      archetype: 'coder',
      lifeStage: 'adult',
      hungerHearts: 4,
      happinessHearts: 4,
      hunger: 100,
      happiness: 100,
      visualState: 'idle',
    })
  );
  assert.match(happy.text, /\$\(smiley\) Cursor Pet: adult/);

  const care = buildCursorPetStatusBarPresentation(
    vm({
      phase: 'alive',
      lowVitalsWarning: true,
      hunger: 10,
      happiness: 80,
      visualState: 'sad',
    })
  );
  assert.match(care.text, /\$\(warning\) Cursor Pet: Needs care/);

  const dead = buildCursorPetStatusBarPresentation(
    vm({ phase: 'dead', archetype: 'balanced', visualState: 'dead' })
  );
  assert.match(dead.text, /\$\(skull\) Cursor Pet: RIP/);

  console.log('All cursorPet status bar tests passed.');
}

runTests();
