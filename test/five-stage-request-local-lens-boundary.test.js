'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { scopeFiveStageDecisionMaterial } = require('../src/runtime/five-stage-public-boundary');

function entry(value, tier, lensId) {
  return { value, sources: [{ tier, lens_id: lensId }] };
}

function baseLanes() {
  return {
    lens_plan: {
      channels: {
        fact: [
          entry('現行System', 'PRIMARY', 'G29'),
          entry('Cash Flow', 'SECONDARY', 'G11')
        ],
        risk: [
          entry('Data Loss', 'PRIMARY', 'G29'),
          entry('Downtime', 'PRIMARY_BREADTH', 'G29-BREADTH'),
          entry('資金流動性', 'SECONDARY', 'G11'),
          entry('返金負債', 'SECONDARY', 'G11')
        ],
        multi: [
          entry('Developer', 'PRIMARY', 'G29'),
          entry('財務責任者', 'SECONDARY', 'G11')
        ],
        inquiry: [
          entry('互換条件は何か', 'PRIMARY', 'G29'),
          entry('返金・失効条件は何か', 'SECONDARY', 'G11')
        ],
        evidence: [
          entry('Code参照', 'PRIMARY', 'G29'),
          entry('Ledger', 'SECONDARY', 'G11')
        ],
        compare: [
          entry('保守性・Risk・Cost', 'PRIMARY', 'G29'),
          entry('返金対応', 'SECONDARY', 'G11')
        ]
      }
    },
    fact: {
      fact_requirements: [
        { item: '現行System', status: 'REQUIRES_CONFIRMATION', source: 'LENS_PLAN', lens_sources: [{ tier: 'PRIMARY', lens_id: 'G29' }] },
        { item: 'Cash Flow', status: 'REQUIRES_CONFIRMATION', source: 'LENS_PLAN', lens_sources: [{ tier: 'SECONDARY', lens_id: 'G11' }] }
      ],
      evidence_gaps: [
        { item: 'Code参照', source: 'LENS_PLAN', lens_sources: [{ tier: 'PRIMARY', lens_id: 'G29' }] },
        { item: 'Ledger', source: 'LENS_PLAN', lens_sources: [{ tier: 'SECONDARY', lens_id: 'G11' }] }
      ]
    },
    risk: {
      risks: [
        { rule_id: 'P1', impact: 'Data Loss', failure_condition: 'x', weight: 20, source: 'LENS_PLAN', lens_sources: [{ tier: 'PRIMARY', lens_id: 'G29' }] },
        { rule_id: 'P2', impact: 'Downtime', failure_condition: 'x', weight: 20, source: 'LENS_PLAN', lens_sources: [{ tier: 'PRIMARY_BREADTH', lens_id: 'G29-BREADTH' }] },
        { rule_id: 'S1', impact: '資金流動性', failure_condition: 'x', weight: 20, source: 'LENS_PLAN', lens_sources: [{ tier: 'SECONDARY', lens_id: 'G11' }] },
        { rule_id: 'S2', impact: '返金負債', failure_condition: 'x', weight: 20, source: 'LENS_PLAN', lens_sources: [{ tier: 'SECONDARY', lens_id: 'G11' }] }
      ]
    },
    multi: {
      perspectives: [
        { id: 'forward', focus: 'UIエラー表示', source: 'CANONICAL_CLAIMS' },
        { id: 'defensive', focus: ['Data Loss', 'Downtime', '資金流動性', '返金負債'], source: 'CANONICAL_CLAIMS_PLUS_LENS_PLAN' },
        { id: 'domain:1', focus: 'Developer', source: 'LENS_PLAN', lens_sources: [{ tier: 'PRIMARY', lens_id: 'G29' }] },
        { id: 'domain:2', focus: '財務責任者', source: 'LENS_PLAN', lens_sources: [{ tier: 'SECONDARY', lens_id: 'G11' }] }
      ],
      trade_off_map: [
        { id: 'forward' }, { id: 'defensive' }, { id: 'domain:1' }, { id: 'domain:2' }
      ]
    },
    inquiry: {
      missing_questions: ['互換条件は何か', '返金・失効条件は何か', '利用者に見せるError境界を確認する'],
      inquiry_lens: ['互換条件は何か', '返金・失効条件は何か'],
      evidence_need: ['Code参照', 'Ledger']
    },
    compare: {
      dimensions: ['保守性・Risk・Cost', '返金対応', '利用者理解'],
      dimension_sources: [
        { value: '保守性・Risk・Cost', sources: [{ tier: 'PRIMARY', lens_id: 'G29' }] },
        { value: '返金対応', sources: [{ tier: 'SECONDARY', lens_id: 'G11' }] }
      ],
      trade_off_differences: [
        { dimension: '保守性・Risk・Cost' },
        { dimension: '返金対応' },
        { dimension: '利用者理解' }
      ]
    }
  };
}

test('public boundary keeps primary request-local lens material and blocks unrelated secondary lens material', () => {
  const lanes = baseLanes();
  const task = {
    action: 'verify',
    raw_text: '利用者向けError表示を確認し、内部API名やstack traceを見せず、主要な危険と反対視点、比較に必要な軸、次に確認する材料を整理する。',
    material_requirements: [
      '主要な危険を整理する',
      '反対視点を整理する',
      '比較に必要な軸を整理する',
      '次に確認する材料を整理する'
    ]
  };

  const out = scopeFiveStageDecisionMaterial(lanes, task, { records: [] });

  assert.deepEqual(out.fact.fact_requirements.map((x) => x.item), ['現行System']);
  assert.deepEqual(out.fact.evidence_gaps.map((x) => x.item), ['Code参照']);
  assert.deepEqual(out.risk.risks.map((x) => x.impact), ['Data Loss', 'Downtime']);
  assert.deepEqual(out.multi.perspectives.find((x) => x.id === 'defensive').focus, ['Data Loss', 'Downtime']);
  assert.equal(out.multi.perspectives.some((x) => x.focus === '財務責任者'), false);
  assert.deepEqual(out.inquiry.inquiry_lens, ['互換条件は何か']);
  assert.deepEqual(out.inquiry.evidence_need, ['Code参照']);
  assert.deepEqual(out.compare.dimensions, ['保守性・Risk・Cost']);

  assert.equal(lanes.risk.risks.some((x) => x.impact === '資金流動性'), true, 'internal lane must remain unchanged');
  assert.equal(lanes.compare.dimensions.includes('返金対応'), true, 'internal compare lane must remain unchanged');
});

test('secondary lens material may pass only when the request itself explicitly contains it', () => {
  const lanes = baseLanes();
  const task = {
    action: 'compare',
    raw_text: '返金対応と利用者理解を比較し、返金負債も主要Riskとして確認する。',
    material_requirements: ['比較軸', '主要Risk', '次に確認する材料']
  };

  const out = scopeFiveStageDecisionMaterial(lanes, task, { records: [] });

  assert.equal(out.risk.risks.some((x) => x.impact === '返金負債'), true);
  assert.equal(out.risk.risks.some((x) => x.impact === '資金流動性'), false);
  assert.equal(out.compare.dimensions.includes('返金対応'), true);
  assert.equal(out.compare.dimensions.includes('保守性・Risk・Cost'), true);
});
