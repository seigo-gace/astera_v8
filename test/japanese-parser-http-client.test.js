'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  JapaneseParserMCPClient,
  isJapaneseParserConfigured
} = require('../src/japanese-parser-mcp-client');

function parserPayload(originalText) {
  return {
    original_text: originalText,
    overall_status: 'COMPLETE',
    execution_allowed: true,
    analysis_path: 'FAST',
    meaning_graph: {
      semantic_hash: 'test-semantic-hash',
      propositions: [{ id: 'p1' }]
    },
    task_graph: {
      tasks: []
    },
    versions: {
      parser: '0.4.0'
    }
  };
}

test('HTTP parser mode sends bearer auth and returns validated parser output', async () => {
  const originalText = '開発者が設定を変更した。';
  let fetchCalls = 0;
  let spawnCalls = 0;

  const client = new JapaneseParserMCPClient({
    mode: 'http',
    url: 'http://127.0.0.1:8765/v1/analyze',
    apiKey: 'test-only-key',
    timeoutMs: 1000,
    spawnImpl: () => {
      spawnCalls += 1;
      throw new Error('stdio must not run in HTTP mode');
    },
    fetchImpl: async (url, options) => {
      fetchCalls += 1;
      assert.equal(url, 'http://127.0.0.1:8765/v1/analyze');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers.authorization, 'Bearer test-only-key');
      assert.equal(options.headers['content-type'], 'application/json');
      const body = JSON.parse(options.body);
      assert.equal(body.original_text, originalText);
      assert.equal(body.execution_mode, 'analysis');
      assert.equal(body.analysis_depth, 'auto');
      return {
        status: 200,
        text: async () => JSON.stringify(parserPayload(originalText))
      };
    }
  });

  const result = await client.analyze({ originalText });
  assert.equal(fetchCalls, 1);
  assert.equal(spawnCalls, 0);
  assert.equal(result.original_text, originalText);
  assert.equal(result.overall_status, 'COMPLETE');
  assert.equal(result.astera_mcp_transport.transport, 'http');
  assert.equal(result.astera_mcp_transport.server_version, '0.4.0');
});

test('HTTP parser auth failure is fail-closed and never falls back to stdio', async () => {
  let spawnCalls = 0;
  const client = new JapaneseParserMCPClient({
    mode: 'http',
    url: 'http://127.0.0.1:8765/v1/analyze',
    apiKey: 'wrong-test-key',
    timeoutMs: 1000,
    spawnImpl: () => {
      spawnCalls += 1;
      throw new Error('stdio fallback is forbidden');
    },
    fetchImpl: async () => ({
      status: 401,
      text: async () => '{"error":"unauthorized"}'
    })
  });

  await assert.rejects(
    () => client.analyze({ originalText: '開発者が設定を変更した。' }),
    (error) => error?.code === 'PARSER_HTTP_UNAUTHORIZED' && error?.http_status === 401
  );
  assert.equal(spawnCalls, 0);
});

test('HTTP parser mode is configured only when URL and API key are present', () => {
  assert.equal(isJapaneseParserConfigured({
    mode: 'http',
    url: 'http://127.0.0.1:8765/v1/analyze',
    apiKey: 'present'
  }), true);
  assert.equal(isJapaneseParserConfigured({
    mode: 'http',
    url: 'http://127.0.0.1:8765/v1/analyze',
    apiKey: ''
  }), false);
});
