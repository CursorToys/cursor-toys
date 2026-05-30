import * as assert from 'assert';
import {
  formFromFileBlock,
  mergeRequestFormIntoFile,
  serializeRestClientRequest,
} from './httpRequestEditorSerializer';

const SAMPLE = `# @env default

## Authenticated user profile
GET {{GITHUB_API}}/user
Accept: application/vnd.github+json
Authorization: Bearer {{GITHUB_TOKEN}}

/*
 * @assert("ok", "res.status", "equals", 200)
 */

###

## Rate limit
GET {{GITHUB_API}}/rate_limit
Accept: application/vnd.github+json
`;

function runTests(): void {
  testSingleSectionRoundTrip();
  testPreservesAssertions();
  testMultiSectionIsolation();
  console.log('All httpRequestEditorSerializer tests passed.');
}

function testSingleSectionRoundTrip(): void {
  const block = { startLine: 3, endLine: 12 };
  const form = formFromFileBlock(SAMPLE, block);
  assert.strictEqual(form.method, 'GET');
  assert.ok(form.url.includes('{{GITHUB_API}}'));
  assert.ok(form.headers.some((h) => h.key === 'Accept'));

  const merged = mergeRequestFormIntoFile(SAMPLE, block, {
    ...form,
    url: '{{GITHUB_API}}/user?v=2',
  });
  const again = formFromFileBlock(merged, block);
  assert.strictEqual(again.url, '{{GITHUB_API}}/user?v=2');
  assert.ok(merged.includes('@assert'));
}

function testPreservesAssertions(): void {
  const block = { startLine: 3, endLine: 12 };
  const merged = mergeRequestFormIntoFile(SAMPLE, block, {
    method: 'POST',
    url: 'https://api.example.com/x',
    headers: [{ key: 'Content-Type', value: 'application/json' }],
    body: '{"a":1}',
  });
  assert.ok(merged.includes('@assert("ok"'));
  assert.ok(merged.includes('POST https://api.example.com/x'));
  assert.ok(merged.includes('## Rate limit'));
}

function testMultiSectionIsolation(): void {
  const second = { startLine: 14, endLine: 22 };
  const merged = mergeRequestFormIntoFile(SAMPLE, second, {
    method: 'DELETE',
    url: '{{GITHUB_API}}/rate_limit',
    headers: [{ key: 'Accept', value: 'application/json' }],
    body: '',
  });
  assert.ok(merged.includes('GET {{GITHUB_API}}/user'));
  assert.ok(merged.includes('DELETE {{GITHUB_API}}/rate_limit'));
  assert.ok(!merged.match(/GET \{\{GITHUB_API\}\}\/rate_limit/));
}

function testSerialize(): void {
  const text = serializeRestClientRequest({
    method: 'post',
    url: 'https://x.test',
    headers: [{ key: 'A', value: 'b' }],
    body: '{}',
  });
  assert.ok(text.startsWith('POST https://x.test'));
  assert.ok(text.includes('A: b'));
}

if (require.main === module) {
  testSerialize();
  runTests();
}
