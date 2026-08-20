'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const KaguraServer = require('../src/server');
const SQLiteStore = require('../src/store/sqlite-store');
const StripeClient = require('../src/billing/stripe-client');
const SubscriptionSync = require('../src/billing/subscription-sync');
const Logger = require('../src/logger');

function request({ port, method = 'GET', path = '/', headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withServer(fn, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kagura-api-'));
  const store = new SQLiteStore(path.join(dir, 'test.db'));
  const logger = options.logger || new Logger({ cacheDir: path.join(dir, 'outbox'), tgsEnabled: false });
  const stripe = options.stripe || new StripeClient();
  const server = new KaguraServer({ port: 0, host: '127.0.0.1', poolSize: 1, store, stripe, subSync: new SubscriptionSync(store, stripe), logger, limiter: options.limiter });
  server.start();
  await new Promise((resolve) => server.server.once('listening', resolve));
  const port = server.server.address().port;
  try {
    await fn(port, logger);
  } finally {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('HTTP flow: successful health checks are not written to TGserver access logs', async () => {
  const rows = [];
  const logger = {
    tgsEnabled: true,
    write(row) {
      rows.push(row);
      return row;
    },
    async flush() {
      return true;
    }
  };

  await withServer(async (port) => {
    const health = await request({ port, method: 'GET', path: '/healthz' });
    assert.equal(health.status, 200);
    assert.equal(rows.some((row) => row.type === 'http_access' && row.text === 'GET /healthz 200'), false);

    const missing = await request({ port, method: 'GET', path: '/missing' });
    assert.equal(missing.status, 404);
    assert.equal(rows.some((row) => row.type === 'http_access' && row.text === 'GET /missing 404'), true);
  }, { logger });
});

test('HTTP flow: signup -> process works with tenant key', async () => {
  await withServer(async (port) => {
    const signup = await request({ port, method: 'POST', path: '/signup' });
    assert.equal(signup.status, 200);
    assert.match(signup.json.apiKey, /^kg_/);

    const process = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
      body: JSON.stringify({ question: '新規事業のニッチを見つけたい。対象は小規模事業者。成功条件は初月から低コストで試せること。', llm: { chain: ['null'] } })
    });
    assert.equal(process.status, 200);
    assert.match(process.headers['content-type'], /text\/plain/);
    assert.equal(process.json, null);
    assert.match(process.body, /01 本当の目的/);
    assert.match(process.body, /一言説明/);
    assert.match(process.body, /主役AIへ渡す内容/);
    assert.match(process.body, /08 主役AIへの再指示/);
    assert.equal((process.body.match(/^---$/gm) || []).length, 7);
    assert.doesNotMatch(process.body, /"result"/);
    assert.doesNotMatch(process.body, /"prompt"/);
    assert.doesNotMatch(process.body, /"answer"/);
  });
});

test('HTTP flow: context must be a string', async () => {
  await withServer(async (port) => {
    const signup = await request({ port, method: 'POST', path: '/signup' });
    const bad = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
      body: JSON.stringify({ question: '対象はAstera。成功条件は8項目出力。', context: { unexpected: true } })
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'context must be a string');
  });
});

test('HTTP flow: short process request returns clarification text', async () => {
  await withServer(async (port) => {
    const signup = await request({ port, method: 'POST', path: '/signup' });
    const process = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
      body: JSON.stringify({ question: 'どう？', llm: { chain: ['null'] } })
    });
    assert.equal(process.status, 200);
    assert.match(process.headers['content-type'], /text\/plain/);
    assert.equal(process.json, null);
    assert.match(process.body, /確認が必要です/);
    assert.match(process.body, /確認したいこと/);
  });
});

test('HTTP flow: healthz exposes runtime and logging diagnostics', async () => {
  await withServer(async (port) => {
    const health = await request({ port, method: 'GET', path: '/healthz' });
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.service, 'astera-v8');
    assert.match(health.json.version, /^\d+\.\d+\.\d+/);
    assert.equal(health.json.logging.enabled, false);
    assert.equal(health.json.logging.project_id, 'P002');
    assert.equal(health.json.logging.pending_deliveries, 0);
    assert.equal(health.json.logging.outbox, null);
    assert.match(health.json.runtime.node, /^v\d+\./);
    assert.equal(typeof health.json.runtime.uptime_seconds, 'number');
  });
});

test('HTTP flow: bad JSON returns 400 instead of 500', async () => {
  await withServer(async (port) => {
    const signup = await request({ port, method: 'POST', path: '/signup' });
    const bad = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
      body: '{bad'
    });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /Invalid JSON/);
  });
});

test('HTTP flow: invalid question type returns 400', async () => {
  await withServer(async (port) => {
    const signup = await request({ port, method: 'POST', path: '/signup' });
    const bad = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
      body: JSON.stringify({ question: { unexpected: true } })
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'question must be a string');
  });
});


test('HTTP flow: unauthorized process returns 401', async () => {
  await withServer(async (port) => {
    const res = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: '対象は小規模事業者。成功条件は低コストで試すこと。' })
    });
    assert.equal(res.status, 401);
  });
});

test('HTTP flow: payload over 1MB returns 413', async () => {
  await withServer(async (port) => {
    const signup = await request({ port, method: 'POST', path: '/signup' });
    const huge = JSON.stringify({ question: 'x'.repeat(1024 * 1024 + 50) });
    const res = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
      body: huge
    });
    assert.equal(res.status, 413);
  });
});

test('HTTP flow: disallowed CORS origin returns 403', async () => {
  const old = process.env.ASTERA_CORS_ORIGINS;
  process.env.ASTERA_CORS_ORIGINS = 'https://allowed.example.com';
  try {
    await withServer(async (port) => {
      const res = await request({ port, method: 'GET', path: '/healthz', headers: { Origin: 'https://evil.example.com' } });
      assert.equal(res.status, 403);
      assert.equal(res.json.error, 'cors_origin_denied');
    });
  } finally {
    if (old === undefined) delete process.env.ASTERA_CORS_ORIGINS;
    else process.env.ASTERA_CORS_ORIGINS = old;
  }
});

test('HTTP flow: checkout rejects a client-selected Stripe price', async () => {
  const oldPrice = process.env.STRIPE_PRO_PRICE_ID;
  delete process.env.STRIPE_PRO_PRICE_ID;
  try {
    await withServer(async (port) => {
      const signup = await request({ port, method: 'POST', path: '/signup' });
      const res = await request({
        port,
        method: 'POST',
        path: '/billing/checkout',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
        body: JSON.stringify({ plan: 'pro', priceId: 'price_attacker_selected' })
      });
      assert.equal(res.status, 400);
      assert.equal(res.json.error, 'priceId is not allowed');
    });
  } finally {
    if (oldPrice === undefined) delete process.env.STRIPE_PRO_PRICE_ID;
    else process.env.STRIPE_PRO_PRICE_ID = oldPrice;
  }
});

test('HTTP flow: checkout rejects a non-object JSON body', async () => {
  await withServer(async (port) => {
    const signup = await request({ port, method: 'POST', path: '/signup' });
    const res = await request({
      port,
      method: 'POST',
      path: '/billing/checkout',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': signup.json.apiKey },
      body: 'null'
    });
    assert.equal(res.status, 400);
    assert.equal(res.json.error, 'JSON body must be an object');
  });
});
