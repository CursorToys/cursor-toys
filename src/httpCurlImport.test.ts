import * as assert from 'assert';
import { isCurlCommand, normalizeCurlInput } from './httpRequestParse';
import { curlToFormData } from './httpCurlImport';

function runTests(): void {
  testNormalizeMultilineCurl();
  testIsCurlCommand();
  testSimpleGet();
  testPostWithHeadersAndBody();
  testPostInferredFromData();
  testRequestFlag();
  console.log('All httpCurlImport tests passed.');
}

function testNormalizeMultilineCurl(): void {
  const input = `curl -X POST 'https://api.example.com/users' \\
  -H 'Content-Type: application/json' \\
  -d '{"name":"Ada"}'`;
  const normalized = normalizeCurlInput(input);
  assert.ok(!normalized.includes('\n'));
  assert.ok(normalized.includes('-H'));
}

function testIsCurlCommand(): void {
  assert.strictEqual(isCurlCommand('curl https://example.com'), true);
  assert.strictEqual(isCurlCommand('GET https://example.com'), false);
  assert.strictEqual(isCurlCommand('  CURL -X GET https://x.test'), true);
}

function testSimpleGet(): void {
  const form = curlToFormData("curl 'https://api.github.com/users/octocat'");
  assert.ok(form);
  assert.strictEqual(form!.method, 'GET');
  assert.strictEqual(form!.url, 'https://api.github.com/users/octocat');
}

function testPostWithHeadersAndBody(): void {
  const form = curlToFormData(
    `curl -X POST 'https://api.example.com/items' -H 'Content-Type: application/json' -d '{"id":1}'`
  );
  assert.ok(form);
  assert.strictEqual(form!.method, 'POST');
  assert.strictEqual(form!.url, 'https://api.example.com/items');
  assert.ok(form!.headers.some((h) => h.key === 'Content-Type'));
  assert.strictEqual(form!.body, '{"id":1}');
}

function testPostInferredFromData(): void {
  const form = curlToFormData(`curl 'https://api.example.com/items' -d '{"id":1}'`);
  assert.ok(form);
  assert.strictEqual(form!.method, 'POST');
}

function testRequestFlag(): void {
  const form = curlToFormData(`curl --request DELETE 'https://api.example.com/items/1'`);
  assert.ok(form);
  assert.strictEqual(form!.method, 'DELETE');
}

if (require.main === module) {
  runTests();
}
