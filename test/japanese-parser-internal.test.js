'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {
  JapaneseParserMCPClient,
  isJapaneseParserConfigured,
  DEFAULT_DJPMCP
} = require('../src/japanese-parser-mcp-client');

const command = process.env.ASTERA_JAPANESE_PARSER_COMMAND || DEFAULT_DJPMCP;

test('live stdio djpmcp returns AnalyzeResponse for door command', {
  skip: !isJapaneseParserConfigured({ mode: 'stdio', command }) || !fs.existsSync(command)
}, async () => {
  const client = new JapaneseParserMCPClient({ mode: 'stdio', command });
  const result = await client.analyze({
    originalText: 'ドアを開けてください。',
    executionMode: 'analysis',
    deadlineMs: 5000
  });
  assert.equal(result.astera_mcp_transport.transport, 'stdio');
  assert.equal(result.astera_mcp_transport.tool, 'analyze_japanese');
  assert.ok(result.astera_mcp_transport.protocol_version);
  assert.ok(['COMPLETE', 'PARTIAL', 'FAILED'].includes(result.overall_status));
  assert.ok(Array.isArray(result.meaning_graph?.propositions));
  assert.ok(result.meaning_graph.propositions.length >= 1);
});
