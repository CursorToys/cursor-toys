import * as assert from 'assert';
import { extractAssertions } from './assertionParser';

function runTests(): void {
  testTwoParamNoValueOperators();
  testThreeParamWithDescriptionNoValue();
  testThreeParamWithValue();
  testFourParamWithDescription();
  console.log('All assertionParser tests passed.');
}

function testTwoParamNoValueOperators(): void {
  const content = `/*
 * @assert("res.body.data", "isArray")
 * @assert("res.body", "isJson")
 */`;
  const assertions = extractAssertions(content);
  assert.strictEqual(assertions.length, 2);
  assert.strictEqual(assertions[0].expression, 'res.body.data');
  assert.strictEqual(assertions[0].operator, 'isArray');
  assert.strictEqual(assertions[1].expression, 'res.body');
  assert.strictEqual(assertions[1].operator, 'isJson');
}

function testThreeParamWithDescriptionNoValue(): void {
  const content = `/*
 * @assert("ok", "res.body.data", "isArray")
 */`;
  const assertions = extractAssertions(content);
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].description, 'ok');
  assert.strictEqual(assertions[0].expression, 'res.body.data');
  assert.strictEqual(assertions[0].operator, 'isArray');
  assert.strictEqual(assertions[0].expected, null);
}

function testThreeParamWithValue(): void {
  const content = `/*
 * @assert("res.status", "equals", 200)
 */`;
  const assertions = extractAssertions(content);
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].expression, 'res.status');
  assert.strictEqual(assertions[0].operator, 'equals');
  assert.strictEqual(assertions[0].expected, 200);
}

function testFourParamWithDescription(): void {
  const content = `/*
 * @assert("Status ok", "res.status", "equals", 200)
 */`;
  const assertions = extractAssertions(content);
  assert.strictEqual(assertions.length, 1);
  assert.strictEqual(assertions[0].description, 'Status ok');
  assert.strictEqual(assertions[0].expression, 'res.status');
  assert.strictEqual(assertions[0].operator, 'equals');
  assert.strictEqual(assertions[0].expected, 200);
}

runTests();
