'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { QUERY_ROLES, buildCanonicalTaskPlan } = require('../src/canonical-claim-runtime');
const { routeDomainTemplates } = require('../src/domain-template-router');
const { projectCanonicalTask } = require('../src/canonical-task-projection');

const tenant = { id: 'm08-semantic-trace', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

const SOURCE_IDENTITY_FIELDS = Object.freeze([
  'claim_id',
  'binding_id',
  'candidate_id',
  'source_role',
  'source_family_id',
  'authority_id',
  'url'
]);

function evidenceCandidate({ id, role, family, authority, claim, url }) {
  return {
    candidate_id: id,
    canonical_record_id: `${id}-record`,
    content_hash: `${id}-hash`,
    source_role: role,
    source_family_id: family,
    source_id: `${id}-source`,
    provider_id: `${id}-provider`,
    authority_id: authority,
    canonical_locator: { url, replayable: true },
    updated_at: '2026-08-20T00:00:00.000Z',
    fields: { claim },
    excerpt: claim
  };
}

function semanticQueryExecution(queries = []) {
  return {
    initial: queries.map((query) => {
      let candidateRecordIds = ['ev-official-record'];
      if (query.role === QUERY_ROLES.COUNTER) {
        candidateRecordIds = ['ev-counter-record'];
      }
      return {
        query_id: query.query_id,
        claim_id: query.claim_id,
        role: query.role,
        status: 'FOUND',
        provider_records: [
          { provider_id: `${query.role}-provider`, status: 'FOUND', candidate_record_ids: candidateRecordIds }
        ]
      };
    }),
    reinforcement: []
  };
}

function semanticValidEvidence(claim, queries = []) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'ev-semantic-test',
    tenant_id: 'test',
    status: 'FINAL_VALID',
    effective_as_of: '2026-08-20T00:00:00.000Z',
    result_hash: 'semantic-test-hash',
    planning_authority: 'UPSTREAM_CANONICAL',
    planned_query_roles: Object.values(QUERY_ROLES),
    evidence: [
      evidenceCandidate({
        id: 'ev-official',
        role: 'OFFICIAL',
        family: 'official-family',
        authority: 'official-authority',
        claim,
        url: 'https://official.test/evidence'
      }),
      evidenceCandidate({
        id: 'ev-corroboration',
        role: 'SECONDARY',
        family: 'corrob-family',
        authority: 'corrob-authority',
        claim,
        url: 'https://corroboration.test/evidence'
      }),
      evidenceCandidate({
        id: 'ev-counter',
        role: 'SECONDARY',
        family: 'counter-family',
        authority: 'counter-authority',
        claim,
        url: 'https://counter.test/evidence'
      }),
      evidenceCandidate({
        id: 'ev-unrelated',
        role: 'SECONDARY',
        family: 'unrelated-family',
        authority: 'unrelated-authority',
        claim: '完全に無関係な天気予報である。',
        url: 'https://unrelated.test/evidence'
      })
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
    query_execution: semanticQueryExecution(queries),
    provider_execution: {
      initial: [{ provider_id: 'ev-official-provider', status: 'FULFILLED' }],
      reinforcement: [{ provider_id: 'ev-corroboration-provider', status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
}

function assertSourceIdentity(ref, label = 'ref') {
  for (const field of SOURCE_IDENTITY_FIELDS) {
    assert.notEqual(ref[field], null, `${field} must be non-null on ${label}`);
    assert.notEqual(ref[field], undefined, `${field} must be non-null on ${label}`);
  }
}

function assertProductionRefShape(ref, label = 'ref') {
  assertSourceIdentity(ref, label);
  assert.ok(Object.hasOwn(ref, 'relation'), `${label} must have relation key`);
  assert.ok(Object.hasOwn(ref, 'query_role'), `${label} must have query_role key`);
}

test('M08 semantic evidence trace preserves relation and query_role via projectCanonicalTask', () => {
  const claimText = 'APIは現行v2である。';
  const task = {
    id: 'T01',
    source_span: { start: 0, end: claimText.length, text: claimText },
    raw_text: claimText,
    action: 'verify',
    target: 'API',
    objective: '現行版を確認する',
    constraints: [],
    prohibitions: [],
    preserve: [],
    conditions: [],
    exceptions: [],
    depends_on: [],
    hard_blockers: [],
    completion_criteria: [],
    success_criteria: []
  };
  const domain = routeDomainTemplates({ question: claimText });
  const canonicalPlan = buildCanonicalTaskPlan(task, domain);
  const claim = canonicalPlan.claims[0];
  const queries = canonicalPlan.search_plan.queries.filter((query) => query.claim_id === claim.claim_id);
  assert.ok(queries.some((query) => query.role === QUERY_ROLES.COUNTER), 'expected COUNTER query in search plan');

  const projected = projectCanonicalTask({
    task: { ...task, canonical_plan: canonicalPlan, domain },
    evidenceRaw: semanticValidEvidence(claim.raw_text, queries)
  });

  const expansion = projected.perspective_expansion;
  const mainline = expansion.perspectives.find((perspective) => perspective.id === 'mainline');
  assert.ok(mainline, 'expected mainline perspective');

  const supportRefs = mainline.support_evidence_refs;
  const counterRefs = mainline.counter_evidence_refs;

  assert.ok(supportRefs.length >= 1, 'expected support evidence refs');
  assert.ok(supportRefs.every((ref) => ref.relation === 'SUPPORTS'), 'support_evidence_refs must be SUPPORTS only');
  for (const ref of supportRefs) {
    assertProductionRefShape(ref, 'support_evidence_ref');
  }

  const counterCandidate = counterRefs.find((ref) => ref.candidate_id === 'ev-counter');
  assert.ok(counterCandidate, 'expected ev-counter in counter_evidence_refs');
  assert.equal(counterCandidate.query_role, QUERY_ROLES.COUNTER);

  const unrelatedBinding = projected.canonical.records
    .flatMap((record) => record.confirmation?.bindings || [])
    .find((binding) => binding.candidate_id === 'ev-unrelated');
  assert.ok(unrelatedBinding, 'expected ev-unrelated binding');
  assert.ok(
    unrelatedBinding.relation === 'NO_MATCH' || unrelatedBinding.relation === 'CONTRADICTS',
    'ev-unrelated must be NO_MATCH or CONTRADICTS'
  );
  assert.notEqual(unrelatedBinding.query_role, QUERY_ROLES.COUNTER, 'NO_MATCH/CONTRADICTS must not inherit COUNTER query_role');

  const counterInSupport = supportRefs.find((ref) => ref.candidate_id === 'ev-counter');
  if (counterInSupport && counterCandidate) {
    assert.equal(counterInSupport.relation, 'SUPPORTS');
    assert.equal(counterCandidate.query_role, QUERY_ROLES.COUNTER);
  }
});

test('M10 no_normative_decision_generated invariant on Public engine.process compare path', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'A案とB案を費用と安全性で比較する。',
      language: 'ja'
    }, tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.no_normative_decision_generated, true);
    assert.equal(out.result.judgment.no_normative_decision_generated, true);
    assert.equal(out.material.no_normative_decision_generated, true);

    const s06 = out.result.judgment['06_comparison'];
    assert.equal(s06.selected_candidate, null);
    assert.deepEqual(s06.candidate_ranking, []);
    assert.deepEqual(s06.rejected_candidates, []);

    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
    assert.deepEqual(out.result.comparison.rejected_candidates, []);
  } finally {
    await engine.destroy();
  }
});
