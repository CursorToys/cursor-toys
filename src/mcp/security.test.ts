import * as assert from 'assert';
import {
  isDestructiveTool,
  isSecretEnvKey,
  redactSecrets,
  requireConfirmForDestructive,
  resetRateLimitsForTests,
  checkRateLimit,
  truncatePreview,
} from './security';

function runTests(): void {
  testDestructiveTools();
  testConfirmGate();
  testSecretRedaction();
  testRateLimit();
  testTruncatePreview();
  console.log('All mcp/security tests passed.');
}

function testDestructiveTools(): void {
  assert.strictEqual(isDestructiveTool('kanban_delete'), true);
  assert.strictEqual(isDestructiveTool('anchor_clear'), true);
  assert.strictEqual(isDestructiveTool('kanban_list'), false);
}

function testConfirmGate(): void {
  assert.throws(() => requireConfirmForDestructive('kanban_delete', {}, false));
  assert.doesNotThrow(() => requireConfirmForDestructive('kanban_delete', { confirm: true }, false));
  assert.doesNotThrow(() => requireConfirmForDestructive('kanban_delete', {}, true));
  assert.doesNotThrow(() => requireConfirmForDestructive('kanban_list', {}, false));
}

function testSecretRedaction(): void {
  assert.strictEqual(isSecretEnvKey('API_KEY'), true);
  assert.strictEqual(isSecretEnvKey('GITHUB_TOKEN'), true);
  assert.strictEqual(isSecretEnvKey('HOST'), false);
  const redacted = redactSecrets({ HOST: 'localhost', API_KEY: 'secret123' });
  assert.strictEqual(redacted.HOST, 'localhost');
  assert.strictEqual(redacted.API_KEY, '[REDACTED]');
}

function testRateLimit(): void {
  resetRateLimitsForTests();
  for (let i = 0; i < 30; i++) {
    checkRateLimit('http_run');
  }
  assert.throws(() => checkRateLimit('http_run'));
  resetRateLimitsForTests();
}

function testTruncatePreview(): void {
  const long = 'a'.repeat(300);
  assert.strictEqual(truncatePreview(long, 200).length, 201);
}

runTests();
