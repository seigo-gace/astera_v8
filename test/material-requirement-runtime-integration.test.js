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
    const requirementRows = (out.result?.task_results || []).flatMap(item =>
      item.task?.material_evidence_execution?.requirements || []);
    assert.ok(requirementRows.length > 0,'material requirements reach public canonical Task output');
    assert.ok(requirementRows.every(row => row.confirmation_status === 'UNRESOLVED'),
      'no external evidence may make a requirement satisfied');
    assert.ok(requirementRows.every(row => typeof row.confirmation_reason === 'string'),
      'each requirement receives post-canonical reconciliation diagnostics: '+JSON.stringify({missing:requirementRows.filter(row => typeof row.confirmation_reason !== 'string').slice(0,3),failures:out.result?.parallel_execution?.failures,skipped:out.result?.parallel_execution?.skipped}));
    assert.ok((out.result?.five_stage?.tasks || []).length > 0,'five-stage output remains intact');
    assert.equal(out.material?.sections?.length,8,'Main8 remains intact');
  } finally {
    await engine.destroy();
  }
});
