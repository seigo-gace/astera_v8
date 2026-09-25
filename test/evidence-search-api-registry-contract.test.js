'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const EvidenceSearchApiServer = require('../src/evidence-search/api/server');
const { buildEvidenceRegistry } = require('../src/evidence-search/evidence/registry');
const { createInternalHeaders } = require('../src/internal-service-auth');

const SECRET = '0123456789abcdef0123456789abcdef';

function candidate() {
  return Object.freeze({
    schema_version: 'astera.evidence-candidate.v1',
    candidate_id: 'evc_api_contract_1',
    provider_id: 'provider.contract',
    source_class: 'FREE_OFFICIAL',
    source_family_id: 'family.contract',
    source_id: 'source.contract',
    capability_id: 'search',
    canonical_locator: Object.freeze({ url: 'https://official.example/contract/1', locator_type: 'URL', replayable: true }),
    canonical_record_id: 'contract-record-1',
    publisher: Object.freeze({ id: 'authority.contract', name: 'Contract Authority' }),
    authority_id: 'authority.contract',
    source_role: 'OFFICIAL',
    title: 'Contract evidence',
    excerpt: 'Evidence returned through the authenticated API',
    language: 'en',
    jurisdiction: 'US',
    published_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-25T00:00:00Z',
    version: '1',
    content_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    revision_id: 'rev-contract-1',
    retrieval_trace: Object.freeze({ endpoint: '/contract/1' }),
    fields: Object.freeze({}),
    lineage_fingerprint: Object.freeze({ authority_id: 'authority.contract', origin_record_id: 'contract-record-1' })
  });
}

function finalResult() {
  const evidence = [candidate()];
  const queryExecution = {
    initial: [{
      query_id: 'query-contract-1',
      claim_id: 'claim-contract-1',
      role: 'PRIMARY',
      status: 'FOUND',
      provider_records: [{ provider_id: 'provider.contract', status: 'FOUND', candidate_record_ids: ['contract-record-1'] }]
    }],
    reinforcement: []
  };
  const index = buildEvidenceRegistry({
    candidates: evidence,
    queryExecution,
    requestId: 'request-contract-1',
    queryPlanHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    executionTime: '2026-09-25T00:00:00.000Z',
    effectiveAsOf: '2026-09-25'
  });
  return Object.freeze({
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'request-contract-1',
    caller_id: 'debug-runner',
    status: 'FINAL_VALID',
    evidence: Object.freeze(evidence),
    evidence_registry: index.registry,
    evidence_bindings: index.bindings,
    quality: Object.freeze({ initial: Object.freeze({ score_bp: 10000 }), final: Object.freeze({ score_bp: 10000 }), reinforcement_attempt_count: 0 }),
    duration_ms: 1,
    ai_used: false,
    payment_executed: false
  });
}

function post({ port, service }) {
  const body = JSON.stringify({ question: 'contract test', search: { free_projection: true, free_current: true } });
  const headers = createInternalHeaders({
    body,
    secret: SECRET,
    service,
    callerId: 'debug-runner',
    requestId: `req-${service}`
  });
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/internal/v1/evidence/search',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers }
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

async function withServer(fn) {
  const rows = [];
  const logger = { write(row) { rows.push(row); return row; }, async flush() {} };
  const module = { async execute(request) {
    assert.equal(request.operation, 'SEARCH_EVIDENCE');
    return { result: finalResult() };
  } };
  const api = new EvidenceSearchApiServer({
    port: 0,
    host: '127.0.0.1',
    logger,
    internalSecret: SECRET,
    allowedServices: ['astera-main', 'debug-ai'],
    module
  });
  api.start();
  await new Promise((resolve) => api.server.once('listening', resolve));
  try {
    await fn({ port: api.server.address().port, rows });
  } finally {
    await api.stop();
  }
}

test('Evidence Search API returns Registry/Bindings to an allowed non-AI debug-ai caller', async () => {
  await withServer(async ({ port }) => {
    const response = await post({ port, service: 'debug-ai' });
    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'FINAL_VALID');
    assert.equal(response.body.ai_used, false);
    assert.equal(response.body.evidence_registry.schema_version, 'astera.evidence-registry.v1');
    assert.equal(response.body.evidence_registry.entries.length, 1);
    assert.equal(response.body.evidence_bindings.schema_version, 'astera.evidence-bindings.v1');
    assert.equal(response.body.evidence_bindings.bindings.length, 1);
    assert.equal(response.body.evidence_bindings.bindings[0].claim_id, 'claim-contract-1');
  });
});

test('Evidence Search API rejects a service outside its configured allowlist', async () => {
  await withServer(async ({ port }) => {
    const response = await post({ port, service: 'not-allowed' });
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'INTERNAL_SERVICE_FORBIDDEN');
  });
});
