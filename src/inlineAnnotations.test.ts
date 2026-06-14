import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseInlineAnnotations } from './inlineAnnotationParser';
import {
  collectScannableFiles,
  globPatternToRegExp,
  InlineAnnotationMarker,
  matchesAnyIncludePattern,
  scanFileAtPath,
  shouldScanRelativePath,
} from './inlineAnnotationScanner';
import { InlineAnnotationStore } from './inlineAnnotationStore';
import { createGitIgnoreFilter } from './gitignoreTreeFilter';

function runTests(): void {
  testParseTodoNoteFix();
  testParseMarkdownHeadings();
  testParseCaseInsensitiveAndCustomTag();
  testGlobPatterns();
  testGitignoreWithIncludeOverride();
  testIndexReplaceAndNavigation();
  testTreeGroupingViaIndex();
  console.log('All inlineAnnotations tests passed.');
}

function testParseTodoNoteFix(): void {
  const content = [
    '// todo: refactor parser',
    '# note: remember edge case',
    '  //fix broken handler',
  ].join('\n');

  const markers = parseInlineAnnotations(content, ['todo', 'note', 'fix']);
  assert.strictEqual(markers.length, 3);
  assert.strictEqual(markers[0].tag, 'todo');
  assert.strictEqual(markers[0].line, 0);
  assert.strictEqual(markers[0].preview, 'refactor parser');
  assert.strictEqual(markers[1].tag, 'note');
  assert.strictEqual(markers[2].tag, 'fix');
}

function testParseMarkdownHeadings(): void {
  const content = [
    '## todo: markdown heading',
    '### note: nested heading',
    '- fix: list item',
  ].join('\n');

  const markers = parseInlineAnnotations(content, ['todo', 'note', 'fix']);
  assert.strictEqual(markers.length, 3);
  assert.strictEqual(markers[0].tag, 'todo');
  assert.strictEqual(markers[1].tag, 'note');
  assert.strictEqual(markers[2].tag, 'fix');
}

function testParseCaseInsensitiveAndCustomTag(): void {
  const content = '// HACK: temporary workaround';
  const markers = parseInlineAnnotations(content, ['todo', 'hack']);
  assert.strictEqual(markers.length, 1);
  assert.strictEqual(markers[0].tag, 'hack');
  assert.strictEqual(markers[0].preview, 'temporary workaround');
}

function testGlobPatterns(): void {
  assert.ok(matchesAnyIncludePattern('.deepspec/specs/drafts/task/APPROACH.md', ['.deepspec/specs/drafts/**']));
  assert.ok(!matchesAnyIncludePattern('.deepspec/specs/active/task/APPROACH.md', ['.deepspec/specs/drafts/**']));
  assert.ok(globPatternToRegExp('src/*.ts').test('src/foo.ts'));
  assert.ok(!globPatternToRegExp('src/*.ts').test('src/nested/foo.ts'));
}

function testGitignoreWithIncludeOverride(): void {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-inline-ann-'));
  try {
    fs.mkdirSync(path.join(tmp, '.git'));
    fs.writeFileSync(path.join(tmp, '.gitignore'), '.deepspec/\n');
    fs.mkdirSync(path.join(tmp, '.deepspec', 'specs', 'drafts', 'task'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });

    const ignoredDraft = path.join(tmp, '.deepspec', 'specs', 'drafts', 'task', 'note.ts');
    const trackedSrc = path.join(tmp, 'src', 'app.ts');
    fs.writeFileSync(ignoredDraft, '// note: draft spec\n');
    fs.writeFileSync(trackedSrc, '// todo: ship feature\n');

    const gitFilter = createGitIgnoreFilter(tmp);
    assert.strictEqual(
      shouldScanRelativePath('.deepspec/specs/drafts/task/note.ts', gitFilter, []),
      false
    );
    assert.strictEqual(
      shouldScanRelativePath('src/app.ts', gitFilter, []),
      true
    );
    assert.strictEqual(
      shouldScanRelativePath('.deepspec/specs/drafts/task/note.ts', gitFilter, ['.deepspec/specs/drafts/**']),
      true
    );

    const defaultFiles = collectScannableFiles(tmp, {
      tags: ['todo', 'note'],
      fileExtensions: ['ts'],
      scanIncludePaths: [],
    });
    assert.strictEqual(defaultFiles.length, 1);
    assert.ok(defaultFiles[0].endsWith('src/app.ts'));

    const overrideFiles = collectScannableFiles(tmp, {
      tags: ['todo', 'note'],
      fileExtensions: ['ts'],
      scanIncludePaths: ['.deepspec/specs/drafts/**'],
    });
    assert.strictEqual(overrideFiles.length, 2);

    const draftMarkers = scanFileAtPath(ignoredDraft, {
      tags: ['note'],
      fileExtensions: ['ts'],
      scanIncludePaths: [],
    });
    assert.strictEqual(draftMarkers.length, 1);
    assert.strictEqual(draftMarkers[0].tag, 'note');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function testIndexReplaceAndNavigation(): void {
  const store = new InlineAnnotationStore();
  store.replaceFileMarkers('/proj/a.ts', [
    {
      id: '/proj/a.ts:0:todo',
      tag: 'todo',
      filePath: '/proj/a.ts',
      line: 0,
      column: 3,
      preview: 'first',
    },
    {
      id: '/proj/a.ts:5:note',
      tag: 'note',
      filePath: '/proj/a.ts',
      line: 5,
      column: 3,
      preview: 'second',
    },
  ]);

  store.replaceFileMarkers('/proj/b.ts', [
    {
      id: '/proj/b.ts:2:fix',
      tag: 'fix',
      filePath: '/proj/b.ts',
      line: 2,
      column: 3,
      preview: 'third',
    },
  ]);

  const next = store.getNextMarker('/proj/a.ts', 0);
  assert.ok(next);
  assert.strictEqual(next?.line, 5);

  const nextAfterB = store.getNextMarker('/proj/b.ts', 2);
  assert.ok(nextAfterB);
  assert.strictEqual(nextAfterB?.filePath, '/proj/a.ts');

  store.replaceFileMarkers('/proj/a.ts', []);
  assert.strictEqual(store.getAllSorted().length, 1);
}

function testTreeGroupingViaIndex(): void {
  const store = new InlineAnnotationStore();
  store.replaceAll([
    {
      id: 'a:1:todo',
      tag: 'todo',
      filePath: '/a.ts',
      line: 1,
      column: 0,
      preview: 'alpha',
    },
    {
      id: 'b:2:note',
      tag: 'note',
      filePath: '/b.ts',
      line: 2,
      column: 0,
      preview: 'beta',
    },
    {
      id: 'c:3:fix',
      tag: 'fix',
      filePath: '/c.ts',
      line: 3,
      column: 0,
      preview: 'gamma',
    },
  ]);

  const tags = store.getTags();
  assert.deepStrictEqual(tags, ['todo', 'fix', 'note']);
  assert.strictEqual(store.getByTag('todo').length, 1);
  assert.strictEqual(store.getGroupedByTag().size, 3);
}

runTests();
