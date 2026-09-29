'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { resolveTaskEvidence } = require('../src/canonical-evidence-resolver');

const caller = { id: 'evidence-search-flow-gate', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

function validPacket(task) {
  const plan = task.canonical_plan;
  const claim = plan.claims[0];
  const officialId = `${task.id.toLowerCase()}-official`;
  const corroborationId = `${task.id.toLowerCase()}-corroboration`;
  const providerIds = [`${officialId}-provider`, `${corroborationId}-provider`];

  return {
    schema_version: 'astera.evidence-search.result.v1',
    status: 'FINAL_VALID',
    result_hash: `result-${task.id}`,
    effective_as_of: '2026-09-29T00:00:00.000Z',
    evidence: [
      {
        candidate_id: officialId,
        canonical_record_id: `${officialId}-record`,
        content_hash: `${officialId}-hash`,
        source_role: 'OFFICIAL',
        source_family_id: `${officialId}-family`,
        source_id: `${officialId}-source`,
        provider_id: providerIds[0],
        authority_id: `${officialId}-authority`,
        canonical_locator: { url: `https://${officialId}.test/evidence`, replayable: true },
        updated_at: '2026-09-29T00:00:00.000Z',
        fields: { claim: claim.raw_text },
        excerpt: claim.raw_text
      },
      {
        candidate_id: corroborationId,
        canonical_record_id: `${corroborationId}-record`,
        content_hash: `${corroborationId}-hash`,
        source_role: 'SECONDARY',
        source_family_id: `${corroborationId}-family`,
        source_id: `${corroborationId}-source`,
        provider_id: providerIds[1],
        authority_id: `${corroborationId}-authority`,
        canonical_locator: { url: `https://${corroborationId}.test/evidence`, replayable: true },
        updated_at: '2026-09-29T00:00:00.000Z',
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
        provider_records: providerIds.map((providerId, index) => ({
          provider_id: providerId,
          status: 'FOUND',
          candidate_record_ids: [`${index === 0 ? officialId : corroborationId}-record`]
        }))
      })),
      reinforcement: []
    },
    provider_execution: {
      initial: [{ provider_id: providerIds[0], status: 'FULFILLED' }],
      reinforcement: [{ provider_id: providerIds[1], status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
}

class EvidenceSearchFlowEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    this.searchCalls = [];
    this.activeTask = null;
    this.lastResolvedEvidence = null;
    this.evidenceClient = {
      search: async (payload) => {
        this.searchCalls.push(payload);
        return validPacket(this.activeTask);
      }
    };
  }

  async resolveEvidenceForTask({ task, input, caller: requestCaller, signal }) {
    this.activeTask = task;
    this.lastResolvedEvidence = await resolveTaskEvidence({
      client: this.evidenceClient,
      task,
      input,
      caller: requestCaller,
      signal
    });
    return this.lastResolvedEvidence;
  }
}

test('Evidence Search stage closes connection, result, effect, and Main8 handoff through the real resolver contract', async () => {
  const engine = new EvidenceSearchFlowEngine({ poolSize: 1, logger: silentLogger });
  const question = 'Verify that Node.js 22 is supported in production using official evidence.';

  try {
    const out = await engine.process({ question, language: 'en' }, caller);
    const task = out.result.task_results[0].task;
    const taskResult = out.result.task_results[0];

    // 1) CONNECTED: canonical Search Plan reaches the Evidence Search client through the real resolver request contract.
    assert.equal(engine.searchCalls.length, 1);
    const searchPayload = engine.searchCalls[0];
    assert.equal(searchPayload.search.free_projection, true);
    assert.equal(searchPayload.search.free_current, true);
    assert.equal(searchPayload.paid_search.enabled, false);
    assert.deepEqual(
      searchPayload.preplanned_queries.map((query) => query.query_id),
      task.canonical_plan.search_plan.queries.map((query) => query.query_id)
    );
    assert.deepEqual(
      searchPayload.upstream_search_plan.planned_query_roles,
      task.canonical_plan.search_plan.planned_query_roles
    );

    // 2) RESULT: returned provider/query execution becomes a FOUND Evidence packet under upstream canonical planning authority.
    assert.equal(engine.lastResolvedEvidence.planning_authority, 'UPSTREAM_CANONICAL');
    assert.equal(taskResult.evidence.search_state, 'FOUND');
    assert.equal(taskResult.evidence.source_status, 'FINAL_VALID');
    assert.ok(taskResult.evidence.search_execution.provider_attempt_count >= 2);
    assert.ok(taskResult.evidence.search_execution.evidence_count >= 2);

    // 3) EFFECT: valid Evidence confirms the intended Claim and appears as confirmed fact material, not merely as a successful search call.
    assert.ok(taskResult.canonical.confirmed_count >= 1);
    assert.equal(taskResult.canonical.undetermined_count, 0);
    assert.ok(out.result.judgment['03_facts'].confirmed.some((item) => item.task_id === task.id));
    assert.equal(out.result.judgment['03_facts'].unconfirmed.some((item) => item.task_id === task.id), false);
    assert.equal(out.result.judgment['07_evidence_status'].evidence_search[task.id].source_status, 'FINAL_VALID');
    assert.equal(out.result.judgment['07_evidence_status'].evidence_search[task.id].state, 'VALID');

    // 4) NEXT HANDOFF: confirmed state is projected to Main8/material/external brief while final decision authority remains external.
    assert.ok(String(out.material?.text || '').includes('CONFIRMED'));
    assert.ok(String(out.prompt || '').includes('Consumer rule: preserve task order, hard constraints, evidence status, and UNDETERMINED claims.'));
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.result.no_normative_decision_generated, true);
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
  } finally {
    await engine.destroy();
  }
});
