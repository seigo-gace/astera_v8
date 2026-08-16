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

test('authenticated user reaches evidence search through the main runtime', async () => {
  const calls = [];
  const evidenceClient = {
    async search(payload, context) {
      calls.push({ payload, context });
      return { schema_version: 'astera.evidence-search.result.v1', request_id: context.requestId, tenant_id: context.tenantId, status: 'FINAL_VALID', evidence: [{ candidate_id: 'ev-1' }], quality: { initial: { score_bp: 8200 }, final: { score_bp: 9600 }, reinforcement_attempt_count: 1, new_corroboration_count: 1 }, ai_used: false, payment_executed: false, paid_usage_reports: [] };
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

test('integrated process decomposes first, searches Evidence only for required tasks, and passes task-indexed packets into non-AI V8 runtime', async () => {
  const evidenceCalls = [];
  const engineCalls = [];
  const evidenceClient = {
    async search(payload, context) {
      evidenceCalls.push({ payload, context });
      return {
        schema_version: 'astera.evidence-search.result.v1', request_id: context.requestId, tenant_id: context.tenantId, status: 'FINAL_VALID',
        evidence: [{ candidate_id: 'ev-1', source_role: 'OFFICIAL', source_id: 'official-test', canonical_locator: { url: 'https://example.test/evidence', replayable: true }, fields: { claim: 'API compatibility is preserved' } }],
        coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' }, quality: { final: { status: 'FINAL_VALID', score_bp: 9700 } }, provider_execution: { initial: [{ provider_id: 'official-test', status: 'FULFILLED' }], reinforcement: [] }, ai_used: false, payment_executed: false, paid_usage_reports: []
      };
    }
  };
  const engine = {
    async process(input, tenant) {
      engineCalls.push({ input, tenant });
      return { result: { type: 'cognitive_map', non_ai: true, comparison: { verdict: { decision: 'recommend_with_caution' } } }, material: { compact_text: 'decision-material' }, runtime: { ai_used: false, llm_called: false, engine: 'v8_deterministic_rules' } };
    },
    async destroy() {}
  };
  const runtime = await startMain({ evidenceClient, engine });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/integrated/process`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': runtime.apiKey },
      body: JSON.stringify({ question: '現在のAPI互換性を公式根拠で検証する。その後APIを段階移行する。最後にテストで確認する。成功条件はRollback可能であること。' })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.schema_version, 'astera.integrated.result.v1');
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
    assert.equal(result.decision_materials.runtime.ai_used, false);
    assert.equal(result.decision_materials.runtime.llm_called, false);
  } finally { await stopMain(runtime); }
});

test('task evidence provider failure is isolated to that task instead of aborting the whole integrated graph', async () => {
  const engineCalls = [];
  const runtime = await startMain({
    evidenceClient: { async search() { const error = new Error('provider down'); error.code = 'PROVIDER_DOWN'; throw error; } },
    engine: {
      async process(input) { engineCalls.push(input); return { result: { type: 'cognitive_map', non_ai: true, comparison: { verdict: { decision: 'hold_and_clarify' } } }, material: {}, runtime: { ai_used: false, llm_called: false } }; },
      async destroy() {}
    }
  });
  try {
    const response = await fetch(`${runtime.baseUrl}/v1/integrated/process`, { method:'POST', headers:{'Content-Type':'application/json','X-API-Key':runtime.apiKey}, body:JSON.stringify({question:'現在のAPI仕様を公式根拠で検証する。'}) });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.evidence.status, 'REJECTED_TASK_EVIDENCE');
    assert.equal(result.evidence.rejected_task_count, 1);
    assert.equal(engineCalls.length, 1);
    assert.equal(Object.values(engineCalls[0].taskEvidencePackets)[0].status, 'REJECTED_PROVIDER_FAILURE');
  } finally { await stopMain(runtime); }
});
