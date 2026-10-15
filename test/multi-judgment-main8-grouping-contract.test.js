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


test('case Main8 uses scoped public five-stage lanes and never falls back to raw specialist leakage when public_lanes exists', () => {
  const model = baseModel();
  const r1 = taskResult('T01', 'R01', '設定の現在値', 'RAW_RISK_LEAK', 'RAW_MISSING_LEAK');
  r1.multi.perspectives = [{ focus: 'RAW_MULTI_LEAK', failure_conditions: ['RAW_COUNTER_LEAK'], conditions: [] }];
  r1.comparison = { comparison_candidates: ['RAW_CANDIDATE_LEAK'], dimensions: ['RAW_DIMENSION_LEAK'] };
  r1.public_lanes = {
    fact: { confirmed: [{ text: 'PUBLIC_FACT_OK' }] },
    risk: { risks: [{ impact: 'PUBLIC_RISK_OK' }] },
    multi: { perspectives: [{ focus: 'PUBLIC_MULTI_OK', failure_conditions: ['PUBLIC_COUNTER_OK'], conditions: [] }] },
    inquiry: { open_items: ['PUBLIC_MISSING_OK'], missing_questions: [], missing_fields: [], inquiry_lens: [], evidence_need: [] },
    compare: { comparison_candidates: ['PUBLIC_CANDIDATE_OK'], dimensions: ['PUBLIC_DIMENSION_OK'] }
  };
  const r2 = taskResult('T03', 'R02', 'ログの保存状態', '監査情報を見落とす危険', 'ログ保持期間');
  r2.public_lanes = {
    fact: { confirmed: [{ text: 'ログの保存状態' }] },
    risk: { risks: [{ impact: '監査情報を見落とす危険' }] },
    multi: { perspectives: [] },
    inquiry: { open_items: ['ログ保持期間'], missing_questions: [], missing_fields: [], inquiry_lens: [], evidence_need: [] },
    compare: { comparison_candidates: [], dimensions: [] }
  };

  const out = renderMultiJudgmentMain8(judgmentFor(model), { task_results: [r1, r2] });
  assert.match(out.text, /PUBLIC_FACT_OK/u);
  assert.match(out.text, /PUBLIC_RISK_OK/u);
  assert.match(out.text, /PUBLIC_MULTI_OK|PUBLIC_COUNTER_OK/u);
  assert.match(out.text, /PUBLIC_MISSING_OK/u);
  assert.doesNotMatch(out.text, /RAW_RISK_LEAK|RAW_MULTI_LEAK|RAW_COUNTER_LEAK|RAW_MISSING_LEAK|RAW_CANDIDATE_LEAK|RAW_DIMENSION_LEAK/u);
});


test('Main8 Fact section uses scoped five-stage verification targets and never promotes Task premises to confirmed facts',()=>{
  const model=baseModel();
  const result={
    task_results:[
      {
        task:{id:'T01',request_id:'R01',premises:['PREMISE_UNVERIFIED_NEVER_FACT']},
        public_lanes:{
          fact:{confirmed:[],verification_targets:[{
            text:'VERIFY_SOURCE_SCOPE_IN_FACT_LANE',
            source:'TASK_SOURCE_UNVERIFIED',status:'UNVERIFIED',request_id:'R01'
          }]},
          risk:{risks:[]},multi:{perspectives:[]},
          inquiry:{open_items:[]},compare:{comparison_candidates:[],dimensions:[]}
        }
      },
      {task:{id:'T03',request_id:'R02',premises:[]},public_lanes:{
        fact:{confirmed:[]},risk:{risks:[]},multi:{perspectives:[]},
        inquiry:{open_items:[]},compare:{comparison_candidates:[],dimensions:[]}
      }}
    ]
  };
  const resultMaterial=renderMultiJudgmentMain8(judgmentFor(model),result);
  const section=resultMaterial.sections.find(s=>s.key==='03_facts').text;
  assert.match(section,/R01[\s\S]*VERIFY_SOURCE_SCOPE_IN_FACT_LANE/);
  assert.doesNotMatch(section,/PREMISE_UNVERIFIED_NEVER_FACT/,
    'a user-origin premise cannot be included in a confirmed Fact list');
  assert.match(section,/要検証項目/);
});


test('empty five-stage lanes cannot invent operation-specific counterevidence or verification questions', () => {
  const model=baseModel();
  const rendered=renderMultiJudgmentMain8(judgmentFor(model),{task_results:[]});
  const opposition=rendered.sections.find(section=>section.key==='05_opposition').text;
  const next=rendered.sections.find(section=>section.key==='08_reinstruction').text;
  assert.match(opposition,/R01/);
  assert.match(opposition,/5段Logicに反証・失敗条件が未提示/);
  assert.match(next,/5段Logicから確認対象が供給されていない/);
  assert.doesNotMatch(opposition,/見直しで必要情報まで隠さないか|支持材料だけでなく反証・例外/);
  assert.doesNotMatch(next,/現在状態、問題が出る条件|検証対象、再現条件/);
});


test('populated five-stage counter and inquiry survive without template substitution', () => {
  const model=baseModel();
  const result={task_results:[
    taskResult('T01','R01','検証済み設定','条件付き危険','根拠資料Aを確認'),
    taskResult('T03','R02','検証済みログ','ログ保全の危険','ログ改変の反証Bを確認')
  ]};
  const rendered=renderMultiJudgmentMain8(judgmentFor(model),result);
  const opposition=rendered.sections.find(section=>section.key==='05_opposition').text;
  const next=rendered.sections.find(section=>section.key==='08_reinstruction').text;
  assert.match(opposition,/R01:[\s\S]*検証済み設定の失敗条件/);
  assert.match(opposition,/R02:[\s\S]*検証済みログの失敗条件/);
  assert.match(next,/R01:[\s\S]*根拠資料Aを確認/);
  assert.match(next,/R02:[\s\S]*ログ改変の反証Bを確認/);
  assert.doesNotMatch(next,/5段Logicから確認対象が供給されていない/);
});


test('comparison keeps user observations separate from confirmed five-stage facts', () => {
  const model=baseModel();
  model.observations=[{id:'O1',text:'利用者申告の遅延',request_id:'R01'}];
  const result={task_results:[taskResult('T01','R01','ログで確認した設定','危険','追加の計測')]};
  const rendered=renderMultiJudgmentMain8(judgmentFor(model),result);
  const comparison=rendered.sections.find(section=>section.key==='06_comparison').text;
  assert.match(comparison,/確認済みFact段階の材料: ログで確認した設定/);
  assert.match(comparison,/利用者報告の観測（外部未検証）: 利用者申告の遅延/);
  assert.doesNotMatch(comparison,/現在分かること（入力由来は未検証）/);
});
