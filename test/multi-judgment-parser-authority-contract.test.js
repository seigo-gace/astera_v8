'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { expandMultiJudgmentRequest } = require('../src/runtime/multi-judgment-request-planner');

function spanOf(text, fragment, from = 0) {
  const start = text.indexOf(fragment, from);
  assert.ok(start >= 0, `missing fragment: ${fragment}`);
  return { start, end: start + fragment.length, text: fragment };
}

function packet(tasks, extras = {}) {
  return {
    tasks,
    dependencies: extras.dependencies || [],
    execution_waves: extras.execution_waves || [tasks.map((task) => task.id)],
    branches: [], branch_groups: [],
    constraints: [], prohibitions: [], preserve: [], deadlines: [], conditions: [], exceptions: [], unresolved: [],
    task_graph_validation: { valid: true, cycle: [], dependency_count: (extras.dependencies || []).length, wave_count: (extras.execution_waves || [tasks]).length, branch_count: 0 },
    ...(extras.analysis_intent ? { analysis_intent: extras.analysis_intent } : {})
  };
}

test('parser-resolved top-level tasks remain distinct even when raw wording has no request-cue template', () => {
  const question = '通知設定は簡潔な導線へ。監査ログは保存期間を90日に。API契約は後方互換を維持。';
  const t1 = '通知設定は簡潔な導線へ。';
  const t2 = '監査ログは保存期間を90日に。';
  const t3 = 'API契約は後方互換を維持。';
  const prepared = {
    original_question: question,
    normalized_question: question,
    instruction_understanding: { overall_status: 'COMPLETE', execution_allowed: true, blocked_reasons: [] },
    analysis_task_packet: packet([
      { id: 'T01', order: 1, action: 'improve', target: '通知設定', purpose: '通知設定を簡潔な導線にする', raw_text: t1, source_span: spanOf(question, t1), depends_on: [], evidence_need: { required: false } },
      { id: 'T02', order: 2, action: 'implement', target: '監査ログの保存期間', purpose: '監査ログの保存期間を90日にする', raw_text: t2, source_span: spanOf(question, t2), depends_on: ['T01'], evidence_need: { required: false } },
      { id: 'T03', order: 3, action: 'preserve', target: 'API契約', purpose: 'API契約の後方互換を維持する', raw_text: t3, source_span: spanOf(question, t3), depends_on: [], evidence_need: { required: false } }
    ], {
      dependencies: [{ from: 'T01', to: 'T02', type: 'EXPLICIT_SEQUENCE' }],
      execution_waves: [['T01', 'T03'], ['T02']]
    })
  };

  const out = expandMultiJudgmentRequest(prepared, { question });
  const result = out.analysis_task_packet;
  assert.equal(result.case_model.request_count, 3, JSON.stringify(result.case_model, null, 2));
  assert.equal(result.case_model.multi_judgment, true);
  assert.equal(result.case_model.representation_mode, 'PARSER_TASKS_PRESERVED');
  assert.deepEqual(result.execution_waves, [['T01', 'T03'], ['T02']]);
  assert.deepEqual(result.dependencies, [{ from: 'T01', to: 'T02', type: 'EXPLICIT_SEQUENCE' }]);
  assert.deepEqual(result.tasks.map((task) => task.request_id), ['R01', 'R02', 'R03']);
  assert.deepEqual(result.case_model.judgment_requests.map((request) => request.parser_task_ids), [['T01'], ['T02'], ['T03']]);
  assert.match(result.case_model.judgment_requests[0].request_text, /通知設定/);
  assert.match(result.case_model.judgment_requests[1].request_text, /90日/);
  assert.match(result.case_model.judgment_requests[2].request_text, /後方互換/);
});

test('one user judgment request may own many parser execution tasks without becoming many judgment requests', () => {
  const question = '候補一覧をレビューする。\n- A: 速度10。\n- B: 速度20。\n- C: 速度30。';
  const review = '候補一覧をレビューする。';
  const a = '- A: 速度10。';
  const b = '- B: 速度20。';
  const c = '- C: 速度30。';
  const tasks = [
    { id: 'T01', order: 1, action: 'analyze', target: '候補一覧', purpose: '候補一覧をレビューする', raw_text: review, source_span: spanOf(question, review), depends_on: [], evidence_need: { required: false } },
    { id: 'T02', order: 2, action: 'verify', target: 'A', purpose: 'Aの記載を確認する', raw_text: a, source_span: spanOf(question, a), depends_on: [], evidence_need: { required: false } },
    { id: 'T03', order: 3, action: 'verify', target: 'B', purpose: 'Bの記載を確認する', raw_text: b, source_span: spanOf(question, b), depends_on: [], evidence_need: { required: false } },
    { id: 'T04', order: 4, action: 'verify', target: 'C', purpose: 'Cの記載を確認する', raw_text: c, source_span: spanOf(question, c), depends_on: [], evidence_need: { required: false } }
  ];
  const prepared = {
    original_question: question,
    normalized_question: question,
    instruction_understanding: { overall_status: 'COMPLETE', execution_allowed: true, blocked_reasons: [] },
    analysis_task_packet: packet(tasks, { analysis_intent: { mode: 'review', purpose: '候補一覧をレビューする', source: 'EXPLICIT_INSTRUCTION' } })
  };

  const out = expandMultiJudgmentRequest(prepared, { question });
  const result = out.analysis_task_packet;
  assert.equal(result.case_model.request_count, 1, JSON.stringify(result.case_model, null, 2));
  assert.equal(result.case_model.multi_judgment, false);
  assert.deepEqual(result.case_model.judgment_requests[0].parser_task_ids, ['T01', 'T02', 'T03', 'T04']);
  assert.deepEqual(result.case_model.request_task_ids, { R01: ['T01', 'T02', 'T03', 'T04'] });
  assert.match(result.user_goal, /レビュー/);
});

test('two user judgment requests can map many-to-one from parser tasks while preserving parser graph', () => {
  const question = '設定を確認して修正して。最後にログを確認して。';
  const first = '設定を確認して修正して。';
  const second = '最後にログを確認して。';
  const firstSpan = spanOf(question, first);
  const secondSpan = spanOf(question, second);
  const tasks = [
    { id: 'T01', order: 1, action: 'verify', target: '設定', purpose: '設定を確認する', raw_text: first, source_span: firstSpan, depends_on: [], evidence_need: { required: false } },
    { id: 'T02', order: 2, action: 'improve', target: '設定', purpose: '設定を修正する', raw_text: first, source_span: firstSpan, depends_on: ['T01'], evidence_need: { required: false } },
    { id: 'T03', order: 3, action: 'verify', target: 'ログ', purpose: 'ログを確認する', raw_text: second, source_span: secondSpan, depends_on: ['T02'], evidence_need: { required: false } }
  ];
  const dependencies = [
    { from: 'T01', to: 'T02', type: 'INTRA_REQUEST' },
    { from: 'T02', to: 'T03', type: 'EXPLICIT_SEQUENCE' }
  ];
  const prepared = {
    original_question: question,
    normalized_question: question,
    instruction_understanding: { overall_status: 'COMPLETE', execution_allowed: true, blocked_reasons: [] },
    analysis_task_packet: packet(tasks, { dependencies, execution_waves: [['T01'], ['T02'], ['T03']] })
  };

  const out = expandMultiJudgmentRequest(prepared, { question });
  const result = out.analysis_task_packet;
  assert.equal(result.case_model.request_count, 2, JSON.stringify(result.case_model, null, 2));
  assert.equal(result.case_model.representation_mode, 'PARSER_TASKS_PRESERVED');
  assert.deepEqual(result.case_model.request_task_ids, { R01: ['T01', 'T02'], R02: ['T03'] });
  assert.deepEqual(result.execution_waves, [['T01'], ['T02'], ['T03']]);
  assert.deepEqual(result.dependencies, dependencies);
  assert.deepEqual(result.tasks.map((task) => task.request_id), ['R01', 'R01', 'R02']);
  assert.equal(result.tasks[0].purpose, '設定を確認する');
  assert.equal(result.tasks[1].purpose, '設定を修正する');
});
