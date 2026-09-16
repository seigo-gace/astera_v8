'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const CanonicalV4Engine = require('../src/canonical-v4-engine');
const { createMockJapaneseParserClient, mockJapaneseParserResult } = require('./helpers/japanese-parser-mcp-mock');
const { failClosedRequest, japaneseFastSkeleton, normalizeParserErrorCode } = require('../src/canonical-v4-engine');

const silentLogger = { write() {} };
const caller = { id: 'test', is_global: true, plan: 'admin' };

async function withCanonicalEngine(options, fn) {
  const japaneseParserClient = Object.prototype.hasOwnProperty.call(options, 'japaneseParserClient')
    ? options.japaneseParserClient
    : createMockJapaneseParserClient();
  const engine = new CanonicalAsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient
  });
  try {
    await fn(engine);
  } finally {
    await engine.destroy();
  }
}

test('normalizeParserErrorCode maps legacy parser client codes', () => {
  assert.equal(normalizeParserErrorCode('PARSER_CLIENT_NOT_CONFIGURED'), 'PARSER_NOT_CONFIGURED');
  assert.equal(normalizeParserErrorCode('PARSER_MCP_TIMEOUT'), 'PARSER_TIMEOUT');
  assert.equal(normalizeParserErrorCode('PARSER_MCP_MALFORMED_JSON'), 'PARSER_PROTOCOL_ERROR');
  assert.equal(normalizeParserErrorCode('PARSER_OVERALL_FAILED'), 'PARSER_EXECUTION_FAILED');
});

test('parser not configured is task_graph_blocked not clarification', async () => {
  await withCanonicalEngine({ japaneseParserClient: null }, async (engine) => {
    const out = await engine.process({ question: 'APIを改善する。', language: 'ja' }, caller);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.instruction_understanding?.mode, 'FAIL_CLOSED');
    assert.equal(out.result.error_code, 'PARSER_NOT_CONFIGURED');
    assert.notEqual(out.result.type, 'clarification_needed');
  });
});

test('parser timeout is task_graph_blocked not clarification', async () => {
  await withCanonicalEngine({
    japaneseParserClient: createMockJapaneseParserClient({
      resolveResult: () => {
        throw Object.assign(new Error('timed out'), { code: 'PARSER_MCP_TIMEOUT' });
      }
    })
  }, async (engine) => {
    const out = await engine.process({ question: 'APIを改善する。', language: 'ja' }, caller);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.error_code, 'PARSER_TIMEOUT');
  });
});

test('unresolved target after successful parse remains clarification_needed', async () => {
  await withCanonicalEngine({}, async (engine) => {
    const out = await engine.process({ question: 'どう？', language: 'ja' }, caller);
    assert.equal(out.result.type, 'clarification_needed');
    assert.equal(out.result.clarification_code, 'USER_CLARIFICATION_REQUIRED');
  });
});

test('CanonicalV4Engine parser failure short input stays task_graph_blocked', async () => {
  const engine = new CanonicalV4Engine({
    logger: silentLogger,
    japaneseParserClient: null
  });
  try {
    const prepared = failClosedRequest(japaneseFastSkeleton({ question: '短い' }), {
      code: 'PARSER_CLIENT_NOT_CONFIGURED',
      message: 'missing'
    });
    const out = await engine.process({ question: '短い', preparedRequest: prepared });
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.error_code, 'PARSER_NOT_CONFIGURED');
  } finally {
    await engine.destroy();
  }
});

test('CanonicalV4Engine parser timeout mock returns task_graph_blocked', async () => {
  const engine = new CanonicalV4Engine({
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient({
      resolveResult: () => mockJapaneseParserResult('APIを改善する。', { overall_status: 'FAILED', execution_allowed: false })
    })
  });
  try {
    const out = await engine.process({ question: 'APIを改善する。', language: 'ja' });
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.request_model?.instruction_understanding?.mode, 'FAIL_CLOSED');
  } finally {
    await engine.destroy();
  }
});
