'use strict';

const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  JapaneseParserMCPClient,
  isJapaneseParserConfigured,
  resolveParserMode,
  defaultDeadlineMs
} = require('../src/japanese-parser-mcp-client');

const mode = resolveParserMode();
const options = {
  mode,
  python: process.env.ASTERA_JAPANESE_PARSER_PYTHON || '/usr/bin/python3',
  dockerImage: process.env.ASTERA_JAPANESE_PARSER_DOCKER_IMAGE || 'deterministic-japanese-parser-mcp:latest',
  deadlineMs: defaultDeadlineMs(),
  timeoutMs: Number(process.env.ASTERA_JAPANESE_PARSER_TIMEOUT_MS || 15000)
};

function dockerCliAvailable() {
  if (mode !== 'stdio-docker') return true;
  return spawnSync('docker', ['version'], { encoding: 'utf8' }).status === 0;
}

test(`live ${mode} parser returns AnalyzeResponse for door command`, { skip: !isJapaneseParserConfigured(options) || !dockerCliAvailable() }, async () => {
  const client = new JapaneseParserMCPClient(options);
  const result = await client.analyze({
    originalText: 'ドアを開けてください',
    executionMode: 'analysis',
    deadlineMs: options.deadlineMs
  });
  assert.ok(['COMPLETE', 'PARTIAL', 'FAILED'].includes(result.overall_status));
  assert.ok(Array.isArray(result.meaning_graph?.propositions));
  assert.ok(result.meaning_graph.propositions.length >= 1);
  assert.ok(String(result.astera_mcp_transport.transport).includes(mode === 'python-api' ? 'python-api' : 'stdio'));
});
