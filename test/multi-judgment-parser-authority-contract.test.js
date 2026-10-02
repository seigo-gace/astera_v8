'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { expandMultiJudgmentRequest } = require('../src/runtime/multi-judgment-request-planner');

function spanOf(text, fragment) {
  const start = text.indexOf(fragment);
  assert.ok(start >= 0, `missing fragment: ${fragment}`);
  return { start, end: start + fragment.length, text: fragment };
}

test('parser-resolved tasks remain distinct even when raw wording has no request-cue template', () => {
  const question = '通知設定は簡潔な導線へ。監査ログは保存期間を90日に。API契約は後方互換を維持。';
  const t1 = '通知設定は簡潔な導線へ。';
  const t2 = '監査ログは保存期間を90日に。';
  const t3 = 'API契約は後方互換を維持。';
  const prepared = {
    original_question: question,
    normalized_question: question,
    instruction_understanding: { overall_status: 'COMPLETE', execution_allowed: true, blocked_reasons: [] },
    analysis_task_packet: {
      tasks: [
        { id: 'T01', order: 1, action: 'improve', target: '通知設定', purpose: '通知設定を簡潔な導線にする', raw_text: t1, source_span: spanOf(question, t1), depends_on: [], evidence_need: { required: false } },
        { id: 'T02', order: 2, action: 'implement', target: '監査ログの保存期間', purpose: '監査ログの保存期間を90日にする', raw_text: t2, source_span: spanOf(question, t2), depends_on: ['T01'], evidence_need: { required: false } },
        { id: 'T03', order: 3, action: 'preserve', target: 'API契約', purpose: 'API契約の後方互換を維持する', raw_text: t3, source_span: spanOf(question, t3), depends_on: [], evidence_need: { required: false } }
      ],
      dependencies: [{ from: 'T01', to: 'T02', type: 'EXPLICIT_SEQUENCE' }],
      execution_waves: [['T01', 'T03'], ['T02']],
      branches: [],
      branch_groups: [],
      constraints: [], prohibitions: [], preserve: [], deadlines: [], conditions: [], exceptions: [], unresolved: [],
      task_graph_validation: { valid: true, cycle: [], dependency_count: 1, wave_count: 2, branch_count: 0 }
    }
  };

  const out = expandMultiJudgmentRequest(prepared, { question });
  const packet = out.analysis_task_packet;
  assert.equal(packet.case_model.request_count, 3, JSON.stringify(packet.case_model, null, 2));
  assert.equal(packet.case_model.multi_judgment, true);
  assert.equal(packet.case_model.representation_mode, 'PARSER_TASKS_PRESERVED');
  assert.deepEqual(packet.execution_waves, [['T01', 'T03'], ['T02']]);
  assert.deepEqual(packet.dependencies, [{ from: 'T01', to: 'T02', type: 'EXPLICIT_SEQUENCE' }]);
  assert.deepEqual(packet.tasks.map((task) => task.request_id), ['R01', 'R02', 'R03']);
  assert.deepEqual(packet.case_model.judgment_requests.map((request) => request.parser_task_id), ['T01', 'T02', 'T03']);
  assert.match(packet.case_model.judgment_requests[0].request_text, /通知設定/);
  assert.match(packet.case_model.judgment_requests[1].request_text, /90日/);
  assert.match(packet.case_model.judgment_requests[2].request_text, /後方互換/);
});
