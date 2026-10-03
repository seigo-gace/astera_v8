'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const caller = { id: 'post-to-answer-flow-gate', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

class FlowGateEngine extends CanonicalAsteraEngine {
  async resolveEvidenceForTask({ task }) {
    return {
      schema_version: 'astera.evidence-search.result.v1',
      request_id: `flow-${task.id}`,
      caller_id: caller.id,
      task_id: task.id,
      status: 'REJECTED_SEARCH_NOT_EXECUTED',
      search_state: 'NOT_EXECUTED',
      result_hash: null,
      evidence: [],
      coverage: { discovery_scope_state: 'NOT_EXECUTED' },
      quality: {
        final: {
          status: 'REJECTED_SEARCH_NOT_EXECUTED',
          phase: 'FINAL',
          score_bp: 0,
          blocking_reasons: ['SEARCH_NOT_EXECUTED']
        },
        reinforcement_attempt_count: 0,
        new_corroboration_count: 0
      },
      query_execution: {
        initial: task.canonical_plan.search_plan.queries.map((query) => ({
          query_id: query.query_id,
          claim_id: query.claim_id,
          role: query.role,
          status: 'NOT_EXECUTED',
          provider_records: []
        })),
        reinforcement: []
      },
      provider_execution: { initial: [], reinforcement: [] },
      ai_used: false,
      payment_executed: false
    };
  }
}

test('post-to-answer stage closes connection, result, intended effect, and downstream handoff without guessing', async () => {
  const engine = new FlowGateEngine({ poolSize: 2, logger: silentLogger });
  const question = 'Verify that Node.js 22 is supported in production using official evidence.';

  try {
    const out = await engine.process({ question, language: 'en' }, caller);

    // 1) CONNECTED: the posted text reaches canonical request understanding unchanged enough to remain traceable.
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.analysis_task_packet.tasks.length, 1);
    const task = out.result.analysis_task_packet.tasks[0];
    assert.equal(task.id, 'T01');
    assert.equal(task.action, 'verify');
    assert.match(task.target, /Node\.js 22/i);
    assert.match(task.source_span.text, /Node\.js 22/i);

    // 2) RESULT: the Task is converted into the canonical Claim/Search Plan runtime contract.
    const taskResult = out.result.task_results.find((entry) => entry.task.id === 'T01');
    assert.ok(taskResult);
    assert.ok(taskResult.task.canonical_plan);
    assert.ok(taskResult.task.canonical_plan.claims.length >= 1);
    assert.ok(taskResult.task.canonical_plan.search_plan.queries.length >= 1);

    // 3) EFFECT: missing evidence must remain explicitly unresolved, not be promoted to fact merely because the flow ran.
    assert.equal(taskResult.canonical.confirmed_count, 0);
    assert.ok(taskResult.canonical.undetermined_count >= 1);
    assert.equal(out.result.canonical_claims.per_task.T01.confirmed_count, 0);
    assert.ok(out.result.canonical_claims.per_task.T01.undetermined_count >= 1);
    assert.equal(out.result.judgment['07_evidence_status'].evidence_search.T01.source_status, 'REJECTED_SEARCH_NOT_EXECUTED');
    assert.equal(out.result.judgment['03_facts'].confirmed.some((item) => item.task_id === 'T01'), false);
    assert.ok(out.result.judgment['03_facts'].unconfirmed.some((item) => item.task_id === 'T01'));

    // 4) NEXT HANDOFF: Main8/material and the external-consumer brief both carry the unresolved state without granting Astera decision authority.
    assert.ok(out.result.judgment['08_reinstruction']);
    assert.ok(String(out.material?.text || '').trim().length > 0);
    assert.ok(String(out.prompt || '').includes('Consumer rule: preserve task order, hard constraints, evidence status, and UNDETERMINED claims.'));
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.result.no_normative_decision_generated, true);
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
  } finally {
    await engine.destroy();
  }
});
