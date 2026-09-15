'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const EvaluatorApiServer = require('./server');
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

test('standalone evaluator public API accepts local no-auth evaluate', async () => {
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
