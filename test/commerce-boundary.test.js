'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AsteraServer = require('../src/server');
const SQLiteStore = require('../src/store/sqlite-store');
const Logger = require('../src/logger');

function request({ port, method = 'GET', path: requestPath = '/', headers = {}, body = '' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, method, path: requestPath, headers }, (res) => {
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

async function withCanonicalServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-commerce-boundary-'));
  const store = new SQLiteStore(path.join(dir, 'test.db'));
  const logger = new Logger({ cacheDir: path.join(dir, 'outbox'), tgsEnabled: false });
  const server = new AsteraServer({
    port: 0,
    host: '127.0.0.1',
    poolSize: 1,
    store,
    logger
  });
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

test('Canonical Astera Core runtime does not expose legacy commerce routes without explicit adapters', async () => {
  await withCanonicalServer(async (port) => {
    const health = await request({ port, path: '/healthz' });
    assert.equal(health.status, 200);
    assert.deepEqual(health.json.commerce_boundary, { legacy_routes_enabled: false });

    const signup = await request({ port, method: 'POST', path: '/signup' });
    assert.equal(signup.status, 404);

    const checkout = await request({
      port,
      method: 'POST',
      path: '/billing/checkout',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'pro' })
    });
    assert.equal(checkout.status, 404);

    const webhook = await request({
      port,
      method: 'POST',
      path: '/billing/webhook',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 'legacy-test' },
      body: '{}'
    });
    assert.equal(webhook.status, 404);
  });
});
