'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const multiWorker = require('../src/pillars/multi-worker');
const dialecticWorker = require('../src/pillars/dialectic-worker');
const compareWorker = require('../src/pillars/compare-worker');

function baseTask() {
  return {
    id: 'T1', target: '判断対象', objective: '判断材料を比較可能にする', action: 'analyze',
    success_criteria: ['比較可能であること'], completion_criteria: ['比較可能であること'],
    constraints: ['事実を書き換えない'], prohibitions: [], preserve: [], replace: [], depends_on: [], hard_blockers: [],
    evidence_need: { required: false }, source_span: { text: '判断材料を比較可能にする' }
  };
}

function claimRecords() {
  return [{
    task_id: 'T1', claim_id: 'C1', statement: '確認済み命題', subject: '判断対象', status: 'CONFIRMED',
    time_scope: 'UNKNOWN', jurisdiction: 'UNKNOWN', version_scope: 'UNKNOWN', evidence_bindings: [{ candidate_id: 'E1' }], undetermined_reasons: []
  }, {
    task_id: 'T1', claim_id: 'C2', statement: '未確認命題', subject: '判断対象', status: 'UNDETERMINED',
    time_scope: 'UNKNOWN', jurisdiction: 'UNKNOWN', version_scope: 'UNKNOWN', evidence_bindings: [], undetermined_reasons: ['INSUFFICIENT_EVIDENCE']
  }];
}

test('Multi independently projects perspectives from Task + Canonical Claim Records', async () => {
  const output = await multiWorker.run({ task: baseTask(), domain: {}, canonical_claim_records: claimRecords() });
  assert.equal(output.pillar, 'multi');
  assert.ok(output.perspectives.length >= 3);
  assert.ok(output.authority.does_not_own.includes('candidate_ranking'));
  assert.ok(output.authority.does_not_own.includes('decision'));
});

test('Compare owns only non-normative counts, scope and conflicts', async () => {
  const output = await compareWorker.run({ task: baseTask(), domain: {}, canonical_claim_records: claimRecords() });
  assert.deepEqual(output.counts, { CONFIRMED: 1, UNDETERMINED: 1 });
  assert.equal(output.scope_matrix.length, 2);
  for (const forbidden of ['score', 'candidate_ranking', 'selected_candidate', 'rejected_candidates', 'decision', 'recommendation', 'verdict']) {
    assert.equal(Object.hasOwn(output, forbidden), false, forbidden);
  }
});

test('Perspective Expansion happens after lanes and never owns ranking/selection/decision', async () => {
  const task = baseTask();
  const multi = await multiWorker.run({ task, domain: {}, canonical_claim_records: claimRecords() });
  const output = await dialecticWorker.run({
    task, facts: { confirmed: [claimRecords()[0]], undetermined: [claimRecords()[1]], unconfirmed: [claimRecords()[1]] },
    risks: { risks: [], risk_count: 0 }, inquiry: { missing_fields: [], human_reading: {} }, multi, domain: {}, human: {}
  });
  assert.equal(output.engine, 'Astera Deterministic Perspective Expansion');
  assert.ok(output.candidates.some((candidate) => candidate.id === 'opposition'));
  assert.ok(output.candidates.some((candidate) => candidate.id === 'bad_hand'));
  assert.ok(output.authority.does_not_own.includes('score'));
  assert.ok(output.authority.does_not_own.includes('decision'));
  assert.equal(output.candidates.some((candidate) => Object.hasOwn(candidate, 'score')), false);
});
