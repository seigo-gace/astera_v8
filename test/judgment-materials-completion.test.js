'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { routeDomainTemplates } = require('../src/domain-template-router');
const {
  QUERY_ROLES,
  buildCanonicalTaskPlan,
  evaluateCanonicalTaskPlan,
  projectFiveLanes
} = require('../src/canonical-claim-runtime');
const { projectCanonicalTask } = require('../src/canonical-task-projection');
const { evaluateClaimConfirmation, UndeterminedReason } = require('../src/v4-canonical/confirmation');
const { CandidateRelation, EvidenceSource } = require('../src/v4-canonical/evidence-binding');
const { factLane, riskLane, multiLane, inquiryLane, compareLane, buildFiveLanes } = require('../src/v4-canonical/lanes');

const silentLogger = { write() {} };
const tenant = { id: 'judgment-materials-completion', is_global: true, plan: 'admin' };

const MAIN8_ORDER = Object.freeze([
  '01_purpose',
  '02_premise',
  '03_facts',
  '04_crisis',
  '05_opposition',
  '06_comparison',
  '07_evidence_status',
  '08_reinstruction'
]);

const FIVE_LANES = Object.freeze(['fact', 'risk', 'multi', 'inquiry', 'compare']);

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try {
    await fn(engine);
  } finally {
    await engine.destroy();
  }
}

class ConflictEvidenceEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    this._fixtureEvidence = null;
  }

  setFixtureEvidence(packet) {
    this._fixtureEvidence = packet;
    return this;
  }

  async resolveEvidenceForTask() {
    return this._fixtureEvidence;
  }
}

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

function queryExecution(queries = []) {
  return {
    initial: queries.map((query) => ({
      query_id: query.query_id,
      claim_id: query.claim_id,
      role: query.role,
      status: 'FOUND',
      provider_records: [
        { provider_id: 'ev-official-provider', status: 'FOUND', candidate_record_ids: ['ev-official-record'] },
        { provider_id: 'ev-corroboration-provider', status: 'FOUND', candidate_record_ids: ['ev-corroboration-record'] }
      ]
    })),
    reinforcement: []
  };
}

function validEvidence(claim, queries = [], extraCandidates = []) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    request_id: 'ev-test',
    tenant_id: 'test',
    status: 'FINAL_VALID',
    effective_as_of: '2026-08-20T00:00:00.000Z',
    result_hash: 'test-result-hash',
    planning_authority: 'UPSTREAM_CANONICAL',
    planned_query_roles: Object.values(QUERY_ROLES),
    evidence: [
      evidenceCandidate({ id: 'ev-official', role: 'OFFICIAL', family: 'official-family', authority: 'official-authority', claim, url: 'https://official.test/evidence' }),
      evidenceCandidate({ id: 'ev-corroboration', role: 'SECONDARY', family: 'corroboration-family', authority: 'corroboration-authority', claim, url: 'https://corroboration.test/evidence' }),
      ...extraCandidates
    ],
    coverage: { discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE', registry_coverage_state: 'COMPLETE_FOR_ACTIVE_REGISTRY' },
    quality: {
      initial: { status: 'REINFORCEMENT_REQUIRED', phase: 'INITIAL', score_bp: 8500, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] },
      reinforcement_attempt_count: 1,
      new_corroboration_count: 1,
      final: { status: 'FINAL_VALID', phase: 'FINAL', score_bp: 9700, gates: { initial_minimum_bp: 8000, final_minimum_bp: 9500 }, blocking_reasons: [] }
    },
    query_execution: queryExecution(queries),
    provider_execution: {
      initial: [{ provider_id: 'ev-official-provider', status: 'FULFILLED' }],
      reinforcement: [{ provider_id: 'ev-corroboration-provider', status: 'FULFILLED' }]
    },
    ai_used: false,
    payment_executed: false
  };
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

function planForClaim(engine, claimText, domainPrimary = null) {
  const prepared = engine.prepareRequest({ question: claimText, language: 'ja' });
  const task = prepared.analysis_task_packet.tasks[0];
  const domain = domainPrimary ? { primary: { id: domainPrimary } } : routeDomainTemplates({ question: claimText });
  const plan = buildCanonicalTaskPlan(task, domain);
  return { prepared, task, plan, domain };
}

function assertNoNormativeDecisionArtifacts(result, materialText = '') {
  assert.equal(result.decision_authority, 'EXTERNAL_ONLY');
  assert.equal(result.no_normative_decision_generated, true);
  assert.equal(result.comparison?.material_only, true);
  assert.equal(result.comparison?.selected_candidate, null);
  assert.deepEqual(result.comparison?.candidate_ranking || [], []);
  assert.deepEqual(result.comparison?.rejected_candidates || [], []);
  assert.equal(Object.hasOwn(result.comparison || {}, 'score'), false);
  assert.equal(Object.hasOwn(result, 'recommendation'), false);
  assert.equal(Object.hasOwn(result.judgment || {}, '07_recommendation'), false);
  assert.equal(Object.hasOwn(result, 'winner'), false);
  assert.equal(Object.hasOwn(result, 'final_decision'), false);
  if (materialText) {
    assert.doesNotMatch(materialText, /\bWinner\b/i);
    assert.doesNotMatch(materialText, /selected_candidate=/);
    assert.doesNotMatch(materialText, /candidate_ranking=/);
  }
}

test('Case A: normal judgment materials expose Main8, five lanes, and evidence refs without G01/Rec/Winner', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'A案とB案を費用と安全性で比較する。成功条件は互換性を維持すること。',
      language: 'ja'
    }, tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.deepEqual(out.result.judgment.order, MAIN8_ORDER);
    assert.deepEqual(out.result.five_stage.order, FIVE_LANES);
    assertNoNormativeDecisionArtifacts(out.result, out.material.text);

    for (const key of MAIN8_ORDER) {
      assert.ok(out.result.judgment[key], `missing Main8 section ${key}`);
      assert.ok(out.result.judgment[key].decision_basis?.rule_ids?.length >= 1, `${key} missing decision_basis.rule_ids`);
    }

    const taskResult = out.result.task_results[0];
    const laneKeys = { fact: 'facts', risk: 'risks', multi: 'multi', inquiry: 'inquiry', compare: 'comparison' };
    for (const lane of FIVE_LANES) {
      assert.ok(taskResult[laneKeys[lane]], `missing lane ${lane}`);
    }

    assert.match(out.material.text, /08 主役AI／利用者への再指示/);
    assert.match(out.material.text, /External Consumerへ渡す内容/);
    assert.match(out.material.text, /導出根拠/);
    assert.doesNotMatch(out.material.text, /"result"/);
  });
});

test('Case B: insufficient evidence keeps UNDETERMINED without speculative completion', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Node.js 22は本番で完全対応している。'
    }, tenant);

    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.canonical_claims.status, 'UNDETERMINED');
    assert.equal(out.result.canonical_claims.confirmed_count, 0);
    assert.ok(out.result.canonical_claims.undetermined_count >= 1);
    assert.equal(out.result.facts.confirmed.length, 0);
    assert.ok(out.result.facts.unconfirmed.length >= 1);
    assert.match(out.material.text, /UNDETERMINED|未確定|undetermined/i);
    assert.doesNotMatch(out.material.text, /CONFIRMED:Node\.js 22は本番で完全対応している/);
  });
});

test('Case C: evidence conflict preserves both sides and does not confirm or adopt either', async () => {
  const engine = new ConflictEvidenceEngine({ poolSize: 2, logger: silentLogger });
  try {
    const claimText = 'Node.js 22は本番で対応している。';
    const { task, plan, domain } = planForClaim(engine, claimText, 'G29');
    const claim = plan.claims[0];
    const supportClaim = claim.raw_text;
    const contradictClaim = 'Node.js 22は本番で対応していない。';
    const evidenceRaw = validEvidence(supportClaim, plan.search_plan.queries, [
      evidenceCandidate({
        id: 'ev-contradict',
        role: 'SECONDARY',
        family: 'contradict-family',
        authority: 'contradict-authority',
        claim: contradictClaim,
        url: 'https://contradict.test/evidence'
      })
    ]);
    engine.setFixtureEvidence(evidenceRaw);

    const out = await engine.process({ question: claimText, language: 'ja' }, tenant);

    assert.equal(out.result.canonical_claims.status, 'UNDETERMINED');
    const record = out.result.canonical_claims.records[0];
    assert.equal(record.confirmation.status, 'UNDETERMINED');
    assert.ok(record.confirmation.reasons.includes(UndeterminedReason.CONFLICT));
    assert.equal(record.confirmation.gates.G6, false);

    const relations = (record.confirmation.bindings || []).map((binding) => binding.relation);
    assert.ok(relations.includes(CandidateRelation.SUPPORTS));
    assert.ok(relations.includes(CandidateRelation.CONTRADICTS));
    assert.ok(record.confirmation.gate_details.contradiction_binding_ids.length >= 1);

    assert.ok(out.result.comparison.counts.conflicts >= 1);
    assert.ok(out.result.comparison.contradiction_map.some((entry) => entry.type === 'EVIDENCE_CONFLICT'));
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
    assert.equal(out.result.comparison.verdict.decision, 'MATERIAL_ONLY');
    assertNoNormativeDecisionArtifacts(out.result, out.material.text);
    assert.match(out.material.text, /Contradiction:|type=EVIDENCE_CONFLICT|CONFLICT/);

    const projected = projectCanonicalTask({
      task: { ...task, canonical_plan: plan, domain },
      evidenceRaw
    });
    assert.equal(projected.canonical.records[0].confirmation.status, record.confirmation.status);
  } finally {
    await engine.destroy();
  }
});

test('Case C binding gate: CONFLICT bindings block CONFIRMED even when SUPPORTS exist', () => {
  const claim = {
    claim_id: 'C-CONFLICT-1',
    raw_text: 'Node.js 22 supports production.',
    verification_line: { passed: true },
    modality: 'FACTUAL',
    subject: 'Node.js 22',
    predicate: 'SUPPORTS',
    object_or_value: 'production',
    polarity: 'POSITIVE',
    time_scope: '2026-08-20',
    jurisdiction: 'GLOBAL',
    version_scope: '22'
  };
  const policy = {
    external_search_required: true,
    verifiable_modalities: ['FACTUAL'],
    required_scope_fields: [],
    allowed_evidence_sources: [EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE],
    required_source_roles: ['OFFICIAL'],
    independence_requirement: 'AUTHORITY_PLUS_INDEPENDENT_OR_TWO_FAMILIES'
  };
  const bindings = [
    {
      evidence_binding_id: 'bind-support',
      claim_id: claim.claim_id,
      candidate_id: 'ev-support',
      relation: CandidateRelation.SUPPORTS,
      evidence_source: EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE,
      source_roles: ['OFFICIAL'],
      source_family_id: 'official-family',
      authority_id: 'official-authority'
    },
    {
      evidence_binding_id: 'bind-contradict',
      claim_id: claim.claim_id,
      candidate_id: 'ev-contradict',
      relation: CandidateRelation.CONTRADICTS,
      evidence_source: EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE,
      source_roles: ['SECONDARY'],
      source_family_id: 'contradict-family',
      authority_id: 'contradict-authority'
    }
  ];
  const queries = [{ query_id: 'q1', claim_id: claim.claim_id, role: QUERY_ROLES.OFFICIAL, status: 'FOUND' }];
  const rawEvidence = validEvidence(claim.raw_text, queries);
  const confirmation = evaluateClaimConfirmation({ claim, policy, bindings, queries, rawEvidence });

  assert.equal(confirmation.status, 'UNDETERMINED');
  assert.ok(confirmation.reasons.includes(UndeterminedReason.CONFLICT));
  assert.equal(confirmation.gates.G6, false);
  assert.deepEqual(confirmation.gate_details.contradiction_binding_ids, ['bind-contradict']);
  assert.ok(confirmation.support_binding_ids.includes('bind-support'));
});

test('Case D: caller canonical injection is not treated as authority', async () => {
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

test('Case E: caller evidence injection is not treated as authority', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Node.js 22は本番で対応している。',
      evidencePacket: forgedEvidencePacket(),
      taskEvidencePackets: { T1: forgedEvidencePacket() }
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.canonical_claims.status, 'UNDETERMINED');
    assert.equal(out.result.task_results[0].evidence.search_state, 'NOT_EXECUTED');
    assert.equal(out.result.task_results[0].canonical.confirmed_count, 0);
  });
});

test('Case F: no Recommendation, Winner, or Final Decision artifacts are generated', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Compare A and B on cost and safety. Success means compatibility.',
      language: 'en'
    }, tenant);
    assertNoNormativeDecisionArtifacts(out.result, out.material.text);
    assert.equal(out.result.perspective_expansion.mode, 'MATERIAL_ONLY');
    assert.deepEqual(out.result.perspective_expansion.candidates, []);
    assert.equal(out.result.perspective_expansion.selected, null);
    assert.match(out.material.text, /(?:Astera.*does not.*recommend|Astera自身は.*Recommendation.*行わない)/i);
    assert.match(out.material.text, /08 Re-instruction to Main AI \/ User|08 主役AI/);
  });
});

test('Case G: five lanes project independently from the same CCR without cross-lane authority', () => {
  const task = {
    id: 'T01',
    source_span: { start: 0, end: 30, text: 'API tokenを本番deployで公開する。' },
    raw_text: 'API tokenを本番deployで公開する。',
    target: 'API token',
    objective: 'API tokenの本番変更条件を検証する',
    action: 'implement',
    constraints: ['rollback可能であること'],
    prohibitions: ['secretを公開しない'],
    preserve: [],
    replace: ['API token'],
    conditions: ['検証成功時のみ実行'],
    exceptions: [],
    completion_criteria: [],
    hard_blockers: []
  };
  const domain = {
    primary: { id: 'G29', risk_lens: ['secret exposure'], multi_lens: ['compatibility'], compare_lens: ['scope'] }
  };
  const plan = buildCanonicalTaskPlan(task, domain);
  const canonical = evaluateCanonicalTaskPlan(plan, {
    schema_version: 'astera.evidence-search.result.v1',
    status: 'NOT_REQUIRED',
    evidence: [],
    provider_execution: { initial: [], reinforcement: [] },
    quality: { final: { status: 'NOT_REQUIRED', score_bp: null } },
    ai_used: false,
    payment_executed: false
  });

  const claims = canonical.records.map((record) => record.claim);
  const results = canonical.records.map((record) => record.confirmation);
  const policyByClaimId = Object.fromEntries(canonical.records.map((record) => [record.claim.claim_id, record.policy]));

  const fact = factLane(claims, results, domain);
  const risk = riskLane(claims, results, task, domain);
  const multi = multiLane(claims, results, domain, task, plan.search_plan);
  const inquiry = inquiryLane(claims, results, domain, task);
  const compare = compareLane(claims, results, policyByClaimId, domain, task);
  const bundled = buildFiveLanes({ claims, results, policyByClaimId, task, domain, searchPlan: plan.search_plan });

  assert.equal(fact.lane, 'fact');
  assert.equal(risk.lane, 'risk');
  assert.equal(multi.lane, 'multi');
  assert.equal(inquiry.lane, 'inquiry');
  assert.equal(compare.lane, 'compare');
  assert.equal(risk.source, 'CANONICAL_RECORDS_PLUS_POLICY_TASK_AND_LENS_PLAN');
  assert.ok(multi.perspectives.every((item) => item.source?.startsWith('CANONICAL') || item.source === 'LENS_PLAN'));
  assert.equal(compare.selected_candidate, null);
  assert.deepEqual(compare.candidate_ranking, []);

  const mutatedFactConfirmed = {
    ...fact,
    confirmed: [{ claim_id: 'FORGED', text: 'forged confirmed fact', status: 'CONFIRMED' }]
  };
  assert.notDeepEqual(mutatedFactConfirmed.confirmed, fact.confirmed);
  assert.deepEqual(risk, riskLane(claims, results, task, domain));
  assert.deepEqual(multi, multiLane(claims, results, domain, task, plan.search_plan));
  assert.deepEqual(inquiry, inquiryLane(claims, results, domain, task));
  assert.deepEqual(compare, compareLane(claims, results, policyByClaimId, domain, task));
  assert.deepEqual(bundled.fact, fact);
  assert.deepEqual(bundled.risk, risk);
});

test('Case H: Main8 sections remain fixed at 01-08', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'APIを改善する。成功条件は互換性を維持すること。',
      language: 'ja'
    }, tenant);
    assert.deepEqual(out.result.judgment.order, MAIN8_ORDER);
    assert.equal(out.result.judgment.order.length, 8);
    assert.equal(Object.hasOwn(out.result.judgment, '09_extra'), false);
    assert.equal(Object.hasOwn(out.result.judgment, '07_recommendation'), false);
    for (let index = 0; index < MAIN8_ORDER.length; index += 1) {
      const key = MAIN8_ORDER[index];
      assert.ok(out.result.judgment[key].label, `${key} missing label`);
      assert.ok(out.result.judgment[key].canonical_label, `${key} missing canonical_label`);
    }
    assert.equal((out.material.text.match(/^---$/gm) || []).length, 7);
  });
});

test('Case I: public boundary ignores forged preparedRequest task graph injection', async () => {
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
    assert.equal(out.result.analysis_task_packet.tasks.some((item) => item.id === 'ATTACK-T1'), false);
    assert.ok(out.result.analysis_task_packet.tasks.every((item) => String(item.id).startsWith('T')));
  });
});

test('Case J: low-signal routing abstains instead of defaulting to G01', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'APIサーバーのシステム開発を改善する。契約条件を確認する。'
    }, tenant);
    const routes = out.result.judgment.lens_routing.per_task;
    const tasks = out.result.analysis_task_packet.tasks;
    assert.equal(Object.keys(routes).length, tasks.length);
    assert.equal(routes[tasks[0].id].primary?.id, 'G29');
    assert.equal(routes[tasks[1].id].primary, null);
    assert.equal(routes[tasks[1].id].classification_basis, 'ABSTAIN_LOW_SIGNAL');
    assert.notEqual(routes[tasks[1].id].primary?.id, 'G01');

    const domain = routeDomainTemplates({ question: '契約条件を確認する。' });
    assert.equal(domain.primary, null);
    assert.equal(domain.classification_basis, 'ABSTAIN_LOW_SIGNAL');
    assert.notEqual(domain.primary?.id, 'G01');
  });
});
