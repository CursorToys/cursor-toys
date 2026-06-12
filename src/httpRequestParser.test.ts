import * as assert from 'assert';
import { expandSectionSubBlocks } from './httpRequestParser';
import type { HttpRequestBlock } from './httpRequestParser';

function mockDocument(content: string): {
  lineCount: number;
  lineAt: (n: number) => { text: string };
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
  testExpandSectionSubBlocks();
  console.log('All httpRequestParser sub-block tests passed.');
}

function testExpandSectionSubBlocks(): void {
  const content = `## Users

### List users
GET {{BASE}}/users

###

### Create user
POST {{BASE}}/users
Content-Type: application/json

{}
`;
  const doc = mockDocument(content);
  const section: HttpRequestBlock = {
    title: 'Users',
    titleLine: 0,
    startLine: 0,
    endLine: doc.lineCount - 1,
    envName: null,
    kind: 'section',
  };
  const blocks = expandSectionSubBlocks(doc as never, section);
  assert.strictEqual(blocks.length, 2);
  assert.strictEqual(blocks[0].kind, 'rest');
  assert.strictEqual(blocks[1].kind, 'rest');
}

runTests();
