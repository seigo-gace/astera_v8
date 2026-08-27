'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');
const EvidenceSearchApiServer = require('../src/evidence-search/api/server');
const { SEARCH_STATES, deriveSearchState, failedEvidence } = require('../src/canonical-evidence-resolver');

function plan() {
  return {
    domain_lens: { id: 'G29' },
    source_policy: { provider_allowlist: [], provider_denylist: [], free_projection: true, free_current: true }
  };
}

test('Evidence Search refuses to represent zero active providers as a completed empty search', () => {
  const registry = new ProviderRegistry([]);
  assert.throws(
    () => registry.select(plan(), 'INITIAL'),
    (error) => error.code === 'EVIDENCE_SEARCH_NO_ACTIVE_PROVIDER' && error.status === 503
  );
});

test('search not executed is distinct from a completed search with zero evidence', () => {
  const notExecuted = failedEvidence('T01', Object.assign(new Error('missing client'), { code: 'EVIDENCE_SEARCH_NOT_CONFIGURED' }), SEARCH_STATES.NOT_EXECUTED);
  assert.equal(notExecuted.search_state, SEARCH_STATES.NOT_EXECUTED);
  assert.equal(notExecuted.status, 'REJECTED_SEARCH_NOT_EXECUTED');
  assert.equal(notExecuted.evidence.length, 0);

  const searchedNothing = {
    status: 'REJECTED_INSUFFICIENT_EVIDENCE',
    evidence: [],
    provider_execution: { initial: [{ provider_id: 'official', status: 'FULFILLED' }], reinforcement: [] },
    query_execution: { initial: [{ query_id: 'q1', status: 'NOT_FOUND' }], reinforcement: [] }
  };
  assert.equal(deriveSearchState(searchedNothing), SEARCH_STATES.EXECUTED_NO_EVIDENCE);
});

test('provider/network failure is distinct from no-evidence search result', () => {
  const failed = {
    status: 'REJECTED_PROVIDER_FAILURE',
    evidence: [],
    provider_execution: { initial: [{ provider_id: 'official', status: 'REJECTED', error_code: 'PROVIDER_TIMEOUT' }], reinforcement: [] },
    query_execution: { initial: [{ query_id: 'q1', status: 'RETRIEVAL_FAILED' }], reinforcement: [] }
  };
  assert.equal(deriveSearchState(failed), SEARCH_STATES.FAILED);
});

test('completed retrieval with evidence is explicit and partial failure stays partial', () => {
  const complete = {
    evidence: [{ candidate_id: 'ev1' }],
    provider_execution: { initial: [{ provider_id: 'official', status: 'FULFILLED' }], reinforcement: [] },
    query_execution: { initial: [{ query_id: 'q1', status: 'FOUND' }], reinforcement: [] }
  };
  assert.equal(deriveSearchState(complete), SEARCH_STATES.EXECUTED_WITH_EVIDENCE);

  const partial = {
    evidence: [{ candidate_id: 'ev1' }],
    provider_execution: { initial: [
      { provider_id: 'official', status: 'FULFILLED' },
      { provider_id: 'secondary', status: 'REJECTED', error_code: 'PROVIDER_TIMEOUT' }
    ], reinforcement: [] },
    query_execution: { initial: [{ query_id: 'q1', status: 'FOUND' }], reinforcement: [] }
  };
  assert.equal(deriveSearchState(partial), SEARCH_STATES.PARTIAL);
});


test('Evidence Search health is unavailable when no active provider is configured', async () => {
  const server = new EvidenceSearchApiServer({
    port: 0,
    host: '127.0.0.1',
    logger: { write() {}, async flush() {} },
    internalSecret: '0123456789abcdef0123456789abcdef0123456789abcdef',
    moduleOptions: { providers: [] }
  });
  server.start();
  await once(server.server, 'listening');
  try {
    const { port } = server.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.status, 'UNAVAILABLE_NO_ACTIVE_PROVIDER');
    assert.equal(body.active_provider_count, 0);
  } finally { await server.stop(); }
});
