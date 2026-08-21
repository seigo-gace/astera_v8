'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const AsteraServer = require('../src/server-with-evidence');
const SQLiteStore = require('../src/store/sqlite-store');

const logger = {
  write() {},
  status() { return { enabled: false, pending_deliveries: 0, outbox: null }; },
  async flush() {}
};

async function startMain({ evidenceClient, engine }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astera-main-evidence-'));
  const store = new SQLiteStore(path.join(root, 'astera.db'));
  const server = new AsteraServer({ port: 0, host: '127.0.0.1', store, logger, evidenceClient, ...(engine ? { engine } : { engine: { async destroy() {} } }) });
  const issued = server.tenants.issueKey({ plan: 'free' });
  server.start();
  await once(server.server, 'listening');
  const address = server.server.address();
  return { root, store, server, apiKey: issued.apiKey, tenant: issued.tenant, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function stopMain(runtime) {
  await runtime.server.stop();
  await fs.rm(runtime.root, { recursive: true, force: true });
}

function queryExecution(queries = []) {
  return {
    initial: queries.map((query) => ({
      query_id: query.query_id,
      claim_id: query.claim_id,
      role: query.role,
      status: 'FOUND',
      provider_records: [
        { provider_id: 'official-provider', status: 'FOUND', candidate_record_ids: ['official-record'] },
        { provider_id: 'corroboration-provider', status: 'FOUND', candidate_record_ids: ['corroboration-record'] }
      ]
    })),
    reinforcement: []
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
      initial: { status: 'REINFORCEMENT_REQUIRED', phase: 'INITIAL', score_bp: 8200, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: { status: 'FINAL_VALID', phase: 'FINAL', score_bp: 9700, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] }
    },
    query_execution: queryExecution(queries),
    provider_execution: {
      initial: [{ provider_id: 'official-provider', status: 'FULFILLED' }],
      reinforcement: [{ provider_id: 'corroboration-provider', status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false,
    paid_usage_reports: []
  };
}

test('authenticated user reaches evidence search through the main runtime', async () => {
  const calls = [];
  const evidenceClient = {
    async search(payload, context) {
      calls.push({ payload, context });
      return evidenceResult(context, 'verified free evidence');
    }
  };
  const runtime = await startMain({ evidenceClient });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/evidence/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': runtime.apiKey }, body: JSON.stringify({ question: 'verified free evidence', domain_lens: { id: 'G29' }, tenant_id: 'attacker-controlled-tenant', request_id: 'attacker-controlled-request', paid_search: { enabled: false } }) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.status, 'FINAL_VALID');
    assert.equal(result.tenant_id, runtime.tenant.id);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].context.tenantId, runtime.tenant.id);
    assert.notEqual(calls[0].payload.request_id, 'attacker-controlled-request');
    assert.equal(calls[0].payload.paid_search.enabled, false);
  } finally { await stopMain(runtime); }
});

test('main runtime rejects paid search before the isolated service is called', async () => {
  let calls = 0;
  const runtime = await startMain({ evidenceClient: { async search() { calls += 1; throw new Error('must not be called'); } } });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/evidence/search`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': runtime.apiKey }, body: JSON.stringify({ question: 'paid search attempt', domain_lens: { id: 'G29' }, paid_search: { enabled: true } }) });
    assert.equal(response.status, 400);
    const result = await response.json();
    assert.equal(result.code, 'PAID_SEARCH_DISABLED');
    assert.equal(calls, 0);
  } finally { await stopMain(runtime); }
});

test('unauthenticated user cannot access the evidence route', async () => {
  let calls = 0;
  const runtime = await startMain({ evidenceClient: { async search() { calls += 1; return {}; } } });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/evidence/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'unauthorized request', domain_lens: { id: 'G29' } }) });
    assert.equal(response.status, 401);
    assert.equal(calls, 0);
  } finally { await stopMain(runtime); }
});

test('integrated process decomposes first, sends the canonical upstream Search Plan, searches only external-evidence tasks, and passes task-indexed packets into the non-AI runtime', async () => {
  const evidenceCalls = [];
  const engineCalls = [];
  const evidenceClient = {
    async search(payload, context) {
      evidenceCalls.push({ payload, context });
      return evidenceResult(context, 'API compatibility is preserved', payload.preplanned_queries || []);
    }
  };
  const engine = {
    async process(input, tenant) {
      engineCalls.push({ input, tenant });
      return { result: { type: 'cognitive_map', non_ai: true, comparison: { material_only: true, selected_candidate: null, candidate_ranking: [], verdict: { decision: 'MATERIAL_ONLY' } } }, material: { compact_text: 'decision-material' }, runtime: { ai_used: false, llm_called: false, engine: 'v8_deterministic_rules' } };
    },
    async destroy() {}
  };
  const runtime = await startMain({ evidenceClient, engine });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/integrated/process`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': runtime.apiKey },
      body: JSON.stringify({ question: 'Verify the current API compatibility using official evidence. Migrate the API in stages. Verify regression tests before completion. Success requires rollback capability.', language: 'en' })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.schema_version, 'astera.integrated.result.v2');
    assert.equal(result.non_ai, true);
    assert.ok(result.task_graph.task_count >= 3);
    assert.equal(result.evidence.searched_task_count, 1);
    assert.equal(result.evidence.valid_task_count, 1);
    assert.equal(evidenceCalls.length, 1);
    assert.equal(engineCalls.length, 1);
    assert.ok(engineCalls[0].input.taskEvidencePackets);
    const packets = Object.values(engineCalls[0].input.taskEvidencePackets);
    assert.ok(packets.some((packet) => packet.status === 'FINAL_VALID'));
    assert.ok(packets.some((packet) => packet.status === 'NOT_REQUIRED'));
    assert.equal(evidenceCalls[0].payload.paid_search.enabled, false);
    assert.match(evidenceCalls[0].payload.domain_lens.id, /^G\d{2}$/);
    assert.match(evidenceCalls[0].context.requestId, /:T\d{2}$/);
    assert.ok(Array.isArray(evidenceCalls[0].payload.upstream_search_plan?.queries));
    assert.ok(evidenceCalls[0].payload.upstream_search_plan.queries.length > 0);
    assert.ok(evidenceCalls[0].payload.upstream_search_plan.planned_query_roles.includes('COUNTER'));
    assert.ok(evidenceCalls[0].payload.preplanned_queries.some((query) => query.role === 'COUNTER'));
    assert.deepEqual(evidenceCalls[0].payload.preplanned_queries, evidenceCalls[0].payload.upstream_search_plan.queries);
    const searchedTask = Object.values(result.evidence.by_task).find((packet) => packet.status === 'FINAL_VALID');
    assert.equal(searchedTask.planning_authority, 'UPSTREAM_CANONICAL');
    assert.ok(searchedTask.planned_query_roles.includes('COUNTER'));
    assert.equal(result.decision_materials.runtime.ai_used, false);
    assert.equal(result.decision_materials.runtime.llm_called, false);
  } finally { await stopMain(runtime); }
});

test('integrated boundary uses internally resolved task target and Lens even when caller supplies a conflicting domain_lens', async () => {
  const evidenceCalls = [];
  const engineCalls = [];
  const preparedRequest = {
    schema_version: 'astera.request-model.v2',
    language: 'ja',
    locale: 'ja-JP',
    script: 'Hira',
    scripts: ['Hira', 'Hani'],
    target: 'APIサーバーのシステム開発',
    action: 'verify',
    objective: 'APIサーバーの現行仕様を公式根拠で検証する。',
    instruction_understanding: { mode: 'GLOBAL_LANGUAGE_ADAPTER', adapter: 'builtin-ja', semantic_resolution: 'adapter-resolved', parser: null, execution_allowed: true, blocked_reasons: [], language: 'ja', locale: 'ja-JP', script: 'Hira', scripts: ['Hira', 'Hani'], detection_basis: 'EXPLICIT_LANGUAGE' },
    analysis_task_packet: {
      schema_version: 'astera.analysis-task-packet.v1',
      intent: 'verify',
      tasks: [{
        id: 'P-REF',
        source_span: { start: 0, end: 10, text: 'それを検証して。' },
        raw_text: 'それを検証して。',
        clause_type: 'verification_criteria',
        actionable: true,
        action: 'verify',
        target: 'APIサーバーのシステム開発',
        objective: 'APIサーバーの現行仕様を公式根拠で検証する。',
        deliverables: [],
        premises: [],
        constraints: [],
        prohibitions: [],
        preserve: [],
        replace: [],
        conditions: ['現行仕様であること'],
        exceptions: [],
        deadlines: [],
        priority: 'normal',
        order: 1,
        depends_on: [],
        parallelizable: true,
        success_criteria: ['公式根拠で確認する'],
        verification: ['公式Sourceを使用する'],
        completion_criteria: ['公式根拠で確認する'],
        unresolved: [],
        evidence_need: { required: false, reasons: [], queries: [] },
        external_action: false,
        hard_blockers: []
      }],
      dependencies: [],
      execution_waves: [['P-REF']],
      constraints: [], prohibitions: [], preserve: [], replace: [], verification: ['公式Sourceを使用する'], completion_criteria: ['公式根拠で確認する'], unresolved: [], conflicts: [], hard_blockers: [], source_spans: [{ task_id: 'P-REF', start: 0, end: 10, text: 'それを検証して。' }]
    }
  };
  const engine = {
    async prepareRequest() { return preparedRequest; },
    async process(input, tenant) {
      engineCalls.push({ input, tenant });
      return { result: { type: 'cognitive_map', non_ai: true, comparison: { material_only: true, selected_candidate: null, candidate_ranking: [], verdict: { decision: 'MATERIAL_ONLY' } } }, material: {}, runtime: { ai_used: false, llm_called: false } };
    },
    async destroy() {}
  };
  const evidenceClient = {
    async search(payload, context) {
      evidenceCalls.push({ payload, context });
      return evidenceResult(context, 'API server current specification is supported', payload.preplanned_queries || []);
    }
  };
  const runtime = await startMain({ evidenceClient, engine });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/integrated/process`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': runtime.apiKey }, body: JSON.stringify({ question: 'それを検証して。', domain_lens: { id: 'G01' } }) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.schema_version, 'astera.integrated.result.v2');
    assert.equal(evidenceCalls.length, 1);
    assert.match(evidenceCalls[0].payload.question, /APIサーバーのシステム開発/);
    assert.equal(evidenceCalls[0].payload.domain_lens.id, 'G29');
    assert.notEqual(evidenceCalls[0].payload.domain_lens.id, 'G01');
    assert.ok(Array.isArray(evidenceCalls[0].payload.upstream_search_plan?.queries));
    assert.ok(evidenceCalls[0].payload.upstream_search_plan.planned_query_roles.includes('COUNTER'));
    assert.ok(evidenceCalls[0].payload.preplanned_queries.some((query) => query.role === 'COUNTER'));
    assert.equal(Array.isArray(evidenceCalls[0].payload.conditions), false);
    assert.equal(engineCalls.length, 1);
    assert.equal(engineCalls[0].input.taskEvidencePackets['P-REF'].status, 'FINAL_VALID');
    assert.equal(engineCalls[0].input.taskEvidencePackets['P-REF'].planning_authority, 'UPSTREAM_CANONICAL');
    assert.equal(preparedRequest.instruction_understanding.parser, null);
    assert.equal(preparedRequest.instruction_understanding.adapter, 'builtin-ja');
  } finally { await stopMain(runtime); }
});

test('task evidence provider failure is isolated to that task instead of aborting the whole integrated graph', async () => {
  const engineCalls = [];
  const runtime = await startMain({
    evidenceClient: { async search() { const error = new Error('provider down'); error.code = 'PROVIDER_DOWN'; throw error; } },
    engine: {
      async process(input) { engineCalls.push(input); return { result: { type: 'cognitive_map', non_ai: true, comparison: { material_only: true, selected_candidate: null, candidate_ranking: [], verdict: { decision: 'MATERIAL_ONLY' } } }, material: {}, runtime: { ai_used: false, llm_called: false } }; },
      async destroy() {}
    }
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/integrated/process`, { method:'POST', headers:{'Content-Type':'application/json','X-API-Key':runtime.apiKey}, body:JSON.stringify({question:'Verify the current API specification using an official source.',language:'en'}) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.schema_version, 'astera.integrated.result.v2');
    assert.equal(result.evidence.status, 'REJECTED_TASK_EVIDENCE');
    assert.equal(result.evidence.rejected_task_count, 1);
    assert.equal(engineCalls.length, 1);
    assert.equal(Object.values(engineCalls[0].taskEvidencePackets)[0].status, 'REJECTED_PROVIDER_FAILURE');
  } finally { await stopMain(runtime); }
});
