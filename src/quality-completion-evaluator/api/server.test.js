'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const EvaluatorApiServer = require('./server');
const SQLiteStore = require('../../store/sqlite-store');
const TenantManager = require('../../auth/tenant');
const { baseDesignRequest } = require('../tests/fixtures/factory');

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
  const store = new SQLiteStore(path.join(dir, 'test.db'));
  const rows = [];
  const logger = { write(row) { rows.push(row); return row; }, async flush() {} };
  const api = new EvaluatorApiServer({ port: 0, host: '127.0.0.1', store, logger, limiter: options.limiter });
  api.start();
  await new Promise((resolve) => api.server.once('listening', resolve));
  try {
    await fn({ port: api.server.address().port, store, rows });
  } finally {
    await api.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('standalone evaluator public API accepts Astera tenant key and meters usage', async () => {
  await withEvaluatorApi(async ({ port, store }) => {
    const manager = new TenantManager(store);
    const { apiKey, tenant } = manager.issueKey({ plan: 'free' });
    const response = await request({
      port, path: '/v1/evaluate',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify(baseDesignRequest())
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.status, 'KB_ELIGIBLE');
    assert.equal(response.json.publication, undefined);
    assert.equal(store.countUsageSince(tenant.id, '/v1/evaluate', '1970-01-01T00:00:00.000Z'), 1);
  });
});

test('standalone evaluator public API applies the tenant plan rate limit', async () => {
  const limiter = { check() { return { allowed: false, remaining: 0, limit: 5, resetAt: new Date().toISOString() }; } };
  await withEvaluatorApi(async ({ port, store }) => {
    const { apiKey } = new TenantManager(store).issueKey({ plan: 'free' });
    const response = await request({ port, path: '/v1/evaluate', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify(baseDesignRequest()) });
    assert.equal(response.status, 429);
  }, { limiter });
});

test('standalone evaluator Skill API is private, unlimited, and never publishes', async () => {
  const previous = process.env.ASTERA_SKILL_API_KEY;
  process.env.ASTERA_SKILL_API_KEY = 'skill_test_key_abcdefghijklmnopqrstuvwxyz';
  const limiter = { check() { throw new Error('Skill API must not call tenant rate limiter'); } };
  try {
    await withEvaluatorApi(async ({ port, store }) => {
      const missing = await request({ port, path: '/v1/skill/evaluate', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      assert.equal(missing.status, 401);
      const response = await request({
        port, path: '/v1/skill/evaluate',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.ASTERA_SKILL_API_KEY },
        body: JSON.stringify(baseDesignRequest())
      });
      assert.equal(response.status, 200);
      assert.equal(response.json.status, 'KB_ELIGIBLE');
      assert.equal(response.json.publication, undefined);
      assert.equal(store.data?.usage?.length || 0, 0);
    }, { limiter });
  } finally {
    if (previous === undefined) delete process.env.ASTERA_SKILL_API_KEY;
    else process.env.ASTERA_SKILL_API_KEY = previous;
  }
});

test('standalone evaluator rejects oversized payloads', async () => {
  await withEvaluatorApi(async ({ port, store }) => {
    const { apiKey } = new TenantManager(store).issueKey({ plan: 'free' });
    const response = await request({ port, path: '/v1/evaluate', headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey }, body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }) });
    assert.equal(response.status, 413);
  });
});
