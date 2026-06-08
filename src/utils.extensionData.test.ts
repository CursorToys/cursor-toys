import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildExtensionDataSubfolderPath,
  buildLegacySubfolderPath,
  isExtensionDataSubfolderPath,
  normalizeExtensionDataFolderName,
  resolveExtensionDataSubfolderRoot,
} from './extensionDataPaths';

function directoryHasContent(dirPath: string, maxDepth = 3): boolean {
  if (!fs.existsSync(dirPath)) {
    return false;
  }
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        return true;
      }
      if (entry.isDirectory() && maxDepth > 0) {
        if (directoryHasContent(path.join(dirPath, entry.name), maxDepth - 1)) {
          return true;
        }
      }
    }
  } catch {
    return false;
  }
  return false;
}

function runTests(): void {
  testNormalizeExtensionDataFolderName();
  testBuildPaths();
  testResolvePrefersCanonicalWhenPopulated();
  testResolveFallsBackToLegacy();
  testResolveDefaultsToCanonicalWhenEmpty();
  testIsExtensionDataSubfolderPath();
  console.log('All extensionData tests passed.');
}

function testNormalizeExtensionDataFolderName(): void {
  assert.strictEqual(normalizeExtensionDataFolderName('CursorToys'), 'cursortoys');
  assert.strictEqual(normalizeExtensionDataFolderName('  '), 'cursortoys');
}

function testBuildPaths(): void {
  const root = '/home/user/project';
  assert.strictEqual(
    buildExtensionDataSubfolderPath(root, 'cursortoys', 'kanban'),
    path.join(root, '.cursortoys', 'kanban')
  );
  assert.strictEqual(
    buildLegacySubfolderPath(root, 'cursor', 'notepads'),
    path.join(root, '.cursor', 'notepads')
  );
}

function testResolvePrefersCanonicalWhenPopulated(): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ext-data-'));
  try {
    const kanbanPath = buildExtensionDataSubfolderPath(tmp, 'cursortoys', 'kanban');
    fs.mkdirSync(path.join(kanbanPath, 'todo'), { recursive: true });
    fs.writeFileSync(path.join(kanbanPath, 'todo', 'task.md'), '# task');

    const resolved = resolveExtensionDataSubfolderRoot({
      homePath: tmp,
      isPersonal: true,
      subfolder: 'kanban',
      extensionDataFolder: 'cursortoys',
      baseFolderName: 'cursor',
      pathHasContent: directoryHasContent,
    });
    assert.strictEqual(resolved, kanbanPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testResolveFallsBackToLegacy(): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ext-data-'));
  try {
    const legacyPath = buildLegacySubfolderPath(tmp, 'cursor', 'notepads');
    fs.mkdirSync(legacyPath, { recursive: true });
    fs.writeFileSync(path.join(legacyPath, 'notes.md'), '# notes');

    const resolved = resolveExtensionDataSubfolderRoot({
      homePath: tmp,
      isPersonal: true,
      subfolder: 'notepads',
      extensionDataFolder: 'cursortoys',
      baseFolderName: 'cursor',
      pathHasContent: directoryHasContent,
    });
    assert.strictEqual(resolved, legacyPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testResolveDefaultsToCanonicalWhenEmpty(): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ext-data-'));
  try {
    const resolved = resolveExtensionDataSubfolderRoot({
      homePath: tmp,
      workspacePath: path.join(tmp, 'ws'),
      isPersonal: false,
      subfolder: 'kanban',
      extensionDataFolder: 'cursortoys',
      baseFolderName: 'vscode',
      pathHasContent: directoryHasContent,
    });
    assert.strictEqual(
      resolved,
      buildExtensionDataSubfolderPath(path.join(tmp, 'ws'), 'cursortoys', 'kanban')
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testIsExtensionDataSubfolderPath(): void {
  assert.ok(
    isExtensionDataSubfolderPath('/ws/.cursortoys/kanban/todo/a.md', 'kanban', 'cursortoys', 'cursor')
  );
  assert.ok(
    isExtensionDataSubfolderPath('/ws/.cursor/notepads/a.md', 'notepads', 'cursortoys', 'vscode')
  );
  assert.ok(!isExtensionDataSubfolderPath('/ws/.cursor/commands/a.md', 'notepads', 'cursortoys', 'cursor'));
}

runTests();
