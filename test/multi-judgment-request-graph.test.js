'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { expandMultiJudgmentRequest } = require('../src/runtime/multi-judgment-request-planner');

function collapsedPrepared(question) {
  const firstEnd = question.indexOf('。') + 1;
  return {
    original_question: question,
    normalized_question: question,
    instruction_understanding: { overall_status: 'PARTIAL', blocked_reasons: [] },
    analysis_task_packet: {
      user_goal: '確認する',
      tasks: [{
        id: 'T01',
        order: 1,
        action: 'verify',
        target: '現在仕様',
        purpose: '現在仕様を確認する',
        source_span: { start: 0, end: firstEnd, text: question.slice(0, firstEnd) },
        raw_text: question.slice(0, firstEnd),
        premises: ['FIRST_REQUEST_ONLY_MATERIAL'],
        constraints: [], prohibitions: [], preserve: [], replace: [], verification: [], completion_criteria: [], success_criteria: [],
        conditions: [], exceptions: [], deadlines: [], priority_records: [], deliverables: [], unresolved: [], hard_blockers: [], depends_on: [], branches: []
      }],
      dependencies: [], execution_waves: [['T01']], branches: [], branch_groups: [],
      constraints: [], prohibitions: [], preserve: [], deadlines: [], conditions: [], exceptions: [], unresolved: [],
      task_graph_validation: { valid: true, cycle: [], dependency_count: 0, wave_count: 1, branch_count: 0 }
    }
  };
}

test('explicit request sequence produces deterministic dependency waves and does not copy first-task material to later requests', () => {
  const question = '現在仕様を確認してくれ。その後、影響範囲を整理してくれ。最後に修正案を検討してくれ。';
  const out = expandMultiJudgmentRequest(collapsedPrepared(question), { question });
  const packet = out.analysis_task_packet;
  assert.equal(packet.tasks.length, 3);
  assert.deepEqual(packet.dependencies.map((edge) => [edge.from, edge.to]), [['T01','T02'],['T02','T03']]);
  assert.deepEqual(packet.execution_waves, [['T01'],['T02'],['T03']]);
  assert.deepEqual(packet.tasks.map((task) => task.depends_on), [[],['T01'],['T02']]);
  assert.ok(packet.tasks.every((task) => !(task.premises || []).includes('FIRST_REQUEST_ONLY_MATERIAL')));
  assert.equal(packet.task_graph_validation.dependency_count, 2);
  assert.equal(packet.task_graph_validation.wave_count, 3);
});

test('independent requests share one wave instead of being serialized by source order', () => {
  const question = '表示情報を見直してくれ。設定OFF時の案内を追加してくれ。画像投稿後の不要線をなくせ。';
  const out = expandMultiJudgmentRequest(collapsedPrepared(question), { question });
  const packet = out.analysis_task_packet;
  assert.equal(packet.tasks.length, 3);
  assert.deepEqual(packet.dependencies, []);
  assert.deepEqual(packet.execution_waves, [['T01','T02','T03']]);
});
