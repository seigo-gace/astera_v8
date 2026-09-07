'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const KaguraServer = require('../src/server');
const KaguraEngine = require('../src/kagura-engine');
const SQLiteStore = require('../src/store/sqlite-store');

process.env.ASTERA_KEY_PEPPER = 'astera-test-key-pepper-32-bytes-minimum-value';

function createLogger(events = []) {
  return {
    write(event) { events.push(event); },
    status() { return { enabled: false, pending_deliveries: 0, outbox: null }; },
    async flush() {}
  };
}

function evidenceResult(context, claim = 'API compatibility is preserved', queries = []) {
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
    payment_executed: false,
    paid_usage_reports: []
  };
}

function mockEvidenceClient(onSearch) {
  return {
    async search(payload, context) {
      return onSearch(payload, context);
    }
  };
}

async function startMain({ evidenceSearchClient, engine, events = [] }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astera-main-evidence-'));
  const store = new SQLiteStore(path.join(root, 'astera.db'));
  const logger = createLogger(events);
  const resolvedEngine = engine || new KaguraEngine({ logger, evidenceSearchClient });
  const server = new KaguraServer({
    port: 0,
    host: '127.0.0.1',
    store,
    logger,
    engine: resolvedEngine
  });
  const issued = server.tenants.issueKey({ plan: 'free' });
  server.start();
  await once(server.server, 'listening');
  const address = server.server.address();
  return {
    root,
    store,
    server,
    engine: resolvedEngine,
    apiKey: issued.apiKey,
    tenant: issued.tenant,
    baseUrl: `http://127.0.0.1:${address.port}`,
    events
  };
}

async function stopMain(runtime) {
  await runtime.engine.destroy?.();
  await runtime.server.stop();
  await fs.rm(runtime.root, { recursive: true, force: true });
}

test('authenticated user reaches evidence search through the main runtime', async () => {
  const calls = [];
  const evidenceSearchClient = mockEvidenceClient(async (payload, context) => {
    calls.push({ payload, context });
    return evidenceResult(context, 'verified free evidence');
  });
  const runtime = await startMain({ evidenceSearchClient });
  try {
    const out = await runtime.engine.process({
      question: 'Verify the current API compatibility using official evidence.',
      language: 'en'
    }, runtime.tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(calls.length >= 1);
    assert.equal(calls[0].context.tenantId, runtime.tenant.id);
    assert.equal(calls[0].payload.paid_search.enabled, false);
    assert.ok(out.result.task_results.some((result) => result.evidence?.source_status === 'FINAL_VALID'));
  } finally { await stopMain(runtime); }
});

test('main runtime rejects paid search before the isolated service is called', async () => {
  const calls = [];
  const evidenceSearchClient = mockEvidenceClient(async (payload, context) => {
    calls.push({ payload, context });
    return evidenceResult(context, 'verified free evidence');
  });
  const runtime = await startMain({ evidenceSearchClient });
  try {
    const out = await runtime.engine.process({
      question: 'Verify the current API compatibility using official evidence.',
      language: 'en',
      evidence_search: { paid_search: { enabled: true } }
    }, runtime.tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(calls.length >= 1);
    assert.ok(calls.every((call) => call.payload.paid_search.enabled === false));
  } finally { await stopMain(runtime); }
});

test('unauthenticated user cannot access the process route', async () => {
  const runtime = await startMain({
    evidenceSearchClient: mockEvidenceClient(async () => ({}))
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'unauthorized request' })
    });
    assert.equal(response.status, 401);
  } finally { await stopMain(runtime); }
});

test('integrated process is a JSON facade over the same single AsteraEngine pipeline', async () => {
  const evidenceCalls = [];
  const events = [];
  const evidenceSearchClient = mockEvidenceClient(async (payload, context) => {
    evidenceCalls.push({ payload, context });
    return evidenceResult(context, 'API compatibility is preserved', payload.preplanned_queries || []);
  });
  const runtime = await startMain({ evidenceSearchClient, events });
  try {
    const out = await runtime.engine.process({
      question: 'Verify the current API compatibility using official evidence. Migrate the API in stages. Verify regression tests before completion. Success requires rollback capability.',
      language: 'en'
    }, runtime.tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.non_ai, true);
    assert.ok(out.result.task_results.length >= 3);
    assert.ok(evidenceCalls.length >= 1);
    for (const call of evidenceCalls) {
      assert.equal(call.payload.search.free_projection, true);
      assert.equal(call.payload.search.free_current, true);
      assert.equal(call.payload.paid_search.enabled, false);
      assert.match(call.payload.domain_lens.id, /^G\d{2}$/);
      assert.ok(Array.isArray(call.payload.upstream_search_plan?.queries));
      assert.ok(call.payload.upstream_search_plan.planned_query_roles.includes('COUNTER'));
      assert.deepEqual(call.payload.preplanned_queries, call.payload.upstream_search_plan.queries);
    }
    assert.ok(out.result.task_results.some((result) => result.evidence?.source_status === 'FINAL_VALID'));
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.equal(events.filter((event) => event.type === 'process_completed').length, 1);
  } finally { await stopMain(runtime); }
});

test('integrated boundary ignores caller domain_lens and uses internally resolved task Lens', async () => {
  const evidenceCalls = [];
  const evidenceSearchClient = mockEvidenceClient(async (payload, context) => {
    evidenceCalls.push({ payload, context });
    return evidenceResult(context, 'API server current specification is supported', payload.preplanned_queries || []);
  });
  const runtime = await startMain({ evidenceSearchClient });
  try {
    const out = await runtime.engine.process({
      question: 'APIサーバーの現行仕様を公式根拠で検証する。',
      language: 'ja',
      domain_lens: { id: 'G01' }
    }, runtime.tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(evidenceCalls.length >= 1);
    assert.ok(evidenceCalls.some((call) => call.payload.domain_lens.id === 'G29'));
    assert.ok(evidenceCalls.every((call) => call.payload.domain_lens.id !== 'G01'));
  } finally { await stopMain(runtime); }
});

test('task evidence provider failure is isolated and remains UNDETERMINED', async () => {
  const runtime = await startMain({
    evidenceSearchClient: mockEvidenceClient(async () => {
      const error = new Error('provider down');
      error.code = 'PROVIDER_DOWN';
      throw error;
    })
  });
  try {
    const out = await runtime.engine.process({
      question: 'Verify the current API specification using an official source.',
      language: 'en'
    }, runtime.tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(out.result.task_results.some((result) =>
      result.evidence?.source_status === 'REJECTED_SEARCH_FAILED'
      && result.evidence?.search_state === 'FAILED'
    ));
    assert.equal(out.result.canonical_claims?.status, 'UNDETERMINED');
  } finally { await stopMain(runtime); }
});
