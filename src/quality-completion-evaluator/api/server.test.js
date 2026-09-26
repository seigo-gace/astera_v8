'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const EvaluatorApiServer = require('./server');
const { baseDesignRequest } = require('../tests/fixtures/factory');
const { stableStringify } = require('../utils/stable-json');

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function genericRequest() {
  const entryBase = {
    schema_version: 'astera.evidence-registry-entry.v1',
    evidence_id: 'ev_api_1',
    evidence_type: 'TEST_RECORD',
    candidate_id: 'ev_api_1',
    source: { provider_id: 'api-test', source_class: 'TEST', source_family_id: 'api-test', source_id: 'api-test', capability_id: 'test', canonical_locator: { url: null }, canonical_record_id: 'api-record-1', publisher: { id: 'test', name: 'Test' }, authority_id: 'test', source_role: 'PRIMARY' },
    content: { title: 'API evidence', excerpt: 'API measured result', language: 'en', jurisdiction: '', published_at: null, updated_at: null, version: '1', revision_id: null, content_hash: sha256('API measured result'), fields: {} },
    provenance: { request_id: 'api-req', query_plan_hash: '', query_ids: [], claim_ids: [], binding_ids: [], retrieval_trace: {}, lineage_fingerprint: {}, collected_at: '2026-09-25T00:00:00.000Z', effective_as_of: '2026-09-25' }
  };
  const entry = { ...entryBase, integrity: { algorithm: 'sha256', content_hash: entryBase.content.content_hash, entry_hash: sha256(entryBase) } };
  const entries = [entry];
  const measurementBase = {
    measurement_id: 'api-m1',
    metric_id: 'generic.score',
    value: 100,
    unit: null,
    evidence_refs: ['ev_api_1'],
    provenance: { collector_id: 'api-test-runner', collected_at: '2026-09-25T00:00:00.000Z' }
  };
  return {
    schema_version: 'astera.evaluation.request.v2',
    evaluation_id: 'api-eval-1',
    evaluation_time: '2026-09-25T00:00:00.000Z',
    subject: { subject_id: 'api-subject-1', subject_type: 'test' },
    profile_id: 'generic.measurement.v1',
    measurements: [{ ...measurementBase, measurement_hash: sha256(measurementBase) }],
    evidence_registry: { schema_version: 'astera.evidence-registry.v1', entries, registry_hash: sha256(entries) },
    evidence_bindings: { schema_version: 'astera.evidence-bindings.v1', bindings: [], bindings_hash: sha256([]) }
  };
}

function request({ port, path: requestPath, headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method: 'POST', path: requestPath, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withEvaluatorApi(fn, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-evaluator-api-'));
  const rows = [];
  const logger = { write(row) { rows.push(row); return row; }, async flush() {} };
  const oldLocal = process.env.ASTERA_LOCAL_NO_AUTH;
  process.env.ASTERA_LOCAL_NO_AUTH = '1';
  const api = new EvaluatorApiServer({ port: 0, host: '127.0.0.1', logger, limiter: options.limiter });
  api.start();
  await new Promise((resolve) => api.server.once('listening', resolve));
  try {
    await fn({ port: api.server.address().port, rows });
  } finally {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
    if (oldLocal === undefined) delete process.env.ASTERA_LOCAL_NO_AUTH;
    else process.env.ASTERA_LOCAL_NO_AUTH = oldLocal;
  }
}

test('standalone evaluator public API accepts local no-auth legacy evaluate', async () => {
  await withEvaluatorApi(async ({ port }) => {
    const response = await request({
      port, path: '/v1/evaluate',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseDesignRequest())
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.status, 'PASSED');
    assert.equal(response.json.publication, undefined);
  });
});

test('standalone evaluator public v2 API rejects caller-provided evidence and requires Evidence Search ownership', async () => {
  await withEvaluatorApi(async ({ port }) => {
    const response = await request({
      port, path: '/v2/evaluate',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genericRequest())
    });
    assert.equal(response.status, 400);
    assert.equal(response.json.error, 'provided_evidence_forbidden_on_public_v2');
  });
});

test('standalone evaluator rejects v2 contract on v1 route', async () => {
  await withEvaluatorApi(async ({ port }) => {
    const response = await request({ port, path: '/v1/evaluate', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(genericRequest()) });
    assert.equal(response.status, 400);
    assert.equal(response.json.error, 'evaluation_schema_route_mismatch');
  });
});

test('standalone evaluator public API applies transport rate limit', async () => {
  const limiter = { check() { return { allowed: false, remaining: 0, limit: 5, resetAt: new Date().toISOString() }; } };
  await withEvaluatorApi(async ({ port }) => {
    const response = await request({ port, path: '/v1/evaluate', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseDesignRequest()) });
    assert.equal(response.status, 429);
  }, { limiter });
});

test('standalone evaluator Skill API is private, unlimited, and never publishes', async () => {
  const previous = process.env.ASTERA_SKILL_API_KEY;
  process.env.ASTERA_SKILL_API_KEY = 'skill_test_key_abcdefghijklmnopqrstuvwxyz';
  const limiter = { check() { throw new Error('Skill API must not call transport rate limiter'); } };
  try {
    await withEvaluatorApi(async ({ port }) => {
      const missing = await request({ port, path: '/v1/skill/evaluate', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(missing.status, 401);
      const response = await request({
        port, path: '/v1/skill/evaluate',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.ASTERA_SKILL_API_KEY },
        body: JSON.stringify(baseDesignRequest())
      });
      assert.equal(response.status, 200);
      assert.equal(response.json.status, 'PASSED');
      assert.equal(response.json.publication, undefined);
    }, { limiter });
  } finally {
    if (previous === undefined) delete process.env.ASTERA_SKILL_API_KEY;
    else process.env.ASTERA_SKILL_API_KEY = previous;
  }
});

test('standalone evaluator rejects oversized payloads', async () => {
  await withEvaluatorApi(async ({ port }) => {
    const response = await request({ port, path: '/v1/evaluate', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }) });
    assert.equal(response.status, 413);
  });
});
