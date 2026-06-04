import * as assert from 'assert';
import { parseDeepInfraChecklist } from './deepInfraBilling';

function runTests(): void {
  const credit = parseDeepInfraChecklist({
    stripe_balance: -25.5,
    recent: 10.2,
    limit: 100,
  });
  assert.strictEqual(credit.balanceUsd, 25.5);
  assert.strictEqual(credit.remainingUsd, 15.3);
  assert.strictEqual(credit.owedUsd, 0);
  assert.strictEqual(credit.recentUsageUsd, 10.2);

  const wallet = parseDeepInfraChecklist({ stripe_balance: -5, recent: 0.02, limit: null });
  assert.strictEqual(wallet.remainingUsd, 4.98);

  const owed = parseDeepInfraChecklist({ stripe_balance: 12, recent: 0, limit: null });
  assert.strictEqual(owed.owedUsd, 12);
  assert.strictEqual(owed.balanceUsd, 0);

  console.log('All providerUsage deepInfraBilling tests passed.');
}

runTests();
