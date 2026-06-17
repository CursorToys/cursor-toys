import * as assert from 'assert';
import { buildHttpFolderTree, groupHttpFilesByFolder, httpFileDisplayName } from './httpFolderTree';

function runTests(): void {
  testNestedFolders();
  testRootFiles();
  testDisplayName();
  testGroupByFolder();
  console.log('All httpFolderTree tests passed.');
}

function testNestedFolders(): void {
  const tree = buildHttpFolderTree([
    { filePath: '/ws/.cursor/http/a.req', fileName: 'a.req', folderPath: '' },
    { filePath: '/ws/.cursor/http/github/b.req', fileName: 'b.req', folderPath: 'github' },
    {
      filePath: '/ws/.cursor/http/github/api/c.req',
      fileName: 'c.req',
      folderPath: 'github/api',
    },
  ]);

  assert.strictEqual(tree.length, 2);
  assert.strictEqual(tree[0].kind, 'file');
  assert.strictEqual(tree[1].kind, 'folder');
  if (tree[1].kind !== 'folder') {
    return;
  }
  assert.strictEqual(tree[1].node.name, 'github');
  assert.strictEqual(tree[1].node.entries.length, 2);
  assert.strictEqual(tree[1].node.entries[0].kind, 'file');
  assert.strictEqual(tree[1].node.entries[1].kind, 'folder');
}

function testRootFiles(): void {
  const tree = buildHttpFolderTree([
    { filePath: '/ws/.cursor/http/z.req', fileName: 'z.req', folderPath: '' },
    { filePath: '/ws/.cursor/http/a.req', fileName: 'a.req', folderPath: '' },
  ]);
  assert.strictEqual(tree.length, 2);
  assert.strictEqual(tree[0].kind, 'file');
  if (tree[0].kind === 'file') {
    assert.strictEqual(tree[0].file.fileName, 'a.req');
  }
}

function testDisplayName(): void {
  assert.strictEqual(httpFileDisplayName('auth.req', 'github'), 'github/auth.req');
  assert.strictEqual(httpFileDisplayName('auth.req'), 'auth.req');
}

function testGroupByFolder(): void {
  const groups = groupHttpFilesByFolder([
    { filePath: '/a', fileName: 'b.req', folderPath: 'github' },
    { filePath: '/b', fileName: 'a.req', folderPath: '' },
  ]);
  assert.strictEqual(groups.length, 2);
  assert.strictEqual(groups[0].folderPath, '');
  assert.strictEqual(groups[1].folderPath, 'github');
}

runTests();
