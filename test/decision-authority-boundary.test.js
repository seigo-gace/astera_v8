'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const multiWorker = require('../src/pillars/multi-worker');
const dialecticWorker = require('../src/pillars/dialectic-worker');
const compareWorker = require('../src/pillars/compare-worker');

function baseTask() {
  return {
    id: 'T1',
    target: '判断対象',
    objective: '判断材料を比較可能にする',
    action: 'analyze',
    success_criteria: ['比較可能であること'],
    constraints: ['事実を書き換えない'],
    prohibitions: [],
    preserve: [],
    replace: [],
    depends_on: [],
    hard_blockers: [],
    evidence_need: { required: false },
    source_span: { text: '判断材料を比較可能にする' }
  };
}

test('Multi owns perspectives and trade-offs, not ranking or selection', async () => {
  const output = await multiWorker.run({
    question: '判断材料を比較可能にする',
    facts: { confirmed: [{ text: '確認済み' }], unconfirmed: [] },
    risks: { risk_count: 0, level: 'low', safety_gates: [] },
    inquiry: { missing_questions: [], problem_health: { healthy: true } },
    domain: {},
    task: baseTask()
  });

  assert.equal(output.pillar, 'multi');
  assert.ok(Array.isArray(output.perspectives) && output.perspectives.length >= 3);
  assert.ok(Array.isArray(output.trade_off_map));
  assert.equal(Object.hasOwn(output, 'recommended'), false);
  assert.equal(Object.hasOwn(output, 'recommendation_rule_ids'), false);
  assert.equal(Object.hasOwn(output, 'selected_perspective'), false);
  assert.deepEqual(output.authority.does_not_own, ['candidate_ranking', 'selected_candidate', 'decision']);
});

test('Dialectic generates candidates and raw metrics without ranking or selected authority', async () => {
  const multi = await multiWorker.run({
    question: '判断材料を比較可能にする',
    facts: { confirmed: [{ text: '確認済み' }], unconfirmed: [] },
    risks: { risk_count: 1, level: 'low', safety_gates: [] },
    inquiry: { missing_questions: [], problem_health: { healthy: true } },
    domain: {},
    task: baseTask()
  });

  const output = await dialecticWorker.run({
    question: '判断材料を比較可能にする',
    facts: { confirmed: [{ text: '確認済み' }], unconfirmed: [] },
    risks: { risk_count: 1, level: 'low', safety_gates: [] },
    inquiry: { missing_questions: [], problem_health: { healthy: true } },
    multi,
    human: {},
    mood: {},
    domain: {},
    task: baseTask()
  });

  assert.equal(output.pillar, 'dialectic');
  assert.equal(output.candidates.length, 5);
  assert.deepEqual(output.candidates.map((candidate) => candidate.id), ['mainline', 'opposition', 'third_way', 'human_fit', 'bad_hand']);
  assert.equal(Object.hasOwn(output, 'selected'), false);
  assert.equal(Object.hasOwn(output, 'candidate_ranking'), false);
  for (const candidate of output.candidates) {
    assert.equal(Object.hasOwn(candidate, 'score'), false);
    assert.equal(Object.hasOwn(candidate, 'answer_line_distance'), false);
    assert.ok(candidate.metrics && typeof candidate.metrics === 'object');
  }
});

test('Compare is the unique score, ranking and selected-candidate owner', async () => {
  const task = baseTask();
  const dialectic = {
    candidates: [
      { id: 'low', label: 'Low', angle: 'low', thesis: 'low', metrics: { objectiveFit: 40, evidenceFit: 40, riskControl: 40, constraintFit: 40, reversibility: 40 } },
      { id: 'high', label: 'High', angle: 'high', thesis: 'high', metrics: { objectiveFit: 95, evidenceFit: 95, riskControl: 95, constraintFit: 95, reversibility: 95 } },
      { id: 'bad_hand', label: 'Bad', angle: 'bad_hand', thesis: 'bad', metrics: { objectiveFit: 100, evidenceFit: 100, riskControl: 100, constraintFit: 100, reversibility: 100 } }
    ]
  };

  const output = await compareWorker.run({
    question: task.objective,
    facts: { confirmed: [{ text: '確認済み' }], unconfirmed: [] },
    risks: { risk_count: 0, level: 'low' },
    inquiry: { missing_fields: [], problem_health: { healthy: true } },
    multi: { recommended: 'legacy-value-must-not-control-compare' },
    dialectic,
    domain: {},
    task
  });

  assert.equal(output.pillar, 'compare');
  assert.equal(output.selected_candidate.id, 'high');
  assert.equal(output.candidate_ranking[0].id, 'bad_hand');
  assert.equal(output.candidate_ranking[1].id, 'high');
  assert.equal(output.verdict.angle, 'high');
});
