import * as assert from 'assert';
import * as path from 'path';
import { filterCommands, loadCommandsFromPackageJson } from './commandRegistry';

function runTests(): void {
  const extensionPath = path.resolve(__dirname, '..', '..');
  const commands = loadCommandsFromPackageJson(extensionPath);
  assert.ok(commands.length >= 90, `Expected ~100 commands, got ${commands.length}`);
  assert.ok(commands.every((c) => c.id.startsWith('cursor-toys.')));
  assert.ok(commands.some((c) => c.id === 'cursor-toys.createKanbanCard'));

  const filtered = filterCommands(commands, 'kanban');
  assert.ok(filtered.length >= 3);
  assert.ok(filtered.every((c) => c.id.includes('kanban') || c.title.toLowerCase().includes('kanban')));

  console.log(`commandRegistry: ${commands.length} commands loaded`);
  console.log('All mcp/commandRegistry tests passed.');
}

runTests();
