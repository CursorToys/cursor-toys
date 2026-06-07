import * as assert from 'assert';
import { parseOpenRouterKeyInfoBody } from './openRouterKeyInfo';
import { OpenRouterCreditsError } from './openRouterCredits';

function runTests(): void {
  const result = parseOpenRouterKeyInfoBody({
    data: {
      label: 'cursor-monitor',
      limit: 50,
      limit_remaining: 12.5,
      limit_reset: 'monthly',
      usage: 37.5,
      usage_daily: 1.2,
      usage_weekly: 4.5,
      usage_monthly: 10,
      is_free_tier: false,
    },
  });

  assert.strictEqual(result.label, 'cursor-monitor');
  assert.strictEqual(result.limit, 50);
  assert.strictEqual(result.limitRemaining, 12.5);
  assert.strictEqual(result.usageMonthly, 10);

  assert.throws(
    () => parseOpenRouterKeyInfoBody({ data: {} }),
    (e: unknown) => e instanceof OpenRouterCreditsError
  );

  console.log('All providerUsage openRouterKeyInfo tests passed.');
}

runTests();
