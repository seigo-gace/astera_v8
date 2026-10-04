'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { GENRE_LENSES } = require('../src/all-domain-lens-catalog');
const { compileLensPlan, GENRE_BREADTH_AUGMENTATIONS } = require('../src/lens-plan');

const EXPECTED = {
  G01: ['Source Authority・情報源Authority', 'Freshness・鮮度', 'Conflict・矛盾'],
  G02: ['Stakeholder・利害関係者', 'Values・価値', 'Trade-off・トレードオフ'],
  G07: ['Jurisdiction・管轄', 'Implementation・実施', 'Public Impact・公共影響'],
  G08: ['Jurisdiction・管轄', 'Effective Date・施行日', 'Exception・例外'],
  G10: ['Market・市場', 'Unit Economics・収益構造', 'Execution Risk・実行リスク'],
  G12: ['Skills・技能', 'Labor Market・労働市場', 'Retention・定着'],
  G18: ['Assumption・仮定', 'Method・手法', 'Uncertainty・不確実性'],
  G20: ['Composition・組成', 'Property・特性', 'Test Condition・試験条件'],
  G22: ['Species・種', 'Ecosystem・生態系', 'Evidence Quality・根拠品質'],
  G25: ['Requirement・要求', 'Failure Mode・故障モード', 'Verification・検証'],
  G26: ['Code・基準', 'Site Condition・現場条件', 'Lifecycle・ライフサイクル'],
  G27: ['Demand・需要', 'Reliability・信頼性', 'Cost Assumption・費用前提'],
  G30: ['Dataset・データセット', 'Metric・指標', 'Failure Mode・失敗モード'],
  G31: ['Threat・脅威', 'Asset・資産', 'Control Effectiveness・対策効果'],
  G33: ['User Exposure・利用者曝露', 'Failure・故障', 'Recall / Mitigation・是正'],
  G35: ['Mission Need・任務要求', 'Lifecycle・ライフサイクル', 'Governance・統治'],
  G36: ['Capacity・容量', 'Latency・遅延', 'Interoperability・相互運用'],
  G38: ['Need・必要性', 'Total Cost・総費用', 'Constraint・制約']
};

function primary(id) {
  return GENRE_LENSES.find((item) => item.id === id);
}

function values(plan) {
  return Object.values(plan.channels).flat().map((entry) => entry.value);
}

test('additive breadth preserves specialist pre-decision material for weak-domain profiles', () => {
  for (const [id, required] of Object.entries(EXPECTED)) {
    assert.ok(GENRE_BREADTH_AUGMENTATIONS[id], `${id} breadth missing`);
    const plan = compileLensPlan({ taxonomy_version: '1.0.0', primary: primary(id), secondary: [], overlays: [] });
    const publicValues = values(plan);
    for (const item of required) assert.ok(publicValues.includes(item), `${id} missing ${item}`);
    assert.equal(plan.primary_id, id);
  }
});

test('breadth entries remain judgment material and never encode winner or recommendation fields', () => {
  for (const breadth of Object.values(GENRE_BREADTH_AUGMENTATIONS)) {
    for (const forbidden of ['winner', 'recommendation', 'selected_candidate', 'candidate_ranking']) {
      assert.equal(Object.hasOwn(breadth, forbidden), false, `${breadth.id} contains ${forbidden}`);
    }
  }
});
