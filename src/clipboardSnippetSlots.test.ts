import * as assert from 'assert';
import {
  assignClipSlot,
  formatSlotDisplayLabel,
  normalizeClipSlotId,
  parseClipboardSlotsJson,
  renameClipSlotLabel,
  serializeClipboardSlots,
} from './clipboardSnippetSlots';

function runTests(): void {
  testNormalizeSlotId();
  testParseLegacyAndLabeled();
  testAssignAndRename();
  testFormatDisplayLabel();
  console.log('All clipboardSnippetSlots tests passed.');
}

function testNormalizeSlotId(): void {
  assert.strictEqual(normalizeClipSlotId('clip01'), 'clip01');
  assert.strictEqual(normalizeClipSlotId('CLIP9'), 'clip09');
}

function testParseLegacyAndLabeled(): void {
  const map = parseClipboardSlotsJson(
    '{"clip01":"hello","clip02":{"text":"world","label":"Greeting"}}'
  );
  assert.strictEqual(map.clip01?.text, 'hello');
  assert.strictEqual(map.clip02?.text, 'world');
  assert.strictEqual(map.clip02?.label, 'Greeting');
}

function testAssignAndRename(): void {
  let store = assignClipSlot({}, 'clip1', 'body', 'Docker up');
  assert.strictEqual(store.clip01?.label, 'Docker up');
  store = renameClipSlotLabel(store, 'clip01', 'Compose up');
  assert.strictEqual(store.clip01?.label, 'Compose up');
  const out = serializeClipboardSlots(store);
  assert.ok(out.includes('"label": "Compose up"'));
}

function testFormatDisplayLabel(): void {
  assert.strictEqual(formatSlotDisplayLabel('clip01', { text: 'x', label: 'API' }), 'API');
  assert.strictEqual(formatSlotDisplayLabel('clip01', { text: 'x' }), 'clip01');
}

runTests();
