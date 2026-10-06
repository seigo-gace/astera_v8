'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeFiveStageDecisionMaterial } = require('../src/runtime/five-stage-public-boundary');

function entry(value, tier, lensId) {
  return { value, sources: [{ tier, lens_id: lensId, lens_name: lensId }] };
}

function baseLanes(lensPlan) {
  return {
    lens_plan: lensPlan,
    fact: {
      fact_requirements: (lensPlan.channels.fact || []).map((item) => ({
        item: item.value,
        source: 'LENS_PLAN',
        lens_sources: item.sources
      })),
      evidence_gaps: (lensPlan.channels.evidence || []).map((item) => ({
        item: item.value,
        source: 'LENS_PLAN',
        lens_sources: item.sources
      }))
    },
    risk: {
      risks: (lensPlan.channels.risk || []).map((item, index) => ({
        rule_id: 'RISK-LENS-' + (index + 1),
        key: 'lens-risk-' + (index + 1),
        impact: item.value,
        failure_condition: 'Lens risk unresolved',
        weight: 20,
        source: 'LENS_PLAN',
        lens_sources: item.sources
      })),
      safety_gates: []
    },
    multi: {
      perspectives: (lensPlan.channels.multi || []).map((item, index) => ({
        id: 'domain:' + (index + 1),
        focus: item.value,
        source: 'LENS_PLAN',
        lens_sources: item.sources
      })),
      trade_off_map: (lensPlan.channels.multi || []).map((item, index) => ({
        id: 'domain:' + (index + 1),
        focus: item.value,
        source: 'LENS_PLAN'
      }))
    },
    inquiry: {
      inquiry_lens: (lensPlan.channels.inquiry || []).map((item) => item.value),
      evidence_need: (lensPlan.channels.evidence || []).map((item) => item.value),
      missing_questions: [
        ...(lensPlan.channels.inquiry || []).map((item) => item.value),
        ...(lensPlan.channels.evidence || []).map((item) => item.value),
        'source-backed unresolved question'
      ]
    },
    compare: {
      dimensions: (lensPlan.channels.compare || []).map((item) => item.value),
      dimension_sources: lensPlan.channels.compare || [],
      trade_off_differences: (lensPlan.channels.compare || []).map((item) => ({
        dimension: item.value,
        comparison_state: 'INSUFFICIENT_COMPARISON_MATERIAL'
      }))
    }
  };
}

test('secondary Lens material stays internal unless the actual material is source-relevant', () => {
  const lensPlan = {
    channels: {
      fact: [
        entry('現行System', 'PRIMARY', 'G29'),
        entry('取引構造', 'SECONDARY', 'G11')
      ],
      risk: [
        entry('Data Loss', 'PRIMARY', 'G29'),
        entry('資金流動性', 'SECONDARY', 'G11'),
        entry('単一障害点', 'SECONDARY', 'G36')
      ],
      multi: [
        entry('Developer', 'PRIMARY', 'G29'),
        entry('財務責任者', 'SECONDARY', 'G11')
      ],
      inquiry: [
        entry('Testと合格条件は何か', 'PRIMARY', 'G29'),
        entry('返金・失効条件は何か', 'SECONDARY', 'G11')
      ],
      compare: [
        entry('保守性・Risk・Cost', 'PRIMARY', 'G29'),
        entry('返金対応', 'SECONDARY', 'G11')
      ],
      evidence: [
        entry('Code参照', 'PRIMARY', 'G29'),
        entry('会計方針', 'SECONDARY', 'G11')
      ],
      safety: []
    }
  };
  const raw = baseLanes(lensPlan);
  const task = {
    source_span: {
      text: 'ユーザー向けエラーを整理し、内部API名やstack traceは見せず、クレジット不足や購入失敗、権限不足を利用者が対処できる文章にする。'
    },
    target: 'ユーザー向けエラー表示',
    objective: '内部エラーを公開せず利用者が対処できる表示にする'
  };

  const scoped = scopeFiveStageDecisionMaterial(raw, task, { records: [] });

  assert.deepEqual(raw.risk.risks.map((item) => item.impact), ['Data Loss', '資金流動性', '単一障害点']);
  assert.deepEqual(scoped.risk.risks.map((item) => item.impact), ['Data Loss']);
  assert.deepEqual(scoped.fact.fact_requirements.map((item) => item.item), ['現行System']);
  assert.deepEqual(scoped.multi.perspectives.map((item) => item.focus), ['Developer']);
  assert.deepEqual(scoped.inquiry.inquiry_lens, ['Testと合格条件は何か']);
  assert.deepEqual(scoped.inquiry.evidence_need, ['Code参照']);
  assert.deepEqual(scoped.compare.dimensions, ['保守性・Risk・Cost']);
});

test('primary breadth replaces unrelated representative-anchor material in public output', () => {
  const lensPlan = {
    channels: {
      fact: [
        entry('取引構造', 'PRIMARY', 'G11'),
        entry('返金・失効条件', 'PRIMARY', 'G11'),
        entry('Investment Objective・投資目的', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION'),
        entry('Expected Cash Flow・期待Cash Flow', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION')
      ],
      risk: [
        entry('返金負債', 'PRIMARY', 'G11'),
        entry('Downside・損失余地', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION')
      ],
      multi: [
        entry('決済事業者', 'PRIMARY', 'G11'),
        entry('Investor・投資者', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION')
      ],
      inquiry: [
        entry('返金・失効条件は何か', 'PRIMARY', 'G11'),
        entry('期待Returnと資本Costは何か', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION')
      ],
      compare: [
        entry('返金対応', 'PRIMARY', 'G11'),
        entry('Expected Return・期待収益', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION'),
        entry('Capital Cost・資本Cost', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION'),
        entry('Downside・損失余地', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION')
      ],
      evidence: [
        entry('決済記録', 'PRIMARY', 'G11'),
        entry('Historical / Forecast Financials・実績・予測財務', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION')
      ],
      safety: []
    }
  };
  const raw = baseLanes(lensPlan);
  const task = {
    action: 'compare',
    source_span: { text: '投資案件Aと投資案件Bを比較するための判断材料が欲しい。' },
    target: '投資案件Aと投資案件B',
    objective: '投資案件の比較判断材料を整理する'
  };

  const scoped = scopeFiveStageDecisionMaterial(raw, task, { records: [] });

  assert.ok(scoped.fact.fact_requirements.some((item) => item.item.includes('投資目的')));
  assert.ok(scoped.risk.risks.some((item) => item.impact.includes('Downside')));
  assert.ok(scoped.multi.perspectives.some((item) => String(item.focus).includes('投資者')));
  assert.ok(scoped.inquiry.inquiry_lens.some((item) => item.includes('資本Cost')));
  assert.ok(scoped.compare.dimensions.some((item) => item.includes('Expected Return')));
  assert.ok(scoped.compare.dimensions.some((item) => item.includes('Capital Cost')));
  assert.ok(scoped.inquiry.evidence_need.some((item) => item.includes('実績・予測財務')));

  assert.ok(!scoped.fact.fact_requirements.some((item) => item.item.includes('返金・失効')));
  assert.ok(!scoped.risk.risks.some((item) => item.impact.includes('返金負債')));
  assert.ok(!scoped.multi.perspectives.some((item) => String(item.focus).includes('決済事業者')));
  assert.ok(!scoped.inquiry.inquiry_lens.some((item) => item.includes('返金・失効')));
  assert.ok(!scoped.compare.dimensions.some((item) => item.includes('返金対応')));
  assert.ok(!scoped.inquiry.evidence_need.some((item) => item.includes('決済記録')));
});

test('source-relevant narrow primary material survives even when breadth exists', () => {
  const lensPlan = {
    channels: {
      fact: [entry('返金・失効条件', 'PRIMARY', 'G11'), entry('Time Horizon・期間', 'PRIMARY_BREADTH', 'G11-BREADTH-FINANCIAL-DECISION')],
      risk: [],
      multi: [],
      inquiry: [entry('返金・失効条件は何か', 'PRIMARY', 'G11')],
      compare: [entry('返金対応', 'PRIMARY', 'G11')],
      evidence: [entry('決済記録', 'PRIMARY', 'G11')],
      safety: []
    }
  };
  const raw = baseLanes(lensPlan);
  const task = {
    action: 'verify',
    source_span: { text: '返金条件と失効条件を確認し、決済記録を照合する。' },
    target: '返金条件と失効条件',
    objective: '返金と失効の条件を確認する'
  };

  const scoped = scopeFiveStageDecisionMaterial(raw, task, { records: [] });
  assert.ok(scoped.fact.fact_requirements.some((item) => item.item.includes('返金・失効')));
  assert.ok(scoped.inquiry.inquiry_lens.some((item) => item.includes('返金・失効')));
  assert.ok(scoped.inquiry.evidence_need.some((item) => item.includes('決済記録')));
});
