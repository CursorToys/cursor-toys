import * as assert from 'assert';
import { upsertFileVariable } from './httpRequestEditorFileMeta';

const HEADER = `# @var API=https://api.example.com

## Get user
GET {{API}}/user
`;

function runTests(): void {
  testUpsertUpdatesValue();
  testUpsertRenamesKey();
  testRemoveVariable();
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

runTests();
