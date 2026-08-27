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

const PUBLIC_KEY = 'astera-test-public-key-0123456789abcdef';

async function withServer(fn, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astera-api-'));
  const previousApiKey = process.env.ASTERA_API_KEY;
  const previousPepper = process.env.ASTERA_KEY_PEPPER;
  process.env.ASTERA_API_KEY = options.publicKey || PUBLIC_KEY;
  process.env.ASTERA_KEY_PEPPER = 'astera-test-pepper-0123456789abcdef0123456789';
  const store = new SQLiteStore(path.join(dir, 'test.db'));
  const logger = options.logger || new Logger({ cacheDir: path.join(dir, 'outbox'), tgsEnabled: false });
  const server = new AsteraServer({ port: 0, host: '127.0.0.1', poolSize: 1, store, logger, limiter: options.limiter });
  server.start();
  await new Promise((resolve) => server.server.once('listening', resolve));
  const port = server.server.address().port;
  try {
    await fn(port, logger);
  } finally {
    await server.stop();
    if (previousApiKey === undefined) delete process.env.ASTERA_API_KEY; else process.env.ASTERA_API_KEY = previousApiKey;
    if (previousPepper === undefined) delete process.env.ASTERA_KEY_PEPPER; else process.env.ASTERA_KEY_PEPPER = previousPepper;
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

test('HTTP flow: process works with externally provisioned Astera key', async () => {
  await withServer(async (port) => {
    const process = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY },
      body: JSON.stringify({ question: '新規事業のニッチを見つけたい。対象は小規模事業者。成功条件は初月から低コストで試せること。' })
    });
    assert.equal(process.status, 200);
    assert.match(process.headers['content-type'], /text\/plain/);
    assert.equal(process.json, null);
    assert.match(process.body, /01 本当の目的/);
    assert.match(process.body, /導出根拠/);
    assert.match(process.body, /External Consumerへ渡す内容/);
    assert.match(process.body, /08 主役AI／利用者への再指示/);
    assert.equal((process.body.match(/^---$/gm) || []).length, 7);
  });
});

test('HTTP flow: canonical process rejects caller-supplied LLM configuration', async () => {
  await withServer(async (port) => {
    const response = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY },
      body: JSON.stringify({ question: '判断材料を作る。', llm: { chain: ['null'] } })
    });
    assert.equal(response.status, 400);
    assert.match(response.json.error, /unsupported decision-materials input fields: llm/i);
  });
});

test('Skill API rejects missing and public tenant keys', async () => {
  const previous = process.env.ASTERA_SKILL_API_KEY;
  process.env.ASTERA_SKILL_API_KEY = 'skill_test_key_abcdefghijklmnopqrstuvwxyz';
  try {
    await withServer(async (port) => {
      const missing = await request({ port, method: 'POST', path: '/v1/skill/process', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: '十分な長さの検証質問です。目的と成功条件を確認します。' }) });
      assert.equal(missing.status, 401);
      const publicKey = await request({ port, method: 'POST', path: '/v1/skill/process', headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY }, body: JSON.stringify({ question: '十分な長さの検証質問です。目的と成功条件を確認します。' }) });
      assert.equal(publicKey.status, 401);
    });
  } finally {
    if (previous === undefined) delete process.env.ASTERA_SKILL_API_KEY;
    else process.env.ASTERA_SKILL_API_KEY = previous;
  }
});

test('Skill API rejects missing, short, and public-key-shared configuration', async () => {
  const previousSkill = process.env.ASTERA_SKILL_API_KEY;
  const previousGlobal = process.env.ASTERA_API_KEY;
  try {
    delete process.env.ASTERA_SKILL_API_KEY;
    await withServer(async (port) => {
      const missing = await request({ port, method: 'POST', path: '/v1/skill/process', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'anything' }, body: '{}' });
      assert.equal(missing.status, 503);
      assert.equal(missing.json.error, 'skill_api_not_configured');
    });

    process.env.ASTERA_SKILL_API_KEY = 'too-short';
    await withServer(async (port) => {
      const short = await request({ port, method: 'POST', path: '/v1/skill/process', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'too-short' }, body: '{}' });
      assert.equal(short.status, 503);
    });

    process.env.ASTERA_SKILL_API_KEY = 'shared_test_key_abcdefghijklmnopqrstuvwxyz';
    process.env.ASTERA_API_KEY = process.env.ASTERA_SKILL_API_KEY;
    await withServer(async (port) => {
      const shared = await request({ port, method: 'POST', path: '/v1/skill/process', headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.ASTERA_SKILL_API_KEY }, body: '{}' });
      assert.equal(shared.status, 503);
    }, { publicKey: process.env.ASTERA_SKILL_API_KEY });
  } finally {
    if (previousSkill === undefined) delete process.env.ASTERA_SKILL_API_KEY;
    else process.env.ASTERA_SKILL_API_KEY = previousSkill;
    if (previousGlobal === undefined) delete process.env.ASTERA_API_KEY;
    else process.env.ASTERA_API_KEY = previousGlobal;
  }
});

test('Skill process API uses dedicated key and bypasses public rate and billing', async () => {
  const previous = process.env.ASTERA_SKILL_API_KEY;
  process.env.ASTERA_SKILL_API_KEY = 'skill_test_key_abcdefghijklmnopqrstuvwxyz';
  try {
    const limiter = { check() { throw new Error('skill endpoint must not call rate limiter'); } };
    await withServer(async (port) => {
      const response = await request({
        port,
        method: 'POST',
        path: '/v1/skill/process',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': process.env.ASTERA_SKILL_API_KEY },
        body: JSON.stringify({ question: '新規事業の判断材料を整理する。対象は小規模事業者で、成功条件は低コストで検証できること。' })
      });
      assert.equal(response.status, 200);
      assert.match(response.body, /01 本当の目的/);
    }, { limiter });
  } finally {
    if (previous === undefined) delete process.env.ASTERA_SKILL_API_KEY;
    else process.env.ASTERA_SKILL_API_KEY = previous;
  }
});

test('HTTP flow: context must be a string', async () => {
  await withServer(async (port) => {
    const bad = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY },
      body: JSON.stringify({ question: '対象はAstera。成功条件は8項目出力。', context: { unexpected: true } })
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'context must be a string');
  });
});

test('HTTP flow: short process request returns clarification text', async () => {
  await withServer(async (port) => {
    const process = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY },
      body: JSON.stringify({ question: 'どう？' })
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
    const bad = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY },
      body: '{bad'
    });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /Invalid JSON/);
  });
});

test('HTTP flow: invalid question type returns 400', async () => {
  await withServer(async (port) => {
    const bad = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY },
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
    const huge = JSON.stringify({ question: 'x'.repeat(1024 * 1024 + 50) });
    const res = await request({
      port,
      method: 'POST',
      path: '/process',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY },
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

test('HTTP flow: removed account and billing routes stay absent from Astera Core', async () => {
  await withServer(async (port) => {
    for (const route of ['/signup', '/billing/checkout', '/billing/webhook']) {
      const response = await request({ port, method: 'POST', path: route, headers: { 'Content-Type': 'application/json', 'X-API-Key': PUBLIC_KEY }, body: '{}' });
      assert.equal(response.status, 404, route);
    }
  });
});
