import * as assert from 'assert';
import { aggregateActivityByModel, parseOpenRouterActivityItems } from './openRouterActivity';

function runTests(): void {
  const items = parseOpenRouterActivityItems({
    data: [
      {
        date: '2026-06-01',
        model: 'gpt-4o',
        model_permaslug: 'openai/gpt-4o',
        requests: 2,
        prompt_tokens: 100,
        completion_tokens: 50,
        usage: 0.5,
      },
      {
        date: '2026-06-02',
        model: 'gpt-4o',
        model_permaslug: 'openai/gpt-4o',
        requests: 1,
        prompt_tokens: 40,
        completion_tokens: 20,
        usage: 0.2,
      },
      {
        date: '2026-06-01',
        model: 'claude',
        model_permaslug: 'anthropic/claude-3.5-sonnet',
        requests: 3,
        prompt_tokens: 200,
        completion_tokens: 80,
        usage: 1.1,
      },
    ],
  });

  const summary = aggregateActivityByModel(items);
  assert.strictEqual(summary.totalRequests, 6);
  assert.strictEqual(summary.totalPromptTokens, 340);
  assert.strictEqual(summary.totalCompletionTokens, 150);
  assert.strictEqual(summary.models.length, 2);
  assert.strictEqual(summary.models[0].modelPermaslug, 'anthropic/claude-3.5-sonnet');
  assert.strictEqual(summary.models[0].usageUsd, 1.1);

  console.log('All providerUsage openRouterActivity tests passed.');
}

runTests();
