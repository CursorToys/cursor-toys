import * as assert from 'assert';
import {
  extractGlobalFileVariables,
  extractRequestScopedVariables,
  mergeCustomVariables,
  listVariableDefinitions,
} from './httpRequestVariables';

interface MockLine {
  text: string;
}

function mockDocument(content: string): {
  lineCount: number;
  lineAt: (n: number) => MockLine;
  getText: () => string;
} {
  const lines = content.split('\n');
  return {
    lineCount: lines.length,
    lineAt: (n: number) => ({ text: lines[n] ?? '' }),
    getText: () => content,
  };
}

function runTests(): void {
  testGlobalVars();
  testRequestScopedVars();
  testMergePriority();
  testListDefinitions();
  console.log('All httpRequestVariables tests passed.');
}

function testGlobalVars(): void {
  const doc = mockDocument(`# @var BASE=https://global.example.com

###
# @var TOKEN=block-a
GET {{BASE}}/a

###
# @var TOKEN=block-b
GET {{BASE}}/b
`);
  const globals = extractGlobalFileVariables(doc as never);
  assert.strictEqual(globals.get('BASE'), 'https://global.example.com');
}

function testRequestScopedVars(): void {
  const doc = mockDocument(`# @var BASE=https://global.example.com

###
# @var TOKEN=block-a
GET {{BASE}}/a

###
# @var TOKEN=block-b
GET {{BASE}}/b
`);
  const blockA = extractRequestScopedVariables(doc as never, 4);
  assert.strictEqual(blockA.get('TOKEN'), 'block-a');
  const blockB = extractRequestScopedVariables(doc as never, 8);
  assert.strictEqual(blockB.get('TOKEN'), 'block-b');
}

function testMergePriority(): void {
  const doc = mockDocument(`# @var KEY=file
###
# @var KEY=request
GET {{KEY}}/x
`);
  const merged = mergeCustomVariables(doc as never, 3);
  assert.strictEqual(merged.get('KEY'), 'request');
}

function testListDefinitions(): void {
  const doc = mockDocument(`# @var FILE_VAR=1
###
# @var REQ_VAR=2
GET {{FILE_VAR}}/{{REQ_VAR}}
`);
  const defs = listVariableDefinitions(doc as never);
  assert.strictEqual(defs.find((d) => d.name === 'FILE_VAR')?.scope, 'file');
  assert.strictEqual(defs.find((d) => d.name === 'REQ_VAR')?.scope, 'request');
}

runTests();
