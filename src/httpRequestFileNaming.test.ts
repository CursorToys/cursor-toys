import * as assert from 'assert';
import {
  formatHttpRequestDatePrefix,
  nextDateBasedHttpFileBaseName,
} from './httpRequestFileNaming';

function runTests(): void {
  testFormatDatePrefix();
  testNextBaseNameStartsAtOne();
  testNextBaseNameIncrements();
  testNextBaseNameIgnoresOtherDates();
  console.log('All httpRequestFileNaming tests passed.');
}

function testFormatDatePrefix(): void {
  const prefix = formatHttpRequestDatePrefix(new Date(2026, 5, 17));
  assert.strictEqual(prefix, '2026-06-17');
}

function testNextBaseNameStartsAtOne(): void {
  const base = nextDateBasedHttpFileBaseName([], new Date(2026, 5, 17));
  assert.strictEqual(base, '2026-06-17-01');
}

function testNextBaseNameIncrements(): void {
  const date = new Date(2026, 5, 17);
  const base = nextDateBasedHttpFileBaseName(
    ['2026-06-17-01.req', '2026-06-17-02.req', 'auth/login.req'],
    date
  );
  assert.strictEqual(base, '2026-06-17-03');
}

function testNextBaseNameIgnoresOtherDates(): void {
  const date = new Date(2026, 5, 17);
  const base = nextDateBasedHttpFileBaseName(['2026-06-16-99.req', '2026-06-18-01.req'], date);
  assert.strictEqual(base, '2026-06-17-01');
}

runTests();
