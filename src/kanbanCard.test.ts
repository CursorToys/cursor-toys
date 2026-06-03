import * as assert from 'assert';
import * as path from 'path';
import {
  encodeKanbanTag,
  formatKanbanTagDisplayName,
  getKanbanRootFromCardPath,
  getKanbanStatusPath,
  inferKanbanStatusFromPath,
  kanbanCardToFileContent,
  normalizeKanbanStatus,
  parseKanbanCardFromContent,
  parseKanbanTags,
} from './kanbanCardCore';

function runTests(): void {
  testDefaultStatusTodo();
  testMoveStatusPreservesBody();
  testPreservesExtraFrontmatterKeys();
  testInvalidStatusDefaultsToTodo();
  testBacklogStatus();
  testTagsWithColors();
  testStatusFolderPaths();
  testQuotedTagWithColor();
  testFormatKanbanTagDisplayName();
  console.log('All kanbanCard tests passed.');
}

function testQuotedTagWithColor(): void {
  const tags = parseKanbanTags(['"bug:#ff5722"', 'docs']);
  assert.strictEqual(tags.length, 2);
  assert.strictEqual(tags[0].name, 'bug');
  assert.strictEqual(tags[0].color, '#ff5722');
  assert.strictEqual(tags[1].name, 'docs');
}

function testFormatKanbanTagDisplayName(): void {
  const longName = 'a'.repeat(90);
  const formatted = formatKanbanTagDisplayName(longName);
  assert.ok(formatted.length <= 80);
  assert.ok(formatted.endsWith('…'));
}

function testStatusFolderPaths(): void {
  const kanbanPath = '/ws/.cursor/kanban';
  assert.strictEqual(getKanbanStatusPath(kanbanPath, 'done'), path.join(kanbanPath, 'done'));
  assert.strictEqual(
    inferKanbanStatusFromPath(kanbanPath, path.join(kanbanPath, 'todo', 'task.md')),
    'todo'
  );
  assert.strictEqual(
    inferKanbanStatusFromPath(kanbanPath, path.join(kanbanPath, 'legacy.md')),
    null
  );
  assert.strictEqual(
    getKanbanRootFromCardPath(path.join(kanbanPath, 'doing', 'task.md')),
    kanbanPath
  );
  assert.strictEqual(
    getKanbanRootFromCardPath(path.join(kanbanPath, 'legacy.md')),
    kanbanPath
  );
}

function testDefaultStatusTodo(): void {
  const content = `---
title: My task
---
Do something`;
  const card = parseKanbanCardFromContent('/ws/.cursor/kanban/my-task.md', content);
  assert.strictEqual(card.status, 'todo');
  assert.strictEqual(card.title, 'My task');
  assert.strictEqual(card.description, 'Do something');
  assert.deepStrictEqual(card.tags, []);
}

function testMoveStatusPreservesBody(): void {
  const content = `---
title: Move me
status: todo
custom: kept
---
Body text`;
  const card = parseKanbanCardFromContent('/ws/.cursor/kanban/move.md', content);
  card.status = 'done';
  const out = kanbanCardToFileContent(card);
  const again = parseKanbanCardFromContent('/ws/.cursor/kanban/move.md', out);
  assert.strictEqual(again.status, 'done');
  assert.strictEqual(again.description, 'Body text');
  assert.strictEqual(again.metadata.custom, 'kept');
}

function testPreservesExtraFrontmatterKeys(): void {
  const content = `---
title: Tagged
status: doing
priority: high
---
`;
  const card = parseKanbanCardFromContent('/ws/k.md', content);
  const out = kanbanCardToFileContent(card);
  assert.ok(out.includes('priority: high'));
}

function testInvalidStatusDefaultsToTodo(): void {
  assert.strictEqual(normalizeKanbanStatus('wip'), 'todo');
  const card = parseKanbanCardFromContent(
    path.join('/ws', 'x.md'),
    `---\ntitle: X\nstatus: invalid\n---\n`
  );
  assert.strictEqual(card.status, 'todo');
}

function testBacklogStatus(): void {
  assert.strictEqual(normalizeKanbanStatus('backlog'), 'backlog');
  const card = parseKanbanCardFromContent(
    '/ws/x.md',
    `---\ntitle: X\nstatus: backlog\n---\n`
  );
  assert.strictEqual(card.status, 'backlog');
}

function testTagsWithColors(): void {
  const tags = parseKanbanTags(['bug', 'feature:#4caf50']);
  assert.strictEqual(tags.length, 2);
  assert.strictEqual(tags[0].name, 'bug');
  assert.strictEqual(tags[0].color, undefined);
  assert.strictEqual(tags[1].name, 'feature');
  assert.strictEqual(tags[1].color, '#4caf50');

  const card = parseKanbanCardFromContent(
    '/ws/x.md',
    `---\ntitle: X\nstatus: todo\ntags:\n  - bug:#ff5722\n  - docs\n---\n`
  );
  assert.strictEqual(card.tags.length, 2);
  assert.strictEqual(card.tags[0].color, '#ff5722');

  const out = kanbanCardToFileContent(card);
  assert.ok(out.includes('bug:#ff5722'));
  assert.ok(out.includes('- docs'));
  assert.strictEqual(encodeKanbanTag({ name: 'ui', color: '#abc123' }), 'ui:#abc123');
}

runTests();
