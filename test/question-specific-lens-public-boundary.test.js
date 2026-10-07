'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeFiveStageDecisionMaterial } = require('../src/runtime/five-stage-public-boundary');
const { buildPublicFiveStageAggregate } = require('../src/runtime/five-stage-public-aggregate');
const { normalizeMultiJudgmentPublicMaterial } = require('../src/runtime/multi-judgment-public-material-normalizer');

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


test('raw Perspective Expansion cannot bypass scoped five-stage material into public Main8 aggregate', () => {
  const rawAggregate = {
    perspectiveExpansion: {
      engine: 'Astera Deterministic Perspective Expansion',
      perspectives: [{
        id: 'opposition',
        focus: ['Data Loss', '返金負債', '単一障害点']
      }],
      per_task: { T01: { perspectives: [{ focus: ['Data Loss'] }] } }
    }
  };
  const taskResults = [{
    task: { id: 'T01' },
    lanes: {
      fact: { confirmed: [], unconfirmed: [] },
      risk: { risks: [] },
      multi: { perspectives: [{ id: 'critical', focus: ['source-backed unresolved'], source: 'CANONICAL_CLAIM_CONFIRMATION' }], trade_off_map: [] },
      inquiry: { missing_fields: [] },
      compare: { dimensions: [], comparison_candidates: [], candidate_materials: [], trade_off_differences: [], scope_booleans: [], supported_scope: [], unsupported_scope: [], contradiction_map: [], condition_differences: {} }
    },
    public_lanes: {
      fact: { confirmed: [], unconfirmed: [] },
      risk: { risks: [] },
      multi: { perspectives: [{ id: 'critical', focus: ['source-backed unresolved'], source: 'CANONICAL_CLAIM_CONFIRMATION' }], trade_off_map: [] },
      inquiry: { missing_fields: [] },
      compare: { dimensions: [], comparison_candidates: [], candidate_materials: [], trade_off_differences: [], scope_booleans: [], supported_scope: [], unsupported_scope: [], contradiction_map: [], condition_differences: {} }
    }
  }];

  const publicAggregate = buildPublicFiveStageAggregate(rawAggregate, taskResults);
  assert.deepEqual(publicAggregate.perspectiveExpansion.perspectives, []);
  assert.deepEqual(publicAggregate.perspectiveExpansion.per_task, {});
  assert.equal(publicAggregate.perspectiveExpansion.public_projection_state, 'SUPPRESSED_NON_FIVE_STAGE_SEMANTIC_PATH');
  assert.deepEqual(publicAggregate.multi.perspectives.map((item) => item.focus), [['source-backed unresolved']]);
  assert.doesNotMatch(JSON.stringify(publicAggregate), /Data Loss|返金負債|単一障害点/);
});


test('strongly evidenced secondary domain keeps its specialist material without literal lens-word matching', () => {
  const lensPlan = {
    channels: {
      fact: [],
      risk: [],
      multi: [{
        value: 'Designer',
        sources: [{
          tier: 'SECONDARY',
          lens_id: 'G25',
          lens_name: 'engineering',
          score: 18,
          matched_signals: ['機械', '品質工学']
        }]
      }],
      inquiry: [],
      compare: [],
      evidence: [],
      safety: []
    }
  };
  const raw = baseLanes(lensPlan);
  const task = {
    source_span: { text: '機械製造の材料強度と品質工学を検証する。' },
    target: '機械製造の材料強度と品質工学',
    objective: '検証する'
  };
  const scoped = scopeFiveStageDecisionMaterial(raw, task, { records: [] });
  assert.deepEqual(scoped.multi.perspectives.map((item) => item.focus), ['Designer']);
});

test('multi-judgment public normalizer cannot reintroduce catalog Lens material rejected upstream', () => {
  const r01 = 'ユーザー向けエラーを整理し、内部API名やstack traceは見せず、利用回数上限、クレジット不足、購入失敗、権限不足だけ対処可能な文章にする。';
  const judgment = {
    output_language: 'ja',
    case_model: {
      multi_judgment: true,
      request_count: 2,
      global_context: { prohibitions: [], constraints: [], preserve: [] },
      observations: [],
      judgment_requests: [
        { id: 'R01', request_text: r01, action: 'analyze', source_span: { start: 0, end: r01.length, text: r01 }, local_context: {} },
        { id: 'R02', request_text: '別件の表示確認をする。', action: 'verify', source_span: { start: r01.length + 1, end: r01.length + 12, text: '別件の表示確認をする。' }, local_context: {} }
      ]
    }
  };
  const sections = [
    '01 本当の目的\n- 今回の入力には2件の判断要求がある。',
    '02 前提不足\n- 条件を保持する。',
    '03 事実確認\n- 入力材料を保持する。',
    '04 危機察知\n- 危険材料も判断要求ごとに分ける:\n  - R01: 未確定Claimを確定事実として扱う危険 / 資金流動性 / 会計誤分類 / Data Loss / 単一障害点\n  - R02: 未確定Claimを確定事実として扱う危険',
    '05 反対視点\n- 各判断要求について反証・失敗側の材料を別々に保持する:\n  - R01: request\n    - 反証・失敗条件: 未確定Claimを確定事実として扱う危険 / 返金負債 / Downtime / 通信断\n  - R02: request',
    '06 比較案\n- 判断要求ごとに分ける:\n  - R01 [検討・整理]: current\n    - 追加で必要な材料: 返金・失効条件は何か / 互換条件は何か / TopologyとProtocolは何か\n  - R02 [検証]: current',
    '07 根拠成立状態\n- 根拠成立状態も判断要求ごとに分離する\n  - R01: 未確認\n  - R02: 未確認',
    '08 主役AI／利用者への再指示\n  - R01: 次を確認\n  - R02: 次を確認'
  ];
  const out = normalizeMultiJudgmentPublicMaterial({ text: sections.join('\n---\n'), sections: sections.map((text) => ({ text })) }, judgment);
  const r01Risk = out.text.match(/  - R01:.*$/mu)?.[0] || '';
  assert.doesNotMatch(r01Risk, /資金流動性|会計誤分類|Data Loss|単一障害点/u);
  assert.doesNotMatch(out.text, /返金負債|Downtime|通信断|返金・失効条件は何か|互換条件は何か|TopologyとProtocolは何か/u);
});
