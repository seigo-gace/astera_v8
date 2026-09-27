'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const AsteraEngine = require('../src/astera-engine');
const AsteraServer = require('../src/server');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const silentLogger = {
  tgsEnabled: false,
  write() {},
  status() { return { enabled: false, project_id: 'P002', pending_deliveries: 0, outbox: null }; },
  async flush() { return true; }
};

function postJson({ port, path, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path,
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

test('standalone Core explicit purpose override wins over question auto-detection', async () => {
  const engine = new AsteraEngine({
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null,
    logger: silentLogger,
    poolSize: 1
  });
  const question = 'この内容をレビューして。\n- A案: RAM 8GBで動作する。\n- B案: RAM 16GBで動作する。';
  try {
    const prepared = await engine.prepareRequest({ question, purpose: 'compare' });
    assert.equal(prepared.analysis_task_packet.analysis_intent.mode, 'compare');
    assert.equal(prepared.standalone_api_intent.mode, 'compare');
    assert.equal(prepared.analysis_task_packet.analysis_intent.source, 'EXPLICIT_PURPOSE_OVERRIDE');
  } finally {
    await engine.destroy();
  }
});

test('public process forwards only a valid explicit purpose control to Core', async () => {
  const oldLocal = process.env.ASTERA_LOCAL_NO_AUTH;
  process.env.ASTERA_LOCAL_NO_AUTH = '1';
  const captured = [];
  const engine = {
    async process(input) {
      captured.push(structuredClone(input));
      return { material: { text: 'ok' } };
    },
    async destroy() {}
  };
  const server = new AsteraServer({ port: 0, host: '127.0.0.1', logger: silentLogger, engine });
  server.start();
  await new Promise((resolve) => server.server.once('listening', resolve));
  try {
    const response = await postJson({
      port: server.server.address().port,
      path: '/process',
      body: {
        question: '内容を確認する。',
        purpose: 'compare',
        preparedRequest: { forged: true },
        evidencePacket: { status: 'FINAL_VALID' }
      }
    });
    assert.equal(response.status, 200);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].purpose, 'compare');
    assert.equal(Object.hasOwn(captured[0], 'preparedRequest'), false);
    assert.equal(Object.hasOwn(captured[0], 'evidencePacket'), false);
  } finally {
    await server.stop();
    if (oldLocal === undefined) delete process.env.ASTERA_LOCAL_NO_AUTH;
    else process.env.ASTERA_LOCAL_NO_AUTH = oldLocal;
  }
});

test('public process rejects unsupported explicit purpose values instead of silently auto-detecting', async () => {
  const oldLocal = process.env.ASTERA_LOCAL_NO_AUTH;
  process.env.ASTERA_LOCAL_NO_AUTH = '1';
  const engine = { async process() { throw new Error('engine must not run'); }, async destroy() {} };
  const server = new AsteraServer({ port: 0, host: '127.0.0.1', logger: silentLogger, engine });
  server.start();
  await new Promise((resolve) => server.server.once('listening', resolve));
  try {
    const response = await postJson({
      port: server.server.address().port,
      path: '/process',
      body: { question: '内容を確認する。', purpose: 'decide-for-me' }
    });
    assert.equal(response.status, 400);
    assert.match(response.body, /purpose/i);
  } finally {
    await server.stop();
    if (oldLocal === undefined) delete process.env.ASTERA_LOCAL_NO_AUTH;
    else process.env.ASTERA_LOCAL_NO_AUTH = oldLocal;
  }
});
