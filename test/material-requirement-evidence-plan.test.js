'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { materialEvidencePlan, requestGraphForTask } = require('../src/runtime/material-requirement-evidence-plan');
const { compileQueryPlan } = require('../src/evidence-search/core/query-plan-compiler');

const base = { schema_version: 'astera.canonical-task-plan.v2', task_id: 'T01', claims: [], policy_by_claim_id: {}, search_plan: {
  schema_version: 'astera.upstream-search-plan.v2', planning_authority: 'ASTERA_DECISION_MATERIALS_V4',
  query_template_version: 'v4.0.0', queries: [], planned_query_roles: []
}};
const task = { id: 'T01', request_id: 'R01', target: '予約変更システムの移行', evidence_need: { required: true } };
const graph = { requests: [
  { owner_request_id: 'R01', nodes: [
    { slot_id: 'R01:MR01', material_kind: 'DECISION_CRITERION', question: '同時予約を防止する基準は何か', status: 'MISSING', required: true },
    { slot_id: 'R01:MR02', material_kind: 'FALSIFICATION_OR_DISQUALIFIER', question: '二重予約を生む反例', status: 'UNRESOLVED', required: true },
    { slot_id: 'R01:MR03', material_kind: 'OBSERVATION_VALIDATION', question: '遅延の報告は正しいか', status: 'UNRESOLVED', required: true },
    { slot_id: 'R01:MR04', material_kind: 'BOUNDARY_OR_PRECONDITION', question: '予約データは削除禁止', status: 'SATISFIED', required: true }
  ] },
  { owner_request_id: 'R02', nodes: [
    { slot_id: 'R02:MR01', material_kind: 'UNRESOLVED_ITEM', question: '別利用者の予算は何か', status: 'MISSING', required: true }
  ] }
] };

test('Material Graph requirements and additive Lens are included after routing, by Request only', () => {
  const domain = { primary: { id: 'G25', name: 'Engineering' } };
  const plan = materialEvidencePlan(task, graph, domain, base);
  assert.equal(requestGraphForTask(task, graph).owner_request_id, 'R01');
  const ids = plan.material_evidence_plan.planned_slot_ids;
  assert.ok(ids.includes('R01:MR01') && ids.includes('R01:MR02') && ids.includes('R01:MR03'));
  assert.ok(!ids.includes('R01:MR04'));
  assert.ok(ids.every(id => !id.startsWith('R02:')));
  assert.ok(ids.some(id => id.includes('LENS:risk:')), 'Lens risk requirements must be searched');
  assert.ok(ids.some(id => id.includes('LENS:compare:')), 'Lens comparison requirements must be searched');
  assert.ok(ids.some(id => id.includes('LENS:evidence:')) || ids.some(id => id.includes('LENS:fact:')));
  for (const id of ids) {
    const queries = plan.search_plan.queries.filter(q => q.requirement_slot_id === id);
    assert.deepEqual(queries.map(q => q.role), ['OFFICIAL', 'COUNTER']);
    assert.ok(queries.every(q => q.claim_id.startsWith('material-requirement:')));
    assert.ok(queries.every(q => q.owner_request_id === 'R01'));
  }
  const request = {
    question: task.target,
    upstream_search_plan: plan.search_plan,
    search: { free_projection: true, free_current: true, free_general_web: true },
    paid_search: { enabled: false },
    domain_lens: { id: 'G25' }
  };
  const compiled = compileQueryPlan(request);
  assert.equal(compiled.planning_authority, 'UPSTREAM_CANONICAL');
  assert.equal(compiled.primary_query_set.length, plan.search_plan.queries.length);
  assert.equal(plan.material_evidence_plan.coverage_complete, true);
});

test('No cross-Request borrowing when Request ID is absent or mismatched', () => {
  const wrong = { ...task, request_id: 'R99' };
  assert.equal(requestGraphForTask(wrong, graph), null);
  const plan = materialEvidencePlan(wrong, graph, {}, base);
  assert.deepEqual(plan.material_evidence_plan.planned_slot_ids, []);
  assert.deepEqual(plan.search_plan.queries, []);
});

test('No network search for local-only Request solely because structural requirements are unresolved', () => {
  const local = { ...task, evidence_need: { required: false } };
  const plan = materialEvidencePlan(local, graph, { primary: { id: 'G25' } }, base);
  assert.equal(plan.material_evidence_plan.search_authorized, false);
  assert.equal(plan.search_plan.queries.length, 0);
  assert.ok(plan.material_evidence_plan.unplanned_slot_ids.includes('R01:MR01'));
});

test('Query plan capacity is explicit and never silently drops a material requirement', () => {
  const many = { requests: [{ owner_request_id: 'R01', nodes:
    Array.from({ length: 90 }, (_, i) => ({
      slot_id: 'R01:MR' + String(i).padStart(3, '0'),
      material_kind: 'SUBQUESTION_ANSWER',
      question: '必要情報' + i,
      status: 'UNRESOLVED', required: true
    }))
  }] };
  const plan = materialEvidencePlan(task, many, {}, base);
  assert.equal(plan.search_plan.queries.length, 128);
  assert.equal(plan.material_evidence_plan.coverage_complete, false);
  assert.equal(plan.material_evidence_plan.planned_slot_ids.length, 64);
  assert.equal(plan.material_evidence_plan.unplanned_slot_ids.length, 26);
});
