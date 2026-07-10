'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Logger = require('../src/logger');

test('Logger caches until TGserver accepts, masks secrets, then removes the cache', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-outbox-'));
  const requests = [];
  const logger = new Logger({
    cacheDir,
    tgsUrl: 'http://127.0.0.1:3000/ingest',
    projectId: 'P002',
    tgsEnabled: true,
    retries: 1,
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return { ok: true, status: 200 };
    }
  });

  try {
    logger.write({
      tenantId: 'tenant_test',
      type: 'test_event',
      severity: 'warn',
      text: 'delivery test',
      payload: { apiKey: 'sk-proj-super-secret-value' }
    });
    assert.equal(await logger.flush(1000), true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].project_id, 'P002');
    assert.equal(requests[0].severity, 'warn');
    assert.doesNotMatch(requests[0].message, /super-secret-value/);
    assert.deepEqual(fs.readdirSync(cacheDir), []);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('Logger keeps failed deliveries and replays them after restart', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-outbox-replay-'));
  try {
    const failed = new Logger({
      cacheDir,
      tgsEnabled: true,
      retries: 1,
      fetchImpl: async () => { throw new Error('TGserver unavailable'); }
    });
    failed.write({ type: 'retry_me', text: 'pending event' });
    await failed.flush(1000);
    assert.equal(fs.readdirSync(cacheDir).filter((name) => name.endsWith('.json')).length, 1);

    const replayed = [];
    const recovered = new Logger({
      cacheDir,
      tgsEnabled: true,
      retries: 1,
      fetchImpl: async (_url, options) => {
        replayed.push(JSON.parse(options.body));
        return { ok: true, status: 200 };
      }
    });
    assert.equal(await recovered.flush(1000), true);
    assert.equal(replayed.length, 1);
    assert.match(replayed[0].message, /retry_me/);
    assert.deepEqual(fs.readdirSync(cacheDir), []);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('Logger status reports pending deliveries and outbox stats', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-outbox-status-'));
  try {
    const logger = new Logger({
      cacheDir,
      tgsEnabled: true,
      retries: 1,
      fetchImpl: async () => { throw new Error('TGserver unavailable'); }
    });
    logger.write({ type: 'status_probe', text: 'pending event' });
    await logger.flush(1000);

    const status = logger.status();
    assert.equal(status.enabled, true);
    assert.equal(status.project_id, 'P002');
    assert.equal(status.pending_deliveries, 0);
    assert.equal(status.outbox.dir, cacheDir);
    assert.equal(status.outbox.writable, true);
    assert.equal(status.outbox.pending, 1);
    assert.equal(status.outbox.temporary, 0);
    assert.equal(status.outbox.expired, 0);
    assert.ok(status.outbox.bytes > 0);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});

test('Logger removes expired outbox records instead of replaying them', async () => {
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-outbox-expired-'));
  const expiredFile = path.join(cacheDir, 'expired.json');
  fs.writeFileSync(expiredFile, JSON.stringify({
    version: 1,
    created_at: '2020-01-01T00:00:00.000Z',
    expires_at: '2020-01-02T00:00:00.000Z',
    row: { at: '2020-01-01T00:00:00.000Z', severity: 'info', type: 'expired' }
  }));
  let deliveries = 0;
  try {
    const logger = new Logger({
      cacheDir,
      tgsEnabled: true,
      retries: 1,
      fetchImpl: async () => {
        deliveries += 1;
        return { ok: true, status: 200 };
      }
    });
    await logger.flush(1000);
    assert.equal(deliveries, 0);
    assert.deepEqual(fs.readdirSync(cacheDir), []);
  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
});
