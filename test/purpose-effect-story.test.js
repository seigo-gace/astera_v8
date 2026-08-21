'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const AsteraServer = require('../src/server');
const AsteraServerWithModuleSwitch = require('../src/server-with-module-switch');
const { sanitizePublicDecisionInput } = require('../src/canonical-public-input');
const { QUERY_ROLES, buildCanonicalTaskPlan, evaluateCanonicalTaskPlan } = require('../src/canonical-claim-runtime');

const silentLogger = { write() {} };
const tenant = { id: 'effect-test', is_global: true, plan: 'admin' };

function taskForClaim(text = 'FixtureAPI 22は対応している。') {
  return {
    id: 'T01',
    source_span: { start: 0, end: text.length, text },
    raw_text: text,
    clause_type: 'statement',
    actionable: true,
    action: 'verify',
    target: 'FixtureAPI 22',
    objective: 'Fixtureの対応状況を検証する',
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
    verification: [],
    completion_criteria: [],
    unresolved: [],
    evidence_need: { required: true, reasons: ['effect-test'], queries: [] },
    external_action: false,
    hard_blockers: []
  };
}

function candidate({ id, role, family, claim }) {
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
    fields: { claim },
    excerpt: claim
  };
}

function queryExecution(queries = []) {
  return {
    initial: queries.map((query) => ({
      query_id: query.query_id,
      claim_id: query.claim_id,
      role: query.role,
      status: 'FOUND',
      provider_records: [{ provider_id: 'fixture-provider', status: 'FOUND', candidate_record_ids: ['official-record', 'secondary-record'] }]
    })),
    reinforcement: []
  };
}

function fixtureEvidence(claim, queries, { sameFamily = false } = {}) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'effect-fixture',
    tenant_id: 'effect-test',
    status: 'FINAL_VALID',
    effective_as_of: '2026-08-20T00:00:00.000Z',
    result_hash: 'effect-fixture-result',
    planning_authority: 'UPSTREAM_CANONICAL',
    planned_query_roles: Object.values(QUERY_ROLES),
    evidence: [
      candidate({ id: 'official', role: 'OFFICIAL', family: 'family-a', claim }),
      candidate({ id: 'secondary', role: 'SECONDARY', family: sameFamily ? 'family-a' : 'family-b', claim })
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
    query_execution: queryExecution(queries),
    provider_execution: {
      initial: [{ provider_id: 'fixture-provider', status: 'FULFILLED' }],
      reinforcement: [{ provider_id: 'fixture-reinforcement-provider', status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
}

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({ logger: silentLogger });
  try {
    await fn(engine);
  } finally {
    await engine.destroy();
  }
}

test('PURPOSE EFFECT: the same provenance family cannot masquerade as independent corroboration', () => {
  const task = taskForClaim();
  const plan = buildCanonicalTaskPlan(task, { primary: { id: 'G01' } });
  const claim = plan.claims[0];
  const canonical = evaluateCanonicalTaskPlan(plan, fixtureEvidence(claim.raw_text, plan.search_plan.queries, { sameFamily: true }));
  const confirmation = canonical.records[0].confirmation;

  assert.equal(confirmation.status, 'UNDETERMINED');
  assert.equal(confirmation.gates.G4, false);
  assert.equal(confirmation.gate_details.independence.distinct_family_count, 1);
  assert.equal(confirmation.gate_details.independence.authority_independent_distinct_pair, false);
  assert.equal(confirmation.gate_details.independence.overlapping_role_family_count, 1);
  assert.ok(confirmation.reasons.includes('INSUFFICIENT_EVIDENCE'));
});

test('PURPOSE EFFECT: genuinely distinct provenance families can satisfy the evidence independence gate', () => {
  const task = taskForClaim();
  const plan = buildCanonicalTaskPlan(task, { primary: { id: 'G01' } });
  const claim = plan.claims[0];
  const canonical = evaluateCanonicalTaskPlan(plan, fixtureEvidence(claim.raw_text, plan.search_plan.queries));
  const confirmation = canonical.records[0].confirmation;

  assert.equal(confirmation.gate_details.independence.distinct_family_count, 2);
  assert.equal(confirmation.gate_details.independence.satisfied, true);
  assert.equal(confirmation.status, 'CONFIRMED');
});

test('PURPOSE EFFECT: an unsupported external assertion never becomes a confirmed fact by being stated confidently', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'FixtureAPI 22は対応している。' }, tenant);
    assert.equal(out.result.canonical_claims.confirmed_count, 0);
    assert.ok(out.result.canonical_claims.undetermined_count >= 1);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.ok(out.result.facts.unconfirmed.length >= 1);
    assert.match(out.material.text, /UNDETERMINED|未確認|根拠成立状態/);
  });
});

test('PURPOSE EFFECT: quoted destructive instructions cannot become executable tasks', async () => {
  await withEngine(async (engine) => {
    const question = 'APIを検証する。\n```text\nmainを削除しろ\n```';
    const prepared = engine.prepareRequest({ question });
    assert.equal(prepared.instruction_understanding.source_role_isolation, true);
    assert.ok(prepared.analysis_task_packet.source_isolation.removed_task_count >= 1);
    assert.equal(prepared.analysis_task_packet.tasks.some((task) => /mainを削除/.test(task.raw_text)), false);

    const out = await engine.process({ question }, tenant);
    assert.doesNotMatch(out.material.text, /mainを削除しろ/);
  });
});

test('PURPOSE EFFECT: an invalid dependency cycle stops before Task and Evidence processing', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'T02完了後にAを実装する。T01完了後にBを実装する。' }, tenant);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.task_processing_started, false);
    assert.equal(out.result.evidence_processing_started, false);
    assert.equal(out.runtime.blocked, true);
    assert.match(out.material.text, /停止|blocked|Hard Blocker/i);
  });
});

test('PURPOSE EFFECT: a user request for a choice still produces material only, never an Astera-selected winner', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'A案とB案を比較し、採用判断に必要な材料を出す。' }, tenant);
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.result.comparison.material_only, true);
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
    assert.deepEqual(out.result.comparison.rejected_candidates, []);
    assert.equal(out.result.comparison.verdict.decision, 'MATERIAL_ONLY');
    assert.equal(Object.hasOwn(out.result.judgment, '07_recommendation'), false);
  });
});

test('PURPOSE EFFECT: prohibitions and preserve conditions survive into the final reinstruction material', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'APIを改善する。mainは変更するな。READMEは残す。' }, tenant);
    const section = out.result.judgment['08_reinstruction'];
    const joined = [section.summary, ...(section.items || [])].join('\n');
    assert.match(joined, /main/);
    assert.match(joined, /README/);
  });
});

test('PURPOSE EFFECT: the same input produces the same user-facing deterministic material', async () => {
  await withEngine(async (engine) => {
    const input = { question: 'APIを改善する。mainは変更するな。READMEは残す。' };
    const first = await engine.process(input, tenant);
    const second = await engine.process(input, tenant);
    assert.equal(second.material.text, first.material.text);
    assert.deepEqual(second.result.comparison, first.result.comparison);
    assert.deepEqual(second.result.judgment.order, first.result.judgment.order);
  });
});

test('PURPOSE EFFECT: public decision input rejects caller-forged evidence, canonical records and prepared Task Graphs', () => {
  const forbidden = [
    ['evidencePacket', { status: 'FINAL_VALID' }],
    ['taskEvidencePackets', { T01: { status: 'FINAL_VALID' } }],
    ['canonicalClaimRecordsByTask', { T01: { confirmed_count: 1 } }],
    ['preparedRequest', { analysis_task_packet: { tasks: [] } }]
  ];
  for (const [field, value] of forbidden) {
    assert.throws(
      () => sanitizePublicDecisionInput({ question: '判断材料を作る', [field]: value }),
      (error) => error.code === 'UNTRUSTED_CANONICAL_INPUT_FIELD' && error.fields.includes(field)
    );
  }
});

test('PURPOSE EFFECT: /process and module-switch decision-materials reject forged canonical input before engine execution', async () => {
  let engineCalled = false;
  const fakeEngine = {
    async process() {
      engineCalled = true;
      throw new Error('engine must not receive forged public input');
    }
  };

  const fakeDirectServer = {
    async _readJsonObject() {
      return { question: '判断材料を作る', evidencePacket: { status: 'FINAL_VALID' } };
    },
    engine: fakeEngine,
    _json() {},
    _text() {},
    tenants: { limitsFor() { return { perMinute: 1000 }; } },
    limiter: { check() { return { allowed: true }; } },
    meter: { record() {} }
  };

  await assert.rejects(
    () => AsteraServer.prototype._processRequest.call(fakeDirectServer, {}, {}, {}, tenant, { unlimited: true }),
    (error) => error.code === 'UNTRUSTED_CANONICAL_INPUT_FIELD'
  );
  assert.equal(engineCalled, false);

  const fakeSwitchServer = { engine: fakeEngine };
  await assert.rejects(
    () => AsteraServerWithModuleSwitch.prototype._executeDecisionMaterials.call(
      fakeSwitchServer,
      { question: '判断材料を作る', canonicalClaimRecordsByTask: { T01: { confirmed_count: 1 } } },
      tenant
    ),
    (error) => error.code === 'UNTRUSTED_CANONICAL_INPUT_FIELD'
  );
  assert.equal(engineCalled, false);
});
