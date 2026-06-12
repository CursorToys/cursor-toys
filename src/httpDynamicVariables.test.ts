import * as assert from 'assert';
import {
  evaluateDynamicVariable,
  parseOffset,
  replaceDynamicVariables,
} from './httpDynamicVariables';

function runTests(): void {
  testGuid();
  testRandomInt();
  testTimestamp();
  testDatetime();
  testProcessEnv();
  testDotenv();
  testOffset();
  testReplaceAll();
  console.log('All httpDynamicVariables tests passed.');
}

function testGuid(): void {
  const value = evaluateDynamicVariable('guid', '');
  assert.match(value, /^[0-9a-f-]{36}$/i);
}

function testRandomInt(): void {
  const value = evaluateDynamicVariable('randomInt', '1 10');
  const n = parseInt(value, 10);
  assert.ok(n >= 1 && n <= 10);
}

function testTimestamp(): void {
  const before = Date.now();
  const value = evaluateDynamicVariable('timestamp', '');
  const after = Date.now();
  const ts = parseInt(value, 10);
  assert.ok(ts >= before && ts <= after + 5);
}

function testDatetime(): void {
  const iso = evaluateDynamicVariable('datetime', 'iso8601');
  assert.ok(iso.includes('T'));
  const rfc = evaluateDynamicVariable('datetime', 'rfc1123');
  assert.ok(rfc.includes('GMT') || rfc.includes('UTC'));
}

function testProcessEnv(): void {
  process.env.CURSOR_TOYS_TEST_VAR = 'hello world';
  const raw = evaluateDynamicVariable('processEnv', 'CURSOR_TOYS_TEST_VAR');
  assert.strictEqual(raw, 'hello world');
  const encoded = evaluateDynamicVariable('processEnv', '%CURSOR_TOYS_TEST_VAR');
  assert.strictEqual(encoded, 'hello%20world');
  delete process.env.CURSOR_TOYS_TEST_VAR;
}

function testDotenv(): void {
  const map = new Map<string, string>([['api_key', 'secret']]);
  const value = evaluateDynamicVariable('dotenv', 'API_KEY', { dotenvVariables: map });
  assert.strictEqual(value, 'secret');
}

function testOffset(): void {
  assert.strictEqual(parseOffset(['-1', 'd']), -86400000);
  assert.strictEqual(parseOffset(['+2', 'h']), 7200000);
}

function testReplaceAll(): void {
  const input = 'id={{ $guid }} ts={{ $timestamp }}';
  const out = replaceDynamicVariables(input);
  assert.ok(!out.includes('$guid'));
  assert.ok(!out.includes('$timestamp'));
}

runTests();
