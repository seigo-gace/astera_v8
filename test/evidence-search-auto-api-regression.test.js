'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalEvidenceAutoEngine = require('../src/canonical-evidence-auto-engine');
const EvidenceSearchClient = require('../src/evidence-search/api/client');

const logger = {
  write() {},
  status() { return { enabled: false, pending_deliveries: 0, outbox: null }; },
  async flush() {}
};

function evidenceResult(payload, context) {
  const queries = payload.preplanned_queries || [];
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: context.requestId,
    tenant_id: context.tenantId,
    status: 'FINAL_VALID',
    evidence: [],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' },
    quality: {
      initial: { status: 'FINAL_VALID', phase: 'INITIAL', score_bp: 9700, blocking_reasons: [] },
      reinforcement_attempt_count: 0,
      new_corroboration_count: 0,
      final: { status: 'FINAL_VALID', phase: 'FINAL', score_bp: 9700, blocking_reasons: [] }
    },
    query_execution: {
      initial: queries.map((query) => ({
        query_id: query.query_id,
        claim_id: query.claim_id,
        role: query.role,
        status: 'FOUND',
        provider_records: []
      })),
      reinforcement: []
    },
    provider_execution: { initial: [], reinforcement: [] },
    ai_used: false,
    payment_executed: false
  };
}

test('decision-materials automatic evidence point calls the Evidence Search internal API with both free search lanes', async () => {
  const apiCalls = [];
  const client = new EvidenceSearchClient({
    baseUrl: 'http://evidence.test',
    internalSecret: '0123456789abcdef0123456789abcdef',
    fetch: async (url, options) => {
      const payload = JSON.parse(options.body);
      const context = {
        requestId: options.headers['x-astera-request-id'],
        tenantId: options.headers['x-astera-tenant-id']
      };
      apiCalls.push({ url, options, payload, context });
      return {
        ok: true,
        status: 200,
        async text() { return JSON.stringify(evidenceResult(payload, context)); }
      };
    }
  });
  const engine = new CanonicalEvidenceAutoEngine({ logger, evidenceSearchClient: client });

  const out = await engine.process({
    question: 'Verify the current API compatibility using official evidence. Migrate the API in stages. Verify regression tests before completion. Success requires rollback capability.',
    language: 'en'
  }, { id: 'tenant-auto-api' });

  assert.equal(out.result.type, 'cognitive_map');
  assert.ok(apiCalls.length >= 1);
  for (const call of apiCalls) {
    assert.equal(call.url, 'http://evidence.test/internal/v1/evidence/search');
    assert.equal(call.context.tenantId, 'tenant-auto-api');
    assert.equal(call.payload.search.free_projection, true);
    assert.equal(call.payload.search.free_current, true);
    assert.equal(call.payload.paid_search.enabled, false);
    assert.ok(Array.isArray(call.payload.upstream_search_plan?.queries));
    assert.ok(call.payload.upstream_search_plan.queries.length > 0);
    assert.deepEqual(call.payload.preplanned_queries, call.payload.upstream_search_plan.queries);
  }
  assert.ok(apiCalls.some((call) => call.payload.upstream_search_plan.planned_query_roles.includes('COUNTER')));
});

test('missing Evidence Search API client becomes an explicit evidence failure instead of a silent NOT_PROVIDED path', async () => {
  const engine = new CanonicalEvidenceAutoEngine({ logger });
  const out = await engine.process({
    question: 'Verify the current API compatibility using official evidence.',
    language: 'en'
  }, { id: 'tenant-no-evidence-api' });

  const searched = out.result.task_results.filter((result) =>
    Array.isArray(result.task?.canonical_plan?.search_plan?.queries)
      && result.task.canonical_plan.search_plan.queries.length > 0
  );
  assert.ok(searched.length >= 1);
  assert.ok(searched.every((result) => result.evidence_raw?.status === 'REJECTED_PROVIDER_FAILURE'));
  assert.ok(searched.every((result) => result.canonical?.records?.every((record) => record.confirmation?.status === 'UNDETERMINED')));
});
