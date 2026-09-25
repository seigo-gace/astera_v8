'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ReplayNonceGuard,
  createInternalHeaders,
  verifyInternalRequest
} = require('../src/internal-service-auth');
const EvidenceSearchClient = require('../src/evidence-search/api/client');

const SECRET = '0123456789abcdef0123456789abcdef';

test('internal authentication accepts a configured service allowlist and keeps legacy exact-service mode', () => {
  const body = JSON.stringify({ hello: 'world' });
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const headers = createInternalHeaders({ body, secret: SECRET, service: 'debug-ai', callerId: 'caller-1', requestId: 'request-1', now, nonce: 'nonce-1' });
  const identity = verifyInternalRequest({ headers, body, secret: SECRET, nonceGuard: new ReplayNonceGuard(), expectedServices: ['astera-main', 'debug-ai'], now });
  assert.equal(identity.service, 'debug-ai');

  const legacyHeaders = createInternalHeaders({ body, secret: SECRET, service: 'astera-main', callerId: 'caller-2', requestId: 'request-2', now, nonce: 'nonce-2' });
  const legacy = verifyInternalRequest({ headers: legacyHeaders, body, secret: SECRET, nonceGuard: new ReplayNonceGuard(), expectedService: 'astera-main', now });
  assert.equal(legacy.service, 'astera-main');
});

test('internal authentication rejects a service outside the allowlist', () => {
  const body = '{}';
  const now = Date.parse('2026-09-25T00:00:00.000Z');
  const headers = createInternalHeaders({ body, secret: SECRET, service: 'unknown-service', callerId: 'caller-1', requestId: 'request-1', now, nonce: 'nonce-3' });
  assert.throws(
    () => verifyInternalRequest({ headers, body, secret: SECRET, nonceGuard: new ReplayNonceGuard(), expectedServices: ['astera-main', 'debug-ai'], now }),
    (error) => error && error.code === 'INTERNAL_SERVICE_FORBIDDEN'
  );
});

test('EvidenceSearchClient signs requests with the configured caller service', async () => {
  let capturedHeaders = null;
  const client = new EvidenceSearchClient({
    baseUrl: 'http://127.0.0.1:7376',
    internalSecret: SECRET,
    service: 'debug-ai',
    fetch: async (_url, init) => {
      capturedHeaders = init.headers;
      return { ok: true, async text() { return JSON.stringify({ status: 'FINAL_VALID' }); } };
    }
  });
  const result = await client.search({ question: 'test' }, { callerId: 'debug-runner', requestId: 'req-client-1' });
  assert.equal(result.status, 'FINAL_VALID');
  assert.equal(capturedHeaders['x-astera-service'], 'debug-ai');
});
