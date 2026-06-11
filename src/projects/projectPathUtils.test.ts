import * as assert from 'assert';
import * as path from 'path';
import {
  defaultLabelFromPath,
  detectProjectPathKind,
  normalizeProjectPath,
  projectPathsEqual,
} from './projectPathUtils';

function runTests(): void {
  testDetectPathKind();
  testDefaultLabel();
  testNormalizeAndEquality();
  console.log('All projectPathUtils tests passed.');
}

function testDetectPathKind(): void {
  assert.strictEqual(detectProjectPathKind('/tmp/my.code-workspace'), 'workspace-file');
  assert.strictEqual(detectProjectPathKind('/tmp/my-project'), 'folder');
}

function testDefaultLabel(): void {
  assert.strictEqual(defaultLabelFromPath('/tmp/my.code-workspace'), 'my');
  assert.strictEqual(defaultLabelFromPath(path.join('/tmp', 'client-repo')), 'client-repo');
}

function testNormalizeAndEquality(): void {
  const a = normalizeProjectPath('/tmp/foo/../bar');
  const b = normalizeProjectPath('/tmp/bar');
  assert.ok(projectPathsEqual(a, b));
  assert.ok(projectPathsEqual('file:///tmp/a', 'file:///tmp/a'));
}

runTests();
