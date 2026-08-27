'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const EvidenceSearchClient = require('../src/evidence-search/api/client');

function evidenceResult(payload, context) {
  const queries = payload.preplanned_queries || [];
  const claim = 'API compatibility is preserved';
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: context.requestId,
    tenant_id: context.tenantId,
    status: 'FINAL_VALID',
    result_hash: `result-${context.requestId}`,
    evidence: [
      {
        candidate_id: 'ev-1',
        canonical_record_id: 'official-record',
        content_hash: 'official-hash',
        source_role: 'OFFICIAL',
        source_family_id: 'official-family',
        source_id: 'official-test',
        provider_id: 'official-provider',
        authority_id: 'official-authority',
        canonical_locator: { url: 'https://example.test/evidence', replayable: true },
        fields: { claim },
        excerpt: claim
      },
      {
        candidate_id: 'ev-2',
        canonical_record_id: 'corroboration-record',
        content_hash: 'corroboration-hash',
        source_role: 'SECONDARY',
        source_family_id: 'corroboration-family',
        source_id: 'corroboration-test',
        provider_id: 'corroboration-provider',
        authority_id: 'corroboration-authority',
        canonical_locator: { url: 'https://corroboration.test/evidence', replayable: true },
        fields: { claim },
        excerpt: claim
      }
    ],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' },
    quality: {
      initial: {
        status: 'REINFORCEMENT_REQUIRED',
        phase: 'INITIAL',
        score_bp: 8200,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: []
      },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: {
        status: 'FINAL_VALID',
        phase: 'FINAL',
        score_bp: 9700,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: []
      }
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
    provider_execution: {
      initial: [{ provider_id: 'official-provider', status: 'FULFILLED' }],
      reinforcement: [{ provider_id: 'corroboration-provider', status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
}

test('decision-materials calls Evidence Search API at the canonical search boundary and completes the Canonical pipeline once', async () => {
  const apiCalls = [];
  const events = [];
  const logger = {
    write(event) { events.push(event); },
    status() { return { enabled: false, pending_deliveries: 0, outbox: null }; },
    async flush() {}
  };
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
  const engine = new AsteraEngine({ logger, evidenceSearchClient: client });

  const out = await engine.process({
    question: 'Verify the current API compatibility using official evidence. Migrate the API in stages. Verify regression tests before completion. Success requires rollback capability.',
    language: 'en'
  }, { id: 'tenant-auto-api' });

  assert.equal(out.result.type, 'cognitive_map');
  assert.equal(out.result.non_ai, true);
  assert.equal(out.runtime.ai_used, false);
  assert.equal(out.runtime.llm_called, false);
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
  assert.equal(events.filter((event) => event.type === 'process_completed').length, 1);
  assert.ok(out.result.task_results.some((result) => result.evidence?.source_status === 'FINAL_VALID'));
});

test('missing Evidence Search API client fails closed instead of silently continuing with NOT_PROVIDED', async () => {
  const events = [];
  const logger = { write(event) { events.push(event); } };
  const engine = new AsteraEngine({ logger });
  const out = await engine.process({
    question: 'Verify the current API compatibility using official evidence.',
    language: 'en'
  }, { id: 'tenant-no-evidence-api' });

  const searched = out.result.task_results.filter((result) =>
    Array.isArray(result.task?.canonical_plan?.search_plan?.queries)
      && result.task.canonical_plan.search_plan.queries.length > 0
  );
  assert.ok(searched.length >= 1);
  assert.ok(searched.every((result) => result.evidence?.source_status === 'REJECTED_SEARCH_NOT_EXECUTED'));
  assert.ok(searched.every((result) => result.evidence?.search_state === 'NOT_EXECUTED'));
  assert.ok(searched.every((result) => result.canonical?.records?.every((record) => record.confirmation?.status === 'UNDETERMINED')));
  assert.equal(events.filter((event) => event.type === 'process_completed').length, 1);
});
