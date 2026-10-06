'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');
const { diagnoseMaterialRequirementGraph } = require('../src/runtime/material-requirement-diagnostics');

const silentLogger = { write() {} };
const caller = { id: 'material-requirement-runtime-test', is_global: true, plan: 'admin' };

test('public AsteraEngine carries the Material Requirement Graph from prepareRequest through process', async () => {
  const engine = new AsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient(),
    evidenceSearchClient: null
  });
  const question = 'APIを改善する。成功条件は互換性を維持すること。未確認事項を事実扱いしてはならない。';
  try {
    const prepared = await engine.prepareRequest({ question, language: 'ja' });
    const preparedGraph = prepared.analysis_task_packet?.material_requirement_graph;
    assert.ok(preparedGraph);
    assert.equal(diagnoseMaterialRequirementGraph(preparedGraph).pass, true);

    const out = await engine.process({ question, language: 'ja', preparedRequest: prepared }, caller);
    const resultGraph = out.result?.analysis_task_packet?.material_requirement_graph;
    assert.ok(resultGraph);
    assert.equal(resultGraph.graph_signature, preparedGraph.graph_signature);
    assert.equal(diagnoseMaterialRequirementGraph(resultGraph).pass, true);
  } finally {
    await engine.destroy();
  }
});
