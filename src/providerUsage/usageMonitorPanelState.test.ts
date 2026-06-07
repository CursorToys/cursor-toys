import * as assert from 'assert';
import { resolveUsageMonitorPanelState } from './usageMonitorPanelState';
import { maskApiKey } from './maskApiKey';

function runTests(): void {
  assert.strictEqual(
    resolveUsageMonitorPanelState({ openRouter: false, deepInfra: false }),
    'empty'
  );
  assert.strictEqual(
    resolveUsageMonitorPanelState({ openRouter: true, deepInfra: false }),
    'openRouterOnly'
  );
  assert.strictEqual(
    resolveUsageMonitorPanelState({ openRouter: false, deepInfra: true }),
    'deepInfraOnly'
  );
  assert.strictEqual(
    resolveUsageMonitorPanelState({ openRouter: true, deepInfra: true }),
    'both'
  );

  assert.strictEqual(maskApiKey('sk-or-v1-abcdefghijklmnop'), 'sk-o••••••••••••mnop');
  assert.strictEqual(maskApiKey('short'), '••••••••');

  console.log('All providerUsage usageMonitorPanelState tests passed.');
}

runTests();
