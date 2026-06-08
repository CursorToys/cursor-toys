import * as assert from 'assert';
import { CURSOR_TOYS_MENU_ITEMS, sortMenuItemsByUsage } from './cursorToysCommandPaletteCore';

function runTests(): void {
  testSortByCountThenLastUsed();
  testPreservesDefaultOrderWithoutUsage();
  console.log('All cursorToysCommandPalette tests passed.');
}

function testSortByCountThenLastUsed(): void {
  const usage = {
    'open-kanban': { count: 5, lastUsed: 100 },
    'new-notepad': { count: 10, lastUsed: 50 },
    'import-url': { count: 5, lastUsed: 200 },
  };
  const sorted = sortMenuItemsByUsage(CURSOR_TOYS_MENU_ITEMS, usage);
  assert.strictEqual(sorted[0]?.id, 'new-notepad');
  assert.strictEqual(sorted[1]?.id, 'import-url');
  assert.strictEqual(sorted[2]?.id, 'open-kanban');
}

function testPreservesDefaultOrderWithoutUsage(): void {
  const sorted = sortMenuItemsByUsage(CURSOR_TOYS_MENU_ITEMS, {});
  assert.strictEqual(sorted[0]?.id, CURSOR_TOYS_MENU_ITEMS[0]?.id);
  assert.strictEqual(sorted.length, CURSOR_TOYS_MENU_ITEMS.length);
}

runTests();
