'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const AsteraServer = require('../src/server');
const SQLiteStore = require('../src/store/sqlite-store');
const Logger = require('../src/logger');

test('Main health never reports ok=true when canonical storage is degraded', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-health-'));
  const store = new SQLiteStore(path.join(dir, 'health.db'));
  store.mode = 'json-fallback';
  store.sqliteError = 'forced storage failure for health contract test';
  const server = new AsteraServer({ port: 0, host: '127.0.0.1', poolSize: 1, store, logger: new Logger({ cacheDir: path.join(dir, 'outbox'), tgsEnabled: false }) });
  server.start();
  await once(server.server, 'listening');
  try {
    const { port } = server.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/healthz`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.status, 'DEGRADED_STORAGE');
    assert.equal(body.store, 'json-fallback');
    assert.match(body.sqlite_error, /forced storage failure/);
  } finally {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
