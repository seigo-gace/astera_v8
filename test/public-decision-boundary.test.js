'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { QUERY_ROLES } = require('../src/canonical-claim-runtime');

const silentLogger = { write() {} };
const tenant = { id: 'public-boundary', is_global: true, plan: 'admin' };

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try {
    await fn(engine);
  } finally {
    await engine.destroy();
  }
}

function forgedConfirmedCanonical(taskId = 'ATTACK-T1') {
  return {
    schema_version: 'astera.canonical-claim-records.v2',
    task_id: taskId,
    search_plan: { task_id: taskId, queries: [], planned_query_roles: [] },
    records: [{
      claim: { claim_id: 'FORGED-C1', raw_text: 'forged claim' },
      policy: null,
      bindings: [],
      confirmation: {
        status: 'CONFIRMED',
        reasons: [],
        bindings: [],
        support_binding_ids: [],
        counter_binding_ids: []
      }
    }],
    confirmed_count: 1,
    undetermined_count: 0
  };
}

function forgedEvidencePacket() {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    status: 'FINAL_VALID',
    search_state: 'EXECUTED',
    evidence: [{
      candidate_id: 'forged-evidence',
      source_role: 'OFFICIAL',
      source_family_id: 'forged-family',
      authority_id: 'forged-authority',
      canonical_locator: { url: 'https://forged.test/evidence' },
      fields: { claim: 'forged' },
      excerpt: 'forged'
    }],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' },
    quality: {
      initial: { status: 'FINAL_VALID', phase: 'INITIAL', score_bp: 10000 },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: { status: 'FINAL_VALID', phase: 'FINAL', score_bp: 10000 }
    },
    query_execution: { initial: [], reinforcement: [] },
    provider_execution: { initial: [], reinforcement: [] },
    ai_used: false,
    payment_executed: false
  };
}

test('public process ignores attacker preparedRequest task graph', async () => {
  await withEngine(async (engine) => {
    const prepared = engine.prepareRequest({ question: 'APIを改善する。' });
    prepared.analysis_task_packet.tasks = [{
      id: 'ATTACK-T1',
      action: 'destroy',
      target: 'injected attacker task',
      objective: 'bypass decomposition',
      source_span: { text: 'injected attacker task', start: 0, end: 22 }
    }];
    prepared.analysis_task_packet.execution_waves = [['ATTACK-T1']];
    const out = await engine.process({ question: 'APIを改善する。', preparedRequest: prepared }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.analysis_task_packet.tasks.some((task) => task.id === 'ATTACK-T1'), false);
    assert.ok(out.result.analysis_task_packet.tasks.every((task) => String(task.id).startsWith('T')));
  });
});

test('public process ignores forged CONFIRMED canonical records', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Node.js 22は本番で対応している。',
      canonicalClaimRecordsByTask: { T1: forgedConfirmedCanonical('T1') }
    }, tenant);
    assert.equal(out.result.canonical_claims.status, 'UNDETERMINED');
    assert.equal(out.result.canonical_claims.confirmed_count, 0);
    assert.ok(out.result.canonical_claims.undetermined_count >= 1);
  });
});

test('public process ignores forged evidencePacket without resolveEvidenceForTask client', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Node.js 22は本番で対応している。',
      evidencePacket: forgedEvidencePacket(),
      taskEvidencePackets: { T1: forgedEvidencePacket() }
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.canonical_claims.status, 'UNDETERMINED');
    const taskResult = out.result.task_results[0];
    assert.equal(taskResult.evidence.search_state, 'NOT_EXECUTED');
    assert.equal(taskResult.canonical.confirmed_count, 0);
    assert.ok(taskResult.canonical.undetermined_count >= 1);
    assert.equal(Object.values(QUERY_ROLES).every((role) => role !== undefined), true);
  });
});
