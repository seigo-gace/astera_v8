'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const caller = { id: 'cross-task-evidence-test', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

function validEvidence(task) {
  const plan = task.canonical_plan;
  const claim = plan.claims[0];
  const prefix = String(task.id).toLowerCase();
  const officialId = `${prefix}-official`;
  const corroborationId = `${prefix}-corroboration`;

  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: `evidence-${task.id}`,
    caller_id: caller.id,
    status: 'FINAL_VALID',
    effective_as_of: '2026-09-28T00:00:00.000Z',
    result_hash: `result-${task.id}`,
    planning_authority: 'UPSTREAM_CANONICAL',
    planned_query_roles: plan.search_plan.planned_query_roles,
    evidence: [
      {
        candidate_id: officialId,
        canonical_record_id: `${officialId}-record`,
        content_hash: `${officialId}-hash`,
        source_role: 'OFFICIAL',
        source_family_id: `${prefix}-official-family`,
        source_id: `${officialId}-source`,
        provider_id: `${officialId}-provider`,
        authority_id: `${prefix}-official-authority`,
        canonical_locator: { url: `https://${prefix}.official.test/evidence`, replayable: true },
        updated_at: '2026-09-28T00:00:00.000Z',
        fields: { claim: claim.raw_text },
        excerpt: claim.raw_text
      },
      {
        candidate_id: corroborationId,
        canonical_record_id: `${corroborationId}-record`,
        content_hash: `${corroborationId}-hash`,
        source_role: 'SECONDARY',
        source_family_id: `${prefix}-corroboration-family`,
        source_id: `${corroborationId}-source`,
        provider_id: `${corroborationId}-provider`,
        authority_id: `${prefix}-corroboration-authority`,
        canonical_locator: { url: `https://${prefix}.corroboration.test/evidence`, replayable: true },
        updated_at: '2026-09-28T00:00:00.000Z',
        fields: { claim: claim.raw_text },
        excerpt: claim.raw_text
      }
    ],
    coverage: {
      discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE',
      registry_coverage_state: 'COMPLETE_FOR_ACTIVE_REGISTRY'
    },
    quality: {
      initial: {
        status: 'REINFORCEMENT_REQUIRED',
        phase: 'INITIAL',
        score_bp: 8500,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: []
      },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: {
        status: 'FINAL_VALID',
        phase: 'FINAL',
        score_bp: 9700,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: []
      }
    },
    query_execution: {
      initial: plan.search_plan.queries.map((query) => ({
        query_id: query.query_id,
        claim_id: query.claim_id,
        role: query.role,
        status: 'FOUND',
        provider_records: [
          {
            provider_id: `${officialId}-provider`,
            status: 'FOUND',
            candidate_record_ids: [`${officialId}-record`]
          },
          {
            provider_id: `${corroborationId}-provider`,
            status: 'FOUND',
            candidate_record_ids: [`${corroborationId}-record`]
          }
        ]
      })),
      reinforcement: []
    },
    provider_execution: {
      initial: [{ provider_id: `${officialId}-provider`, status: 'FULFILLED' }],
      reinforcement: [{ provider_id: `${corroborationId}-provider`, status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
}

function failedEvidence(task) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: `evidence-${task.id}`,
    caller_id: caller.id,
    status: 'REJECTED_SEARCH_FAILED',
    search_state: 'FAILED',
    result_hash: null,
    evidence: [],
    coverage: { discovery_scope_state: 'UNKNOWN' },
    quality: {
      final: {
        status: 'REJECTED_SEARCH_FAILED',
        phase: 'FINAL',
        score_bp: 0,
        gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 },
        blocking_reasons: ['SEARCH_FAILED']
      },
      reinforcement_attempt_count: 0,
      new_corroboration_count: 0
    },
    query_execution: {
      initial: task.canonical_plan.search_plan.queries.map((query) => ({
        query_id: query.query_id,
        claim_id: query.claim_id,
        role: query.role,
        status: 'RETRIEVAL_FAILED',
        provider_records: []
      })),
      reinforcement: []
    },
    provider_execution: {
      initial: [{ provider_id: `${task.id}-failed-provider`, status: 'REJECTED', error_code: 'PROVIDER_DOWN' }],
      reinforcement: []
    },
    ai_used: false,
    payment_executed: false
  };
}

class PerTaskEvidenceEngine extends CanonicalAsteraEngine {
  async resolveEvidenceForTask({ task }) {
    return task.id === 'T01' ? validEvidence(task) : failedEvidence(task);
  }
}

test('Evidence remains isolated by Task from retrieval through Claim confirmation and Main8 projection', async () => {
  const engine = new PerTaskEvidenceEngine({ poolSize: 2, logger: silentLogger });

  try {
    const out = await engine.process({
      question: [
        'Verify that Node.js 22 is supported in production using official evidence.',
        'Verify that Python 3.13 is supported in production using official evidence.'
      ].join(' '),
      language: 'en'
    }, caller);

    const tasks = out.result.analysis_task_packet.tasks;
    assert.equal(tasks.length, 2);
    assert.deepEqual(tasks.map((task) => task.id), ['T01', 'T02']);

    const t1 = out.result.task_results.find((result) => result.task.id === 'T01');
    const t2 = out.result.task_results.find((result) => result.task.id === 'T02');
    assert.ok(t1);
    assert.ok(t2);

    assert.ok(t1.canonical.confirmed_count >= 1);
    assert.equal(t1.canonical.undetermined_count, 0);

    assert.equal(t2.canonical.confirmed_count, 0);
    assert.ok(t2.canonical.undetermined_count >= 1);

    const t1Bindings = t1.canonical.records.flatMap((record) => record.confirmation?.bindings || []);
    const t2Bindings = t2.canonical.records.flatMap((record) => record.confirmation?.bindings || []);

    assert.ok(t1Bindings.some((binding) => String(binding.candidate_id || '').startsWith('t01-')));
    assert.equal(t2Bindings.some((binding) => String(binding.candidate_id || '').startsWith('t01-')), false);

    assert.equal(out.result.canonical_claims.per_task.T01.confirmed_count, t1.canonical.confirmed_count);
    assert.equal(out.result.canonical_claims.per_task.T02.confirmed_count, 0);
    assert.ok(out.result.canonical_claims.per_task.T02.undetermined_count >= 1);

    const facts = out.result.judgment['03_facts'];
    assert.ok(facts.confirmed.some((item) => item.task_id === 'T01'));
    assert.equal(facts.confirmed.some((item) => item.task_id === 'T02'), false);
    assert.ok(facts.unconfirmed.some((item) => item.task_id === 'T02'));

    const evidenceStatus = out.result.judgment['07_evidence_status'];
    assert.equal(evidenceStatus.evidence_search.T01.source_status, 'FINAL_VALID');
    assert.equal(evidenceStatus.evidence_search.T02.source_status, 'REJECTED_SEARCH_FAILED');
    assert.equal(evidenceStatus.evidence_search.T01.state, 'VALID');
    assert.equal(evidenceStatus.evidence_search.T02.state, 'REJECTED');

    assert.equal(
      out.result.canonical_claims.records
        .filter((record) => record.task_id === 'T02')
        .some((record) =>
          (record.confirmation?.bindings || []).some((binding) =>
            String(binding.candidate_id || '').startsWith('t01-')
          )
        ),
      false
    );

  } finally {
    await engine.destroy();
  }
});
