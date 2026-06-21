import * as assert from 'assert';
import * as path from 'path';
import { resolveGlobalCursorRoot, buildPersonalAgentsPath } from './globalCursorPaths';
import {
  applyModeToFrontmatter,
  composeRuleFile,
  normalizeRuleContent,
  parseRuleFile,
} from './ruleFrontmatter';
import { ALL_HOOK_EVENTS, hookEventFromScriptBasename } from './hookScriptUtils';
import { computeSyncDiffSummary, resolveSyncPaths } from './syncAssetCore';
import { formatBackupTimestamp, buildBackupDestination } from './backupPathUtils';

function runTests(): void {
  testGlobalCursorRoot();
  testRuleFrontmatter();
  testHookMapping();
  testSyncCore();
  testBackupPaths();
  console.log('All globalUserAiParity tests passed.');
}

function testGlobalCursorRoot(): void {
  const home = '/home/user';
  assert.strictEqual(
    resolveGlobalCursorRoot(home, 'cursor', ''),
    path.join(home, '.cursor')
  );
  assert.strictEqual(
    resolveGlobalCursorRoot(home, 'cursor', '.cursor-alt'),
    path.join(home, '.cursor-alt')
  );
  assert.strictEqual(
    resolveGlobalCursorRoot(home, 'cursor', '/opt/cursor-global'),
    '/opt/cursor-global'
  );
  assert.strictEqual(
    buildPersonalAgentsPath(path.join(home, '.cursor')),
    path.join(home, '.cursor', 'agents')
  );
}

function testRuleFrontmatter(): void {
  const always = composeRuleFile(applyModeToFrontmatter('always'), '# Title\n\nBody');
  assert.ok(always.includes('alwaysApply: true'));
  assert.ok(always.includes('# Title'));

  const intelligent = composeRuleFile(
    applyModeToFrontmatter('intelligent', { description: 'When testing' }),
    'Body only'
  );
  assert.ok(intelligent.includes('alwaysApply: false'));
  assert.ok(intelligent.includes('description:'));

  const normalized = normalizeRuleContent('# Legacy\n\nContent');
  const parsed = parseRuleFile(normalized);
  assert.strictEqual(parsed.frontmatter.alwaysApply, false);
}

function testHookMapping(): void {
  assert.strictEqual(ALL_HOOK_EVENTS.length, 20);
  assert.strictEqual(hookEventFromScriptBasename('after-file-edit.sh'), 'afterFileEdit');
  assert.strictEqual(hookEventFromScriptBasename('session-start.sh'), 'sessionStart');
  assert.strictEqual(hookEventFromScriptBasename('unknown.sh'), null);
}

function testSyncCore(): void {
  const pair = resolveSyncPaths(
    'rules',
    'my-rule',
    '/home/user/.cursor',
    '/proj',
    'toWorkspace'
  );
  assert.strictEqual(pair.sourcePath, '/home/user/.cursor/rules/my-rule.mdc');
  assert.strictEqual(pair.targetPath, '/proj/rules/my-rule.mdc');

  const diff = computeSyncDiffSummary('a\nb', 'a\nc');
  assert.strictEqual(diff.wouldOverwrite, true);
  assert.ok(diff.diffSummary.includes('changed'));
}

function testBackupPaths(): void {
  const ts = '20250621T120000';
  const dest = buildBackupDestination('/home/user/.cursor/.backups', 'rules', '/home/user/.cursor/rules/x.mdc', ts);
  assert.strictEqual(dest, '/home/user/.cursor/.backups/20250621T120000-rules-x.mdc');
  assert.match(formatBackupTimestamp(new Date('2025-06-21T12:00:00')), /^20250621T120000$/);
}

runTests();
