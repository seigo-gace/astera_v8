'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');

const silentLogger = { write() {} };
const caller = { id: 'material-main8-test', is_global: true, plan: 'admin' };

test('Requirement Graph reaches public Main8 only through five-lane Inquiry processing', async () => {
  const engine = new AsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient(),
    evidenceSearchClient: null
  });
  const question = '機械製造の材料強度と品質工学を検証する。';
  try {
    const prepared = await engine.prepareRequest({ question, language: 'ja' });
    const graph = prepared.analysis_task_packet?.material_requirement_graph;
    assert.ok(graph);
    assert.ok(graph.specialist_refinement_version);

    const preparedUnresolved = (prepared.analysis_task_packet?.tasks || [])
      .flatMap((task) => task?.unresolved || []);
    assert.ok(preparedUnresolved.includes('判断基準・合格条件が未確定'));
    assert.ok(preparedUnresolved.includes('判断を無効にする条件・反例・失敗条件が未確定'));

    const out = await engine.process({ question, language: 'ja', preparedRequest: prepared }, caller);
    assert.equal(out.material?.sections?.length, 8);
    assert.equal(out.material?.material_requirement_projection, undefined);

    const inquiryMissing = (out.result?.five_stage?.tasks || [])
      .flatMap((task) => task?.inquiry?.missing_fields || []);
    assert.ok(inquiryMissing.includes('判断基準・合格条件が未確定'));
    assert.ok(inquiryMissing.includes('判断を無効にする条件・反例・失敗条件が未確定'));

    assert.match(out.material.text, /判断材料不足: 判断基準・合格条件が未確定/u);
    assert.match(out.material.text, /判断材料不足: 判断を無効にする条件・反例・失敗条件が未確定/u);
    assert.doesNotMatch(out.material.text, /R\d+:MR\d+|SPECIALIST_FACT_REQUIREMENT|DECISION_CRITERION|DOMAIN_REFINEMENT/u);
    assert.doesNotMatch(out.material.text, /Data Loss|Downtime|Recall|保証不履行/u);
  } finally {
    await engine.destroy();
  }
});
