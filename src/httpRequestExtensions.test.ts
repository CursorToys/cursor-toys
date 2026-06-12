import * as assert from 'assert';
import {
  getHttpResponseExtension,
  isHttpRequestExtension,
} from './httpRequestExtensions';

function isHttpRequestPath(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  if (
    !normalizedPath.includes('/.cursor/http/') &&
    !normalizedPath.includes('/.vscode/http/')
  ) {
    return false;
  }
  const ext = normalizedPath.split('.').pop()?.toLowerCase() ?? '';
  return isHttpRequestExtension(ext);
}

function getResponsePath(requestPath: string): string {
  const normalized = requestPath.replace(/\\/g, '/');
  const lastSlash = normalized.lastIndexOf('/');
  const fileName = normalized.slice(lastSlash + 1);
  const dir = normalized.slice(0, lastSlash);
  const dot = fileName.lastIndexOf('.');
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot >= 0 ? fileName.slice(dot + 1) : '';
  return `${dir}/${base}.${getHttpResponseExtension(ext)}`;
}

function runTests(): void {
  testExtensions();
  testPathRecognition();
  testResponsePaths();
  console.log('All httpRequestExtensions tests passed.');
}

function testExtensions(): void {
  assert.ok(isHttpRequestExtension('req'));
  assert.ok(isHttpRequestExtension('http'));
  assert.ok(isHttpRequestExtension('rest'));
  assert.ok(!isHttpRequestExtension('txt'));
  assert.strictEqual(getHttpResponseExtension('req'), 'res');
  assert.strictEqual(getHttpResponseExtension('http'), 'http.res');
  assert.strictEqual(getHttpResponseExtension('rest'), 'rest.res');
}

function testPathRecognition(): void {
  assert.ok(isHttpRequestPath('/project/.cursor/http/api.http'));
  assert.ok(isHttpRequestPath('/project/.cursor/http/api.rest'));
  assert.ok(!isHttpRequestPath('/project/.cursor/http/readme.md'));
  assert.ok(!isHttpRequestPath('/project/src/api.http'));
}

function testResponsePaths(): void {
  assert.strictEqual(
    getResponsePath('/project/.cursor/http/api.http'),
    '/project/.cursor/http/api.http.res'
  );
  assert.strictEqual(
    getResponsePath('/project/.cursor/http/api.rest'),
    '/project/.cursor/http/api.rest.res'
  );
}

runTests();
