'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { AsteraModuleSwitch, TARGETS } = require('../src/astera-module-switch');
const AsteraServer = require('../src/server-with-module-switch');
const SQLiteStore = require('../src/store/sqlite-store');

const logger = {
  write() {},
  status() { return { enabled: false, pending_deliveries: 0, outbox: null }; },
  async flush() {}
};

function post(baseUrl, apiKey, body, pathname = '/v1/astera/execute') {
  return fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
    body: JSON.stringify(body)
  });
}

async function startRuntime({ engine, evidenceClient, qualityEvaluator }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astera-module-switch-'));
  const previousPepper = process.env.ASTERA_KEY_PEPPER;
  process.env.ASTERA_KEY_PEPPER = 'astera-test-pepper-0123456789abcdef0123456789';
  const store = new SQLiteStore(path.join(root, 'astera.db'));
  const server = new AsteraServer({
    port: 0,
    host: '127.0.0.1',
    store,
    logger,
    engine,
    evidenceClient,
    qualityEvaluator
  });
  const issued = server.tenants.issueKey({ plan: 'free' });
  server.start();
  await once(server.server, 'listening');
  const address = server.server.address();
  return { root, store, server, apiKey: issued.apiKey, tenant: issued.tenant, baseUrl: `http://127.0.0.1:${address.port}`, previousPepper };
}

async function stopRuntime(runtime) {
  await runtime.server.stop();
  if (runtime.previousPepper === undefined) delete process.env.ASTERA_KEY_PEPPER;
  else process.env.ASTERA_KEY_PEPPER = runtime.previousPepper;
  await fs.rm(runtime.root, { recursive: true, force: true });
}

test('pure switch exposes exactly the three canonical Astera module targets', async () => {
  const calls = [];
  const selector = new AsteraModuleSwitch({
    decisionMaterials: async ({ input }) => { calls.push(['decision', input]); return { module: 'decision' }; },
    evidenceSearch: async ({ input }) => { calls.push(['evidence', input]); return { module: 'evidence' }; },
    qualityGate: async ({ input }) => { calls.push(['quality', input]); return { module: 'quality' }; }
  });

  assert.deepEqual(Object.values(TARGETS), [
    'astera.decision-materials',
    'astera.evidence-search',
    'astera.quality-gate'
  ]);
  assert.equal((await selector.execute({ target: TARGETS.DECISION_MATERIALS, input: { a: 1 } })).module, 'decision');
  assert.equal((await selector.execute({ target: TARGETS.EVIDENCE_SEARCH, input: { b: 2 } })).module, 'evidence');
  assert.equal((await selector.execute({ target: TARGETS.QUALITY_GATE, input: { c: 3 } })).module, 'quality');
  assert.deepEqual(calls.map(([name]) => name), ['decision', 'evidence', 'quality']);
  await assert.rejects(() => selector.execute({ target: 'astera.integrated', input: {} }), { code: 'INVALID_MODULE_TARGET', status: 400 });
  await assert.rejects(() => selector.execute({ target: TARGETS.DECISION_MATERIALS, input: null }), { code: 'INVALID_MODULE_INPUT', status: 400 });
});

test('common API selects decision-materials without calling Evidence or QCE', async () => {
  const calls = { decision: 0, evidence: 0, quality: 0 };
  const engine = {
    async process(input) { calls.decision += 1; return { result: { type: 'cognitive_map', input }, material: { text: 'decision' }, runtime: { ai_used: false } }; },
    async destroy() {}
  };
  const evidenceClient = { async search() { calls.evidence += 1; return { status: 'FINAL_VALID' }; } };
  const qualityEvaluator = async () => { calls.quality += 1; return { status: 'PASS' }; };
  const runtime = await startRuntime({ engine, evidenceClient, qualityEvaluator });
  try {
    const response = await post(runtime.baseUrl, runtime.apiKey, { target: TARGETS.DECISION_MATERIALS, input: { question: 'Compare two options.', language: 'en' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.target, TARGETS.DECISION_MATERIALS);
    assert.equal(body.module_result.result.type, 'cognitive_map');
    assert.deepEqual(calls, { decision: 1, evidence: 0, quality: 0 });
  } finally { await stopRuntime(runtime); }
});

test('common API selects Evidence Search and overwrites caller-controlled identity', async () => {
  const calls = { decision: 0, evidence: 0, quality: 0 };
  let evidenceCall = null;
  const engine = { async process() { calls.decision += 1; return {}; }, async destroy() {} };
  const evidenceClient = {
    async search(payload, context) {
      calls.evidence += 1;
      evidenceCall = { payload, context };
      return { status: 'FINAL_VALID', evidence: [], quality: { final: { score_bp: 9700 } } };
    }
  };
  const qualityEvaluator = async () => { calls.quality += 1; return { status: 'PASS' }; };
  const runtime = await startRuntime({ engine, evidenceClient, qualityEvaluator });
  try {
    const response = await post(runtime.baseUrl, runtime.apiKey, {
      target: TARGETS.EVIDENCE_SEARCH,
      input: { question: 'current specification', domain_lens: { id: 'G29' }, request_id: 'attacker-request', tenant_id: 'attacker-tenant', paid_search: { enabled: false } }
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.target, TARGETS.EVIDENCE_SEARCH);
    assert.equal(body.module_result.status, 'FINAL_VALID');
    assert.deepEqual(calls, { decision: 0, evidence: 1, quality: 0 });
    assert.equal(evidenceCall.payload.tenant_id, runtime.tenant.id);
    assert.equal(evidenceCall.context.tenantId, runtime.tenant.id);
    assert.notEqual(evidenceCall.payload.request_id, 'attacker-request');
    assert.equal(evidenceCall.payload.paid_search.enabled, false);
  } finally { await stopRuntime(runtime); }
});

test('common API selects QCE without calling decision-materials or Evidence', async () => {
  const calls = { decision: 0, evidence: 0, quality: 0 };
  const engine = { async process() { calls.decision += 1; return {}; }, async destroy() {} };
  const evidenceClient = { async search() { calls.evidence += 1; return {}; } };
  const qualityEvaluator = async (input) => { calls.quality += 1; return { status: 'PASS', candidate_id: input.candidate_id }; };
  const runtime = await startRuntime({ engine, evidenceClient, qualityEvaluator });
  try {
    const response = await post(runtime.baseUrl, runtime.apiKey, { target: TARGETS.QUALITY_GATE, input: { candidate_id: 'candidate-1' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.target, TARGETS.QUALITY_GATE);
    assert.equal(body.module_result.status, 'PASS');
    assert.equal(body.module_result.candidate_id, 'candidate-1');
    assert.deepEqual(calls, { decision: 0, evidence: 0, quality: 1 });
  } finally { await stopRuntime(runtime); }
});

test('invalid switch target fails closed without calling any module', async () => {
  const calls = { decision: 0, evidence: 0, quality: 0 };
  const engine = { async process() { calls.decision += 1; return {}; }, async destroy() {} };
  const evidenceClient = { async search() { calls.evidence += 1; return {}; } };
  const qualityEvaluator = async () => { calls.quality += 1; return {}; };
  const runtime = await startRuntime({ engine, evidenceClient, qualityEvaluator });
  try {
    const response = await post(runtime.baseUrl, runtime.apiKey, { target: 'astera.integrated', input: {} });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'INVALID_MODULE_TARGET');
    assert.deepEqual(calls, { decision: 0, evidence: 0, quality: 0 });
  } finally { await stopRuntime(runtime); }
});

test('existing inherited /v1/evidence/search endpoint remains available through the new top-level server', async () => {
  let evidenceCalls = 0;
  const engine = { async process() { return { material: { text: 'decision' } }; }, async destroy() {} };
  const evidenceClient = {
    async search(payload, context) {
      evidenceCalls += 1;
      return { status: 'FINAL_VALID', tenant_id: context.tenantId, request_id: context.requestId, evidence: [], quality: { final: { score_bp: 9700 } } };
    }
  };
  const runtime = await startRuntime({ engine, evidenceClient, qualityEvaluator: async () => ({ status: 'PASS' }) });
  try {
    const response = await post(runtime.baseUrl, runtime.apiKey, { question: 'evidence', domain_lens: { id: 'G29' }, paid_search: { enabled: false } }, '/v1/evidence/search');
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'FINAL_VALID');
    assert.equal(evidenceCalls, 1);
  } finally { await stopRuntime(runtime); }
});
