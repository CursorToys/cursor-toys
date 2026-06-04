import * as assert from 'assert';
import {
  OpenRouterCreditsError,
  parseOpenRouterCreditsBody,
  mapCreditsHttpStatus,
} from './openRouterCredits';

function runTests(): void {
  const result = parseOpenRouterCreditsBody({
    data: { total_credits: 100, total_usage: 42.5 },
  });
  assert.strictEqual(result.remaining, 57.5);

  assert.throws(
    () => parseOpenRouterCreditsBody({ data: { total_credits: 1 } }),
    (e: unknown) => e instanceof OpenRouterCreditsError
  );

  const forbidden = mapCreditsHttpStatus(403, '{"error":{"message":"mgmt"}}');
  assert.strictEqual(forbidden.code, 'forbidden');

  console.log('All providerUsage openRouterCredits tests passed.');
}

runTests();
