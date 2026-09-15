'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');

const silentLogger = { write() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

function countingMockClient() {
  let analyzeCalls = 0;
  const inner = createMockJapaneseParserClient();
  const client = {
    async initialize() {},
    async analyze(args) {
      analyzeCalls += 1;
      return inner.analyze(args);
    },
    async destroy() {},
    get analyzeCalls() {
      return analyzeCalls;
    }
  };
  return client;
}

async function withCountingEngine(fn) {
  const japaneseParserClient = countingMockClient();
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger, japaneseParserClient });
  try {
    await fn(engine, japaneseParserClient);
  } finally {
    await engine.destroy();
  }
}

test('process invokes Japanese parser MCP analyze exactly once per request', async () => {
  await withCountingEngine(async (engine, client) => {
    await engine.process({ question: 'APIを改善する。成功条件は互換性維持である。', language: 'ja' }, tenant);
    assert.equal(client.analyzeCalls, 1);
  });
});

test('prepareRequest then process does not invoke parser again', async () => {
  await withCountingEngine(async (engine, client) => {
    const prepared = await engine.prepareRequest({ question: 'APIを改善する。' });
    assert.equal(client.analyzeCalls, 1);
    await engine.process({ question: 'APIを改善する。', language: 'ja', preparedRequest: prepared }, tenant);
    assert.equal(client.analyzeCalls, 1);
  });
});
