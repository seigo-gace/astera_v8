'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');

const silentLogger = { write() {} };
const caller = { id: 'material-main8-test', is_global: true, plan: 'admin' };

test('public Main8 exposes missing judgment material without leaking internal requirement ids', async () => {
  const engine = new AsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient(),
    evidenceSearchClient: null
  });
  const question = '機械製造の材料強度と品質工学を検証する。安全性を確認し、未確認事項を事実扱いしてはならない。';
  try {
    const prepared = await engine.prepareRequest({ question, language: 'ja' });
    const graph = prepared.analysis_task_packet?.material_requirement_graph;
    assert.ok(graph);
    assert.ok(graph.specialist_refinement_version);

    const out = await engine.process({ question, language: 'ja', preparedRequest: prepared }, caller);
    assert.equal(out.material?.sections?.length, 8);
    assert.ok(out.material?.material_requirement_projection);
    assert.equal(out.material.material_requirement_projection.accounting_complete, true);
    assert.match(out.material.text, /判断に必要だが不足・未確認の材料/u);
    assert.match(out.material.text, /判断を誤らせる失格条件・専門リスク/u);
    assert.match(out.material.text, /不足を埋めるための次の確認/u);
    assert.doesNotMatch(out.material.text, /R\d+:MR\d+|SPECIALIST_FACT_REQUIREMENT|DECISION_CRITERION|DOMAIN_REFINEMENT/u);
  } finally {
    await engine.destroy();
  }
});
