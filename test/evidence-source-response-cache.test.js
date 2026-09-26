'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { clearSourceResponseCache, secureGet } = require('../src/evidence-search/providers/secure-http-transport');

const lookup = async () => [{ address: '8.8.8.8', family: 4 }];

function response(body = '{"ok":true}', headers = {}) {
  return { status: 200, headers, body: Buffer.from(body) };
}

test('raw public source response cache reuses only the same validated URL and headers', async () => {
  clearSourceResponseCache();
  let calls = 0;
  const request = async () => { calls += 1; return response(`{"call":${calls}}`); };
  const options = {
    allowedHosts: ['example.com'],
    lookup,
    request,
    cacheTtlMs: 5000
  };

  const first = await secureGet('https://example.com/data?q=node22', options);
  const second = await secureGet('https://example.com/data?q=node22', options);
  assert.equal(calls, 1);
  assert.equal(first.cache.status, 'MISS');
  assert.equal(second.cache.status, 'HIT');
  assert.equal(second.body.toString(), first.body.toString());

  const differentUrl = await secureGet('https://example.com/data?q=node24', options);
  assert.equal(calls, 2);
  assert.equal(differentUrl.cache.status, 'MISS');
});

test('source cache never reuses authenticated request material', async () => {
  clearSourceResponseCache();
  let calls = 0;
  const request = async () => { calls += 1; return response(`{"call":${calls}}`); };
  const options = {
    allowedHosts: ['example.com'],
    lookup,
    request,
    cacheTtlMs: 5000,
    headers: { Authorization: 'Bearer secret' }
  };

  const first = await secureGet('https://example.com/private', options);
  const second = await secureGet('https://example.com/private', options);
  assert.equal(calls, 2);
  assert.equal(first.cache.status, 'MISS');
  assert.equal(second.cache.status, 'MISS');
});

test('non-2xx and Set-Cookie responses are never cached', async () => {
  clearSourceResponseCache();
  let errorCalls = 0;
  const errorRequest = async () => { errorCalls += 1; return { status: 503, headers: {}, body: Buffer.from('unavailable') }; };
  const base = { allowedHosts: ['example.com'], lookup, cacheTtlMs: 5000 };
  await secureGet('https://example.com/error', { ...base, request: errorRequest });
  await secureGet('https://example.com/error', { ...base, request: errorRequest });
  assert.equal(errorCalls, 2);

  clearSourceResponseCache();
  let cookieCalls = 0;
  const cookieRequest = async () => { cookieCalls += 1; return response('ok', { 'set-cookie': ['sid=abc'] }); };
  await secureGet('https://example.com/cookie', { ...base, request: cookieRequest });
  await secureGet('https://example.com/cookie', { ...base, request: cookieRequest });
  assert.equal(cookieCalls, 2);
});

test('source cache never bypasses the current maxBytes response limit', async () => {
  clearSourceResponseCache();
  let calls = 0;
  const body = 'x'.repeat(4096);
  const request = async (_url, _address, requestOptions) => {
    calls += 1;
    const result = response(body);
    if (result.body.length > requestOptions.maxBytes) {
      const error = new Error('official source response exceeds maximum bytes');
      error.code = 'SOURCE_RESPONSE_TOO_LARGE';
      throw error;
    }
    return result;
  };
  const base = {
    allowedHosts: ['example.com'],
    lookup,
    request,
    cacheTtlMs: 5000
  };

  const first = await secureGet('https://example.com/large', { ...base, maxBytes: 8192 });
  assert.equal(first.body.length, 4096);
  assert.equal(first.cache.status, 'MISS');

  await assert.rejects(
    () => secureGet('https://example.com/large', { ...base, maxBytes: 1024 }),
    (error) => error?.code === 'SOURCE_RESPONSE_TOO_LARGE'
  );
  assert.equal(calls, 2);
});
