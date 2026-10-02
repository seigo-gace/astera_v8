'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMultiJudgmentMain8 } = require('../src/runtime/multi-judgment-main8-renderer');

function taskResult(id, requestId, fact, risk, missing) {
  return {
    task: { id, request_id: requestId, premises: [`${fact}の入力前提`] },
    facts: { confirmed: [{ text: fact }] },
    risks: { risks: [{ impact: risk }] },
    inquiry: { open_items: [missing], missing_questions: [], missing_fields: [] },
    multi: { perspectives: [{ focus: `${fact}の反対確認`, failure_conditions: [`${fact}の失敗条件`], conditions: [] }] },
    comparison: { comparison_candidates: [], dimensions: [] },
    evidence: { search_state: 'NOT_REQUIRED', status: 'NOT_REQUIRED' }
  };
}

function baseModel() {
  return {
    schema_version: 'astera.case-model.v1',
    multi_judgment: true,
    request_count: 2,
    judgment_requests: [
      { id: 'R01', action: 'improve', request_text: '設定を確認して修正する', source_span: { start: 0, end: 12, text: '設定を確認して修正する' }, parser_task_ids: ['T01', 'T02'] },
      { id: 'R02', action: 'verify', request_text: 'ログを確認する', source_span: { start: 13, end: 20, text: 'ログを確認する' }, parser_task_ids: ['T03'] }
    ],
    request_task_ids: { R01: ['T01', 'T02'], R02: ['T03'] },
    task_mapping: { R01: 'T01', R02: 'T03' },
    observations: [],
    global_context: { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] }
  };
}
function judgmentFor(model) {
  return {
    output_language: 'ja',
    observable_material: { case_model: model },
    order: ['01_purpose','02_premise','03_facts','04_crisis','05_opposition','06_comparison','07_evidence_status','08_reinstruction']
  };
}

test('case Main8 aggregates several execution tasks into one R## without losing another request', () => {
  const model = baseModel();
  const result = {
    task_results: [
      taskResult('T01', 'R01', '設定の現在値', '設定確認なしで変更する危険', '設定の適用範囲'),
      taskResult('T02', 'R01', '修正候補の差分', '既存挙動を壊す危険', '回帰試験結果'),
      taskResult('T03', 'R02', 'ログの保存状態', '監査情報を見落とす危険', 'ログ保持期間')
    ]
  };

  const out = renderMultiJudgmentMain8(judgmentFor(model), result);
  assert.ok(out);
  assert.equal(out.sections.length, 8);
  assert.equal((out.text.match(/\n---\n/g) || []).length, 7);
  const facts = out.sections.find((section) => section.key === '03_facts').text;
  assert.match(facts, /R01:.*設定の現在値.*修正候補の差分/u);
  assert.match(facts, /R02:.*ログの保存状態/u);
  const risks = out.sections.find((section) => section.key === '04_crisis').text;
  assert.match(risks, /R01:.*設定確認なしで変更する危険.*既存挙動を壊す危険/u);
  assert.match(risks, /R02:.*監査情報を見落とす危険/u);
  const next = out.sections.find((section) => section.key === '08_reinstruction').text;
  assert.match(next, /R01:.*設定の適用範囲.*回帰試験結果/u);
  assert.match(next, /R02:.*ログ保持期間/u);
  assert.doesNotMatch(out.text, /claim_id|SearchExecution|EvidenceQuality|INSUFFICIENT_/u);
});

test('case Main8 removes runtime IDs and internal projection labels without deleting useful remainder', () => {
  const model = baseModel();
  const hash = 'a'.repeat(64);
  const r1 = taskResult(
    'T01',
    'R01',
    `Task T01 ${hash} HAS_STATE 設定値を確認できた`,
    'T01:deliverable: 設定変更前の回帰Riskを確認する',
    'T01:completion_criteria: 既存動作の回帰試験結果'
  );
  r1.multi.perspectives = [{
    focus: 'Counter: 既存利用者への影響を確認する',
    failure_conditions: ['Alternative evidence angle: 別経路の設定状態も確認する'],
    conditions: []
  }];
  const result = {
    task_results: [
      r1,
      taskResult('T02', 'R01', '修正後の挙動', '副作用確認が必要', '完了条件の確認'),
      taskResult('T03', 'R02', 'ログの保存状態', '監査欠落Risk', '保持期間の確認')
    ]
  };

  const out = renderMultiJudgmentMain8(judgmentFor(model), result);
  assert.match(out.text, /設定値を確認できた/u);
  assert.match(out.text, /設定変更前の回帰Riskを確認する/u);
  assert.match(out.text, /既存動作の回帰試験結果/u);
  assert.match(out.text, /既存利用者への影響を確認する/u);
  assert.match(out.text, /別経路の設定状態も確認する/u);
  assert.doesNotMatch(out.text, /[0-9a-f]{64}|HAS_STATE|Task\s+T\d+|T\d+:(?:deliverable|completion_criteria|success_criteria)|\bCounter\b|Alternative evidence angle/u);
});
