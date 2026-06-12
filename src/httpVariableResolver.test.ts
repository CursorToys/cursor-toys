import * as assert from 'assert';
import { replaceCustomVariables } from './httpVariableResolver';
import { replaceDynamicVariables } from './httpDynamicVariables';

function runTests(): void {
  testCustomReplace();
  testDynamicInPipeline();
  console.log('All httpVariableResolver tests passed.');
}

function testCustomReplace(): void {
  const vars = new Map([['API', 'https://api.example.com']]);
  const out = replaceCustomVariables('GET {{API}}/users', vars);
  assert.strictEqual(out, 'GET https://api.example.com/users');
}

function testDynamicInPipeline(): void {
  const custom = new Map([['TOKEN', 'from-file']]);
  let out = replaceCustomVariables('Bearer {{TOKEN}} id={{$guid}}', custom);
  out = replaceDynamicVariables(out);
  assert.ok(out.startsWith('Bearer from-file'));
  assert.ok(!out.includes('$guid'));
}

runTests();
