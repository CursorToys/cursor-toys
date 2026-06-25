import * as assert from 'assert';
import { validateAssertions } from './assertionValidator';
import type { Assertion } from './assertionTypes';
import type { HttpRequestResult } from './httpRequestExecutor';

function runTests(): void {
  testIsArrayOnBodyData();
  testIsJsonOnBody();
  testNestedPath();
  testOperatorCaseInsensitive();
  console.log('All assertionValidator tests passed.');
}

function mockResponse(body: string, statusCode = 200): HttpRequestResult {
  return {
    statusCode,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body,
  };
}

function testIsArrayOnBodyData(): void {
  const assertions: Assertion[] = [
    {
      expression: 'res.body.data',
      operator: 'isArray',
      expected: null,
    },
  ];
  const results = validateAssertions(assertions, mockResponse(JSON.stringify({ data: [] })));
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].passed, true);
}

function testIsJsonOnBody(): void {
  const assertions: Assertion[] = [
    {
      expression: 'res.body',
      operator: 'isJson',
      expected: null,
    },
  ];
  const results = validateAssertions(assertions, mockResponse(JSON.stringify({ id: 1 })));
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].passed, true);
}

function testNestedPath(): void {
  const assertions: Assertion[] = [
    {
      expression: 'res.body.items[0].id',
      operator: 'equals',
      expected: 42,
    },
  ];
  const results = validateAssertions(
    assertions,
    mockResponse(JSON.stringify({ items: [{ id: 42 }] }))
  );
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].passed, true);
  assert.strictEqual(results[0].actualValue, 42);
}

function testOperatorCaseInsensitive(): void {
  const assertions: Assertion[] = [
    {
      expression: 'res.body',
      operator: 'isJSON' as Assertion['operator'],
      expected: null,
    },
  ];
  const results = validateAssertions(assertions, mockResponse(JSON.stringify({ ok: true })));
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].passed, true);
}

runTests();
