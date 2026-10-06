'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCaseModel,
  expandMultiJudgmentRequest
} = require('../src/runtime/multi-judgment-request-planner');

function collapsedPrepared(question) {
  return {
    original_question: question,
    normalized_question: question,
    instruction_understanding: { overall_status: 'COMPLETE', execution_allowed: true, blocked_reasons: [] },
    analysis_task_packet: {
      tasks: [{
        id: 'T01', order: 1, action: 'analyze', target: '入力全体', purpose: '入力全体を検討する',
        raw_text: question, source_span: { start: 0, end: question.length, text: question },
        depends_on: [], conditions: [], constraints: [], prohibitions: [], preserve: [], unresolved: [],
        evidence_need: { required: false }
      }],
      dependencies: [], execution_waves: [['T01']], branches: [], branch_groups: [],
      constraints: [], prohibitions: [], preserve: [], deadlines: [], conditions: [], exceptions: [], unresolved: [],
      task_graph_validation: { valid: true, cycle: [], dependency_count: 0, wave_count: 1, branch_count: 0 }
    }
  };
}

test('three judgment requests in one Japanese sentence remain three source-backed request units', () => {
  const question = '表示情報を徹底的に見直し、設定OFF時の案内を追加し、画像投稿後の不要線を消して。';
  const model = buildCaseModel(question);
  assert.equal(model.request_count, 3, JSON.stringify(model, null, 2));
  assert.deepEqual(model.judgment_requests.map((r) => r.action), ['improve', 'implement', 'remove']);
  assert.match(model.judgment_requests[0].request_text, /表示情報/);
  assert.match(model.judgment_requests[1].request_text, /設定OFF/);
  assert.match(model.judgment_requests[2].request_text, /不要線/);
  assert.ok(model.judgment_requests.every((r) => Number.isInteger(r.source_span.start) && r.source_span.end > r.source_span.start));
});

test('comparison dimensions separated by Japanese commas do not become phantom judgment requests', () => {
  const question = 'A案とB案を作業時間、法務リスク、利用者理解で比較して。';
  const model = buildCaseModel(question);
  assert.equal(model.request_count, 1, JSON.stringify(model, null, 2));
  assert.equal(model.judgment_requests[0].action, 'compare');
});

test('request-local OFF condition stays on its request and does not leak into unrelated requests', () => {
  const question = '表示情報を見直して。オプションがOFFなら＋を押した時にオンにしてくださいと表示して。画像投稿後の不要線を消して。';
  const out = expandMultiJudgmentRequest(collapsedPrepared(question), { question });
  const packet = out.analysis_task_packet;
  const model = packet.case_model;
  assert.equal(model.request_count, 3, JSON.stringify(model, null, 2));
  assert.equal(model.global_context.conditions.length, 0, JSON.stringify(model.global_context));
  assert.equal(model.judgment_requests[0].local_context.conditions.length, 0);
  assert.ok(model.judgment_requests[1].local_context.conditions.some((value) => /OFF/.test(value)));
  assert.equal(model.judgment_requests[2].local_context.conditions.length, 0);
  const t1 = packet.tasks.find((task) => task.request_id === 'R01');
  const t2 = packet.tasks.find((task) => task.request_id === 'R02');
  const t3 = packet.tasks.find((task) => task.request_id === 'R03');
  assert.ok(t1 && t2 && t3, JSON.stringify(packet.tasks, null, 2));
  assert.equal((t1.conditions || []).some((value) => /OFF/.test(value)), false);
  assert.equal((t3.conditions || []).some((value) => /OFF/.test(value)), false);
  assert.equal((t2.conditions || []).some((value) => /OFF/.test(value)), true);
});
