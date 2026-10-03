'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');
const { projectFiveLaneMaterialToMain8 } = require('../src/runtime/five-lane-main8-projection');

const silentLogger = { write() {} };
const caller = { id: 'material-main8-test', is_global: true, plan: 'admin' };

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('Requirement Graph reaches public Main8 only through five-lane processing and operation-relevant specialist material is preserved', async () => {
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

    const stages = out.result?.five_stage?.tasks || [];
    const inquiryMissing = stages.flatMap((task) => task?.inquiry?.missing_fields || []);
    assert.ok(inquiryMissing.includes('判断基準・合格条件が未確定'));
    assert.ok(inquiryMissing.includes('判断を無効にする条件・反例・失敗条件が未確定'));

    const factRequirement = stages.flatMap((task) => task?.fact?.fact_requirements || [])[0]?.item;
    const inquiryRequirement = stages.flatMap((task) => task?.inquiry?.inquiry_lens || [])[0];
    const evidenceRequirement = stages.flatMap((task) => task?.inquiry?.evidence_need || [])[0];
    const comparisonDimension = stages.flatMap((task) => task?.compare?.dimensions || [])[0];
    const domainPerspective = stages.flatMap((task) => task?.multi?.perspectives || [])
      .find((item) => item?.source === 'LENS_PLAN')?.focus;

    assert.ok(factRequirement);
    assert.ok(inquiryRequirement);
    assert.ok(evidenceRequirement);
    assert.ok(comparisonDimension);
    assert.ok(domainPerspective);

    for (const value of [factRequirement, inquiryRequirement, evidenceRequirement, domainPerspective]) {
      assert.match(out.material.text, new RegExp(escapeRegExp(value), 'u'));
    }

    assert.match(out.material.text, /専門分野上、確認が必要な事実項目（確認済み事実ではない）/u);
    assert.match(out.material.text, /次に確認する専門項目/u);
    assert.match(out.material.text, /成立確認に必要な根拠項目（存在・取得・採用済みとは限らない）/u);
    assert.match(out.material.text, /専門分野から追加で見る視点/u);
    assert.doesNotMatch(out.material.text, /判断・比較で揃える専門軸/u);

    assert.match(out.material.text, /判断材料不足: 判断基準・合格条件が未確定/u);
    assert.match(out.material.text, /判断材料不足: 判断を無効にする条件・反例・失敗条件が未確定/u);
    assert.doesNotMatch(out.material.text, /R\d+:MR\d+|SPECIALIST_FACT_REQUIREMENT|DECISION_CRITERION|DOMAIN_REFINEMENT/u);
    assert.doesNotMatch(out.material.text, /Data Loss|Downtime|Recall|保証不履行/u);
  } finally {
    await engine.destroy();
  }
});

test('Compare lane dimensions stay internal for verify tasks and become public for explicit compare tasks', () => {
  const judgment = { '06_comparison': { dimensions: [] } };
  const laneResult = (action) => ({
    task: { action },
    lanes: { compare: { dimensions: ['安全性', 'Cost'] } }
  });

  const verifyProjection = projectFiveLaneMaterialToMain8(judgment, [laneResult('verify')]);
  assert.deepEqual(verifyProjection['06_comparison'].dimensions, []);

  const compareProjection = projectFiveLaneMaterialToMain8(judgment, [laneResult('compare')]);
  assert.deepEqual(compareProjection['06_comparison'].dimensions, ['安全性', 'Cost']);
});
