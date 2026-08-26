'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const EvidenceSearchClient = require('../src/evidence-search/api/client');

function hangingFetch(_url, options) {
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
}

test('external request cancellation is distinct from evidence timeout', async () => {
  const client = new EvidenceSearchClient({ fetch: hangingFetch, timeoutMs: 1000, internalSecret: 'x'.repeat(32) });
  const controller = new AbortController();
  const pending = client.search({}, { requestId: 'r1', tenantId: 't1', signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { code: 'EVIDENCE_API_CANCELLED', status: 499 });
});

test('internal evidence timeout remains EVIDENCE_API_TIMEOUT', async () => {
  const client = new EvidenceSearchClient({ fetch: hangingFetch, timeoutMs: 10, internalSecret: 'x'.repeat(32) });
  await assert.rejects(client.search({}, { requestId: 'r2', tenantId: 't1' }), { code: 'EVIDENCE_API_TIMEOUT', status: 504 });
});
