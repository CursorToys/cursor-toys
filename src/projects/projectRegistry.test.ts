import * as assert from 'assert';
import {
  capRecentList,
  clearRecentInSnapshot,
  pinProjectInSnapshot,
  recordWorkspaceOpenInSnapshot,
  unpinProjectInSnapshot,
} from './projectRegistryCore';
import { createEmptyRegistrySnapshot } from './types';

function runTests(): void {
  testPinMergesDuplicatePaths();
  testRecentCapAndDedupePinned();
  testClearRecent();
  testUnpinMovesToRecent();
  console.log('All projectRegistry tests passed.');
}

function testPinMergesDuplicatePaths(): void {
  const snapshot = createEmptyRegistrySnapshot();
  pinProjectInSnapshot(snapshot, { path: '/tmp/client-a', label: 'Client A', category: 'Clients' });
  const updated = pinProjectInSnapshot(snapshot, {
    path: '/tmp/client-a',
    label: 'Client A Updated',
    category: 'Work',
  });
  assert.strictEqual(snapshot.pinned.length, 1);
  assert.strictEqual(updated.label, 'Client A Updated');
  assert.strictEqual(updated.category, 'Work');
  assert.strictEqual(snapshot.recent.length, 0);
}

function testRecentCapAndDedupePinned(): void {
  const snapshot = createEmptyRegistrySnapshot();
  pinProjectInSnapshot(snapshot, { path: '/tmp/pinned', label: 'Pinned' });
  for (let i = 0; i < 20; i++) {
    recordWorkspaceOpenInSnapshot(snapshot, `/tmp/recent-${i}`, 5);
  }
  assert.strictEqual(snapshot.recent.length, 5);
  const pinnedOpen = recordWorkspaceOpenInSnapshot(snapshot, '/tmp/pinned', 5);
  assert.ok(pinnedOpen);
  assert.strictEqual(snapshot.recent.some((entry) => entry.path === '/tmp/pinned'), false);
  capRecentList(snapshot, 3);
  assert.strictEqual(snapshot.recent.length, 3);
}

function testClearRecent(): void {
  const snapshot = createEmptyRegistrySnapshot();
  recordWorkspaceOpenInSnapshot(snapshot, '/tmp/one', 10);
  recordWorkspaceOpenInSnapshot(snapshot, '/tmp/two', 10);
  clearRecentInSnapshot(snapshot);
  assert.strictEqual(snapshot.recent.length, 0);
}

function testUnpinMovesToRecent(): void {
  const snapshot = createEmptyRegistrySnapshot();
  const pinned = pinProjectInSnapshot(snapshot, { path: '/tmp/unpin-me', label: 'Unpin' });
  const changed = unpinProjectInSnapshot(snapshot, pinned.id, 10);
  assert.strictEqual(changed, true);
  assert.strictEqual(snapshot.pinned.length, 0);
  assert.strictEqual(snapshot.recent.length, 1);
  assert.strictEqual(snapshot.recent[0].label, 'Unpin');
}

runTests();
