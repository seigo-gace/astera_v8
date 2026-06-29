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

function request({ port, method = 'GET', path = '/', headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, json: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kagura-api-'));
  const store = new SQLiteStore(path.join(dir, 'test.db'));
  const stripe = new StripeClient();
  const server = new KaguraServer({ port: 0, host: '127.0.0.1', poolSize: 1, store, stripe, subSync: new SubscriptionSync(store, stripe) });
  server.start();
  await new Promise((resolve) => server.server.once('listening', resolve));
  const port = server.server.address().port;
  try {
    await fn(port);
  } finally {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

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
    assert.equal(process.json.result.type, 'cognitive_map');
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
