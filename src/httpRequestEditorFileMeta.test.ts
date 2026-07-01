import * as assert from 'assert';
import {
  upsertFileVariable,
  parseSectionLocalEnv,
  parseFileGlobalEnv,
  findSectionHeaderLine,
  setFileGlobalEnv,
} from './httpRequestEditorFileMeta';

const HEADER = `# @var API=https://api.example.com

## Get user
GET {{API}}/user
`;

function runTests(): void {
  testUpsertUpdatesValue();
  testUpsertRenamesKey();
  testRemoveVariable();
  testParseSectionLocalEnvAfterHeader();
  testParseSectionLocalEnvIgnoresFileGlobal();
  testSetFileGlobalEnvInsertsAtTop();
  testSetFileGlobalEnvIgnoresSectionEnv();
  console.log('All httpRequestEditorFileMeta tests passed.');
}

function testUpsertUpdatesValue(): void {
  const next = upsertFileVariable(HEADER, 'API', 'https://v2.example.com');
  assert.ok(next.includes('# @var API=https://v2.example.com'));
  assert.ok(!next.includes('https://api.example.com'));
}

function testUpsertRenamesKey(): void {
  let next = upsertFileVariable(HEADER, 'API', null);
  next = upsertFileVariable(next, 'BASE_URL', 'https://api.example.com');
  assert.ok(next.includes('# @var BASE_URL=https://api.example.com'));
  assert.ok(!next.includes('# @var API='));
}

function testRemoveVariable(): void {
  const next = upsertFileVariable(HEADER, 'API', null);
  assert.ok(!next.includes('@var API'));
}

function testParseSectionLocalEnvAfterHeader(): void {
  const lines = [
    '# @env dev',
    '',
    '## Users',
    '# @env qa',
    'GET https://example.com',
  ];
  assert.strictEqual(parseSectionLocalEnv(lines, 4), 'qa');
  assert.strictEqual(findSectionHeaderLine(lines, 4), 2);
}

function testParseSectionLocalEnvIgnoresFileGlobal(): void {
  const lines = [
    '# @env dev',
    '## Users',
    'GET https://example.com',
  ];
  assert.strictEqual(parseSectionLocalEnv(lines, 2), null);
  assert.strictEqual(parseFileGlobalEnv(lines), 'dev');
}

function testSetFileGlobalEnvInsertsAtTop(): void {
  const content = '\n## Users\n# @env qa\nGET https://example.com\n';
  const next = setFileGlobalEnv(content, 'stg');
  assert.ok(next.startsWith('# @env stg\n'), 'file env must be first line');
  assert.ok(next.includes('# @env qa'), 'section env must be preserved');
}

function testSetFileGlobalEnvIgnoresSectionEnv(): void {
  const content = '## Users\n# @env qa\nGET https://example.com\n';
  const next = setFileGlobalEnv(content, 'stg');
  assert.ok(next.startsWith('# @env stg\n'), 'file env must be inserted at top');
  const lines = next.split('\n');
  const sectionEnvIdx = lines.findIndex((l) => l.trim() === '# @env qa');
  assert.ok(sectionEnvIdx > 0, 'section-level env must remain after header');
}

runTests();
