'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeFiveStageDecisionMaterial } = require('../src/runtime/five-stage-public-boundary');

function lanes() {
  return {
    lens_plan: { id: 'software' },
    fact: { lane: 'fact', confirmed: [], unconfirmed: [] },
    risk: {
      lane: 'risk',
      risks: [
        { rule_id: 'R1', key: 'data-loss', impact: 'Data Loss', failure_condition: 'Data Loss unchecked', weight: 20, source: 'LENS_PLAN' },
        { rule_id: 'R2', key: 'downtime', impact: 'Downtime', failure_condition: 'Downtime unchecked', weight: 20, source: 'LENS_PLAN' },
        { rule_id: 'R3', key: 'source-backed', impact: '未確定Claimを確定事実として扱う危険', failure_condition: 'claim unresolved', weight: 22, source: 'CANONICAL_CLAIM_CONFIRMATION' }
      ],
      failure_conditions: ['Data Loss unchecked', 'Downtime unchecked', 'claim unresolved'],
      rule_ids: ['R1', 'R2', 'R3'],
      risk_count: 3,
      highest: null,
      level: 'medium'
    },
    multi: {
      lane: 'multi',
      perspectives: [
        { id: 'defensive', class: 'DEFENSIVE', focus: ['Data Loss', 'Downtime'], source: 'CANONICAL_CLAIMS_PLUS_LENS_PLAN' },
        { id: 'domain:1', class: 'DOMAIN', focus: '現行維持', source: 'LENS_PLAN' },
        { id: 'critical', class: 'CRITICAL', focus: ['claim unresolved'], source: 'CANONICAL_CLAIM_CONFIRMATION' }
      ],
      trade_off_map: [
        { id: 'defensive', source: 'CANONICAL_CLAIMS_PLUS_LENS_PLAN' },
        { id: 'domain:1', source: 'LENS_PLAN' },
        { id: 'critical', source: 'CANONICAL_CLAIM_CONFIRMATION' }
      ]
    },
    inquiry: { lane: 'inquiry', missing_fields: [], missing_questions: [] },
    compare: {
      lane: 'compare',
      dimensions: ['Build vs Buy', '保守性'],
      comparison_candidates: [],
      candidate_materials: [],
      trade_off_differences: [
        { dimension: 'Build vs Buy' },
        { dimension: '保守性' }
      ]
    }
  };
}

test('M6 leak is stopped inside five-stage material before Main8', () => {
  const task = {
    id: 'T01',
    action: 'verify',
    raw_text: '2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。',
    source_span: { text: '2026年10月1日時点のNode.js 22の公式サポート状況を、公式根拠を確認して判断材料として整理してください。' },
    prohibitions: ['最終判断や推奨はせず']
  };
  const scoped = scopeFiveStageDecisionMaterial(lanes(), task, { records: [] });
  const text = JSON.stringify(scoped);

  assert.doesNotMatch(text, /Data Loss|Downtime|現行維持|Build vs Buy|保守性/);
  assert.match(text, /未確定Claimを確定事実として扱う危険/);
});

test('source-backed generic-looking risk is retained by the five-stage boundary', () => {
  const task = {
    id: 'T01',
    action: 'verify',
    raw_text: 'Downtimeの発生条件を公式根拠で検証してください。',
    source_span: { text: 'Downtimeの発生条件を公式根拠で検証してください。' }
  };
  const scoped = scopeFiveStageDecisionMaterial(lanes(), task, { records: [] });
  const riskText = JSON.stringify(scoped.risk);

  assert.match(riskText, /Downtime/);
  assert.doesNotMatch(riskText, /Data Loss/);
});