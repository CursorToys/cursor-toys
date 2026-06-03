import * as assert from 'assert';
import { ClipboardRingBuffer } from './clipboardRingBuffer';

function runTests(): void {
  testNewestFirst();
  testConsecutiveDedupe();
  testMaxEntries();
  testMaxEntryChars();
  testClear();
  console.log('All clipboardRingBuffer tests passed.');
}

function testNewestFirst(): void {
  const buf = new ClipboardRingBuffer({ maxEntries: 5, maxEntryChars: 1000 });
  buf.push('a', 'copy');
  buf.push('b', 'copy');
  assert.strictEqual(buf.getEntries()[0].text, 'b');
  assert.strictEqual(buf.getEntries()[1].text, 'a');
}

function testConsecutiveDedupe(): void {
  const buf = new ClipboardRingBuffer({ maxEntries: 5, maxEntryChars: 1000 });
  buf.push('same', 'copy');
  buf.push('same', 'copy');
  assert.strictEqual(buf.size, 1);
  buf.push('other', 'copy');
  buf.push('same', 'copy');
  assert.strictEqual(buf.size, 3);
}

function testMaxEntries(): void {
  const buf = new ClipboardRingBuffer({ maxEntries: 3, maxEntryChars: 1000 });
  buf.push('1', 'copy');
  buf.push('2', 'copy');
  buf.push('3', 'copy');
  buf.push('4', 'copy');
  assert.strictEqual(buf.size, 3);
  assert.deepStrictEqual(
    buf.getEntries().map((e) => e.text),
    ['4', '3', '2']
  );
}

function testMaxEntryChars(): void {
  const buf = new ClipboardRingBuffer({ maxEntries: 5, maxEntryChars: 3 });
  assert.strictEqual(buf.push('abcd', 'copy'), false);
  assert.strictEqual(buf.size, 0);
  assert.strictEqual(buf.push('abc', 'copy'), true);
}

function testClear(): void {
  const buf = new ClipboardRingBuffer();
  buf.push('x', 'cut');
  buf.clear();
  assert.strictEqual(buf.size, 0);
}

runTests();
