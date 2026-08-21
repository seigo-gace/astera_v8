'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QUERY_ROLES,
  buildCanonicalTaskPlan,
  evaluateCanonicalTaskPlan,
  projectFiveLanes
} = require('../src/canonical-claim-runtime');

function taskFor(text = 'FixtureServiceは現行版で対応している。') {
  return {
    id: 'T01',
    source_span: { start: 0, end: text.length, text },
    raw_text: text,
    clause_type: 'statement',
    actionable: true,
    action: 'verify',
    target: 'FixtureService',
    objective: 'FixtureServiceの現行対応を公式根拠で検証する。',
    deliverables: [],
    premises: [],
    constraints: [],
    prohibitions: [],
    preserve: [],
    replace: [],
    conditions: [],
    exceptions: [],
    deadlines: [],
    priority: 'normal',
    order: 1,
    depends_on: [],
    parallelizable: true,
    success_criteria: [],
    verification: ['公式根拠で確認する'],
    completion_criteria: [],
    unresolved: [],
    evidence_need: { required: true, reasons: ['effect-test'], queries: [] },
    external_action: false,
    hard_blockers: []
  };
}

function candidate({ id, role, family, claim, polarity = 'support' }) {
  const text = polarity === 'support' ? claim : claim.replace('対応している', '対応していない');
  return {
    candidate_id: id,
    canonical_record_id: `${id}-record`,
    content_hash: `${id}-hash`,
    source_role: role,
    source_family_id: family,
    source_id: `${id}-source`,
    provider_id: `${id}-provider`,
    authority_id: `${family}-authority`,
    canonical_locator: { url: `https://${id}.test/evidence`, replayable: true },
    updated_at: '2026-08-20T00:00:00.000Z',
    fields: { claim: text },
    excerpt: text
  };
}

function queryExecution(queries) {
  return {
    initial: queries.map((query) => ({
      query_id: query.query_id,
      claim_id: query.claim_id,
      role: query.role,
      status: 'FOUND',
      provider_records: [{ provider_id: 'fixture', status: 'FOUND', candidate_record_ids: ['a-record', 'b-record'] }]
    })),
    reinforcement: []
  };
}

function evidencePacket(claim, queries, { conflict = false, rejected = false } = {}) {
  const finalStatus = rejected ? 'REJECTED_PROVIDER_FAILURE' : 'FINAL_VALID';
  const blocking = conflict ? ['CONFLICT_DETECTED'] : [];
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'false-confirmation-effect',
    tenant_id: 'effect-test',
    status: finalStatus,
    result_hash: 'fixture-result-hash',
    planning_authority: 'UPSTREAM_CANONICAL',
    planned_query_roles: Object.values(QUERY_ROLES),
    evidence: rejected ? [] : [
      candidate({ id: 'a', role: 'OFFICIAL', family: 'family-a', claim }),
      candidate({ id: 'b', role: 'SECONDARY', family: 'family-b', claim, polarity: conflict ? 'contradict' : 'support' })
    ],
    coverage: { discovery_scope_state: rejected ? 'PARTIAL' : 'COMPLETE_FOR_QUERY_SCOPE' },
    quality: {
      initial: {
        status: rejected ? 'REJECTED_PROVIDER_FAILURE' : 'REINFORCEMENT_REQUIRED',
        phase: 'INITIAL',
        score_bp: rejected ? 0 : 8500,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: []
      },
      reinforcement_attempt_count: rejected ? 0 : 1,
      new_corroboration_count: rejected ? 0 : 1,
      final: {
        status: finalStatus,
        phase: 'FINAL',
        score_bp: rejected ? 0 : 9700,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: blocking
      }
    },
    query_execution: rejected
      ? { initial: queries.map((query) => ({ query_id: query.query_id, claim_id: query.claim_id, role: query.role, status: 'RETRIEVAL_FAILED', provider_records: [] })), reinforcement: [] }
      : queryExecution(queries),
    provider_execution: rejected
      ? { initial: [{ provider_id: 'fixture', status: 'REJECTED', error_code: 'PROVIDER_FAILURE' }], reinforcement: [] }
      : { initial: [{ provider_id: 'fixture-a', status: 'FULFILLED' }], reinforcement: [{ provider_id: 'fixture-b', status: 'FULFILLED' }] },
    ai_used: false,
    payment_executed: false
  };
}

test('PURPOSE EFFECT: conflicting evidence can never be promoted to CONFIRMED', () => {
  const task = taskFor();
  const plan = buildCanonicalTaskPlan(task, { primary: { id: 'G01', compare_lens: ['scope', 'conflict'] } });
  const claim = plan.claims[0];
  const canonical = evaluateCanonicalTaskPlan(plan, evidencePacket(claim.raw_text, plan.search_plan.queries, { conflict: true }));
  const confirmation = canonical.records[0].confirmation;
  const lanes = projectFiveLanes({ task, canonical, domain: { primary: { id: 'G01', compare_lens: ['scope', 'conflict'] } } });

  assert.equal(confirmation.status, 'UNDETERMINED');
  assert.equal(confirmation.gates.G6, false);
  assert.ok(confirmation.reasons.includes('CONFLICT'));
  assert.equal(lanes.fact.confirmed.length, 0);
  assert.equal(lanes.fact.unconfirmed.length, 1);
  assert.equal(lanes.compare.counts.conflicts, 1);
  assert.equal(lanes.compare.material_only, true);
});

test('PURPOSE EFFECT: provider failure keeps the claim UNDETERMINED while preserving useful non-fabricated lanes', () => {
  const task = taskFor();
  const domain = { primary: { id: 'G01', multi_lens: ['forward', 'counter'], compare_lens: ['scope', 'coverage'] } };
  const plan = buildCanonicalTaskPlan(task, domain);
  const claim = plan.claims[0];
  const canonical = evaluateCanonicalTaskPlan(plan, evidencePacket(claim.raw_text, plan.search_plan.queries, { rejected: true }));
  const confirmation = canonical.records[0].confirmation;
  const lanes = projectFiveLanes({ task, canonical, domain });

  assert.equal(confirmation.status, 'UNDETERMINED');
  assert.equal(confirmation.gates.G5, false);
  assert.ok(confirmation.reasons.includes('RETRIEVAL_FAILED'));
  assert.equal(lanes.fact.confirmed.length, 0);
  assert.equal(lanes.fact.unconfirmed.length, 1);
  assert.ok(lanes.inquiry.open_items.length >= 1);
  assert.equal(lanes.compare.material_only, true);
  assert.equal(lanes.compare.selected_candidate, null);
  assert.deepEqual(lanes.compare.candidate_ranking, []);
});
