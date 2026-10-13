'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileLensPlan } = require('../src/lens-plan');
const { scopeFiveStageDecisionMaterial } = require('../src/runtime/five-stage-public-boundary');

function financeDomain() {
  const primary = {
    id: 'G11',
    name: 'Finance',
    matched_signals: ['財務'],
    fact_lens: ['取引構造', 'Cash Flow', '会計処理時点'],
    risk_lens: ['資金流動性', '会計誤分類', '返金負債', '未使用残高管理'],
    multi_lens: ['財務責任者', '監査・専門家'],
    inquiry_lens: ['法域と会計基準は何か', '返金・失効条件は何か'],
    compare_lens: ['前受管理', '利用時認識', '返金対応', '失効Policy'],
    evidence_to_collect: ['取引規約', 'Ledger', '会計方針']
  };
  const domain = { primary, secondary: [], overlays: [] };
  return { ...domain, lens_plan: compileLensPlan(domain) };
}

test('public five-stage copy drops unrelated Finance Lens material from a UI comparison request', () => {
  const domain = financeDomain();
  const task = {
    id: 'T01',
    action: 'compare',
    source_span: { text: 'ユーザー向けエラー表示をA案とB案で比較し、利用者理解と読みやすさを整理する。' },
    target: 'ユーザー向けエラー表示',
    objective: 'A案とB案を利用者理解と読みやすさで比較する',
    domain,
    constraints: [],
    prohibitions: [],
    preserve: [],
    conditions: [],
    exceptions: []
  };

  const lanes = {
    fact: {
      fact_requirements: [
        { item: '取引構造', source: 'LENS_PLAN' },
        { item: '利用者理解', source: 'REQUEST_LOCAL' }
      ],
      evidence_gaps: [
        { item: 'Ledger', source: 'LENS_PLAN' },
        { item: '候補別の理解度測定', source: 'REQUEST_LOCAL' }
      ]
    },
    risk: {
      risks: [
        { rule_id: 'RISK-LENS-1', key: 'lens-risk-1', impact: '資金流動性', failure_condition: '未確認', weight: 20, source: 'LENS_PLAN' },
        { rule_id: 'RISK-LOCAL', key: 'readability', impact: '利用者がエラー内容を誤解する危険', failure_condition: '理解度未確認', weight: 25, source: 'REQUEST_LOCAL' }
      ]
    },
    multi: {
      perspectives: [
        { id: 'domain:1', source: 'LENS_PLAN', focus: '財務責任者' },
        { id: 'critical', source: 'REQUEST_LOCAL', focus: '利用者理解' }
      ],
      trade_off_map: [
        { id: 'domain:1', source: 'LENS_PLAN' },
        { id: 'critical', source: 'REQUEST_LOCAL' }
      ]
    },
    inquiry: {
      inquiry_lens: ['法域と会計基準は何か', '返金・失効条件は何か'],
      evidence_need: ['取引規約', 'Ledger'],
      missing_questions: [
        '適用する会計・税務基準と法域は？',
        '返金・失効・未使用残高の条件は？',
        '候補ごとの利用者理解を同じ条件で確認する'
      ]
    },
    compare: {
      dimensions: ['前受管理', '利用時認識', '利用者理解', '読みやすさ'],
      dimension_sources: [
        { value: '前受管理' },
        { value: '利用時認識' }
      ],
      trade_off_differences: [
        { dimension: '前受管理' },
        { dimension: '利用時認識' },
        { dimension: '利用者理解' },
        { dimension: '読みやすさ' }
      ]
    }
  };

  const scoped = scopeFiveStageDecisionMaterial(lanes, task, { records: [] });

  assert.deepEqual(scoped.fact.fact_requirements.map((entry) => entry.item), ['利用者理解']);
  assert.deepEqual(scoped.fact.evidence_gaps.map((entry) => entry.item), ['候補別の理解度測定']);
  assert.deepEqual(scoped.risk.risks.map((entry) => entry.impact), ['利用者がエラー内容を誤解する危険']);
  assert.deepEqual(scoped.multi.perspectives.map((entry) => entry.id), ['critical']);
  assert.deepEqual(scoped.inquiry.inquiry_lens, []);
  assert.deepEqual(scoped.inquiry.evidence_need, []);
  assert.deepEqual(scoped.inquiry.missing_questions, ['候補ごとの利用者理解を同じ条件で確認する']);
  assert.deepEqual(scoped.compare.dimensions, ['利用者理解', '読みやすさ']);
  assert.deepEqual(scoped.compare.trade_off_differences.map((entry) => entry.dimension), ['利用者理解', '読みやすさ']);
});
