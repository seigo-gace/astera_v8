'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { POLICY_TRADE_OFF_NOTES, QUERY_ROLES, buildCanonicalTaskPlan } = require('../src/canonical-claim-runtime');
const { routeDomainTemplates } = require('../src/domain-template-router');
const { projectCanonicalTask } = require('../src/canonical-task-projection');

const tenant = { id: 'trace-test', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };
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
const MAIN8_JA_LABELS = Object.freeze([
  '01 本当の目的',
  '02 前提不足',
  '03 事実確認',
  '04 危機察知',
  '05 反対視点',
  '06 比較案',
  '07 根拠成立状態',
  '08 主役AI／利用者への再指示'
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

function queryExecution(queries = []) {
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
          { provider_id: `${query.role}-provider`, status: 'FOUND', candidate_record_ids: candidateRecordIds },
          { provider_id: 'ev-corroboration-provider', status: 'FOUND', candidate_record_ids: ['ev-corroboration-record'] }
        ]
      };
    }),
    reinforcement: []
  };
}

function validEvidence(claim, queries = []) {
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
      evidenceCandidate({ id: 'ev-corroboration', role: 'SECONDARY', family: 'corrob-family', authority: 'corrob-authority', claim, url: 'https://corroboration.test/evidence' }),
      evidenceCandidate({ id: 'ev-counter', role: 'SECONDARY', family: 'counter-family', authority: 'counter-authority', claim, url: 'https://counter.test/evidence' }),
      evidenceCandidate({ id: 'ev-unrelated', role: 'SECONDARY', family: 'unrelated-family', authority: 'unrelated-authority', claim: '完全に無関係な天気予報である。', url: 'https://unrelated.test/evidence' })
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

function dummyJudgmentSection(label) {
  return {
    label,
    summary: 'formatter-test',
    items: ['formatter-test-item'],
    decision_basis: {
      rule_ids: ['TEST-FORMATTER'],
      task_ids: ['T01'],
      lens_ids: [],
      evidence_refs: [],
      blocking_conditions: [],
      derivation: 'formatter internal test'
    }
  };
}

const REQUIRED_EVIDENCE_REF_FIELDS = Object.freeze([
  'claim_id',
  'binding_id',
  'candidate_id',
  'source_role',
  'source_family_id',
  'authority_id',
  'url'
]);

const M08_SUPPORT_EVIDENCE_REF_FIELDS = Object.freeze([
  'binding_id',
  'candidate_id',
  'source_role',
  'source_family_id',
  'authority_id',
  'url'
]);

function assertProductionEvidenceRef(ref, label = 'evidence_ref') {
  for (const field of REQUIRED_EVIDENCE_REF_FIELDS) {
    assert.notEqual(ref[field], null, `${field} must be non-null on ${label}`);
    assert.notEqual(ref[field], undefined, `${field} must be non-null on ${label}`);
  }
}

function assertM08SupportEvidenceRef(ref) {
  for (const field of M08_SUPPORT_EVIDENCE_REF_FIELDS) {
    assert.notEqual(ref[field], null, `${field} must be non-null on support_evidence_ref`);
    assert.notEqual(ref[field], undefined, `${field} must be non-null on support_evidence_ref`);
  }
}

function canonicalBindingForCandidate(projected, candidateId) {
  return projected.canonical.records
    .flatMap((record) => record.confirmation?.bindings || [])
    .find((binding) => binding.candidate_id === candidateId);
}

test('hard instruction contradiction stops before Task/Claim/Evidence and never fabricates Main8', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'APIを変更する。APIを変更するな。成功条件は互換性を維持することである。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.ok(out.result.hard_blockers.includes('PROHIBITION_REPLACE_OVERLAP'));
    assert.equal(out.result.task_processing_started, false);
    assert.equal(out.result.evidence_processing_started, false);
    assert.equal(out.runtime.blocked, true);
    assert.ok(out.runtime.hard_blockers.includes('PROHIBITION_REPLACE_OVERLAP'));
    assert.match(out.material.text, /Task Graphを安全に実行できないため/);
    assert.equal(out.result.judgment, undefined);
  } finally {
    await engine.destroy();
  }
});

test('all Main8 Decision Basis entries expose instruction understanding on an executable request', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'APIを検証する。成功条件は互換性を維持することである。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.deepEqual(out.result.judgment.order, [
      '01_purpose',
      '02_premise',
      '03_facts',
      '04_crisis',
      '05_opposition',
      '06_comparison',
      '07_evidence_status',
      '08_reinstruction'
    ]);
    for (const key of out.result.judgment.order) {
      const basis = out.result.judgment[key].decision_basis;
      assert.ok(basis.instruction_understanding);
      assert.equal(basis.instruction_understanding.mode, 'GLOBAL_LANGUAGE_ADAPTER');
      assert.ok(Array.isArray(basis.hard_blockers));
      assert.equal(basis.hard_blockers.length, 0);
      assert.ok(Array.isArray(basis.blocking_conditions));
    }
  } finally {
    await engine.destroy();
  }
});

test('unresolved deictic short request returns clarification instead of guessed Main8', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try {
    const out = await engine.process({ question: 'どう？', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'clarification_needed');
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.match(out.material.text, /確認が必要です/);
    assert.match(out.material.text, /対象/);
  } finally {
    await engine.destroy();
  }
});

test('Main8 05/06 preserve multi and comparison material for golden compare input', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'A案とB案を費用と安全性で比較する。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');

    const s05 = out.result.judgment['05_opposition'];
    const s06 = out.result.judgment['06_comparison'];
    const materialText = out.material.text;

    assert.ok(Array.isArray(s05.perspectives));
    assert.ok(Array.isArray(s05.expanded_perspectives));
    assert.ok(Array.isArray(s05.trade_off_map));
    assert.ok(s05.perspectives.length > 0);
    assert.ok(s05.perspectives.every((p) => String(p.id || p.class || '').toUpperCase() !== 'MAINLINE'));
    assert.ok(s05.expanded_perspectives.some((p) => p.id === 'opposition' || p.class === 'OPPOSITION'));
    assert.ok(s05.expanded_perspectives.every((p) => p.trade_off_material && typeof p.trade_off_material === 'object'));
    assert.ok(s05.expanded_perspectives.every((p) => Array.isArray(p.trade_off_material.dimensions)));
    assert.equal(Object.hasOwn(s05.expanded_perspectives[0].trade_off_material, 'score'), false);
    assert.equal(Object.hasOwn(s05.expanded_perspectives[0].trade_off_material, 'ranking'), false);
    assert.equal(Object.hasOwn(s05.expanded_perspectives[0].trade_off_material, 'winner'), false);

    const failureReference = s05.expanded_perspectives.find((p) => p.id === 'failure_reference');
    const humanFit = s05.expanded_perspectives.find((p) => p.id === 'human_fit');
    assert.ok(failureReference);
    assert.ok(humanFit);
    for (const policyNote of POLICY_TRADE_OFF_NOTES) {
      assert.equal(failureReference.trade_off_material.dimensions.includes(policyNote), false);
      assert.equal(humanFit.trade_off_material.dimensions.includes(policyNote), false);
    }
    assert.notEqual(failureReference.trade_off_material.status, 'MATERIAL_ONLY');
    assert.notEqual(humanFit.trade_off_material.status, 'MATERIAL_ONLY');
    assert.equal(failureReference.trade_off_material.status, 'INSUFFICIENT_TRADE_OFF_MATERIAL');
    assert.equal(humanFit.trade_off_material.status, 'INSUFFICIENT_TRADE_OFF_MATERIAL');

    assert.match(materialText, /Trade-off Material/);
    assert.match(materialText, /Candidates:/);
    assert.match(materialText, /Dimensions:/);
    assert.match(materialText, /Candidate Material:/);
    assert.match(materialText, /Trade-off Difference:/);
    assert.doesNotMatch(materialText, /dimensions=.*前進条件と反証/);
    assert.doesNotMatch(materialText, /dimensions=.*失敗回避材料/);
    assert.doesNotMatch(materialText, /dimensions=.*一括の勝者決定/);
    assert.doesNotMatch(materialText, /dimensions=.*Human Reader/);

    const sampleClaimId = s06.candidate_materials[0]?.undetermined_claim_ids?.[0]
      || s06.candidate_materials[0]?.confirmed_claim_ids?.[0]
      || s06.unsupported_scope[0]?.claim_id;
    if (sampleClaimId) {
      assert.match(materialText, new RegExp(sampleClaimId));
    }

    const sampleObservation = s06.candidate_materials[0]?.observations?.[0];
    if (sampleObservation) {
      assert.match(materialText, new RegExp(sampleObservation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(materialText, /candidate_id=candidate:1:A案/);
    assert.match(materialText, /label=A案/);
    assert.match(materialText, /dimension=費用/);

    assert.ok(s06.scope_booleans);
    assert.ok(s06.supported_scope);
    assert.ok(s06.unsupported_scope);
    assert.ok(s06.contradiction_map);
    assert.ok(s06.condition_differences && typeof s06.condition_differences === 'object');
    assert.deepEqual(s06.comparison_candidates.map((c) => c.label || c), ['A案', 'B案']);
    assert.ok(s06.dimensions.includes('費用') && s06.dimensions.includes('安全性'));
    assert.equal(s06.candidate_materials.length, 2);
    assert.ok(s06.trade_off_differences.length > 0);
    assert.ok(s06.trade_off_differences.every((d) => d.status === 'MATERIAL_ONLY' && Array.isArray(d.per_candidate)));
    assert.equal(s06.selected_candidate, null);
    assert.deepEqual(s06.candidate_ranking, []);
    assert.deepEqual(s06.rejected_candidates, []);
    assert.equal(out.result.comparison.material_only, true);
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.result.no_normative_decision_generated, true);
    assert.equal(out.result.judgment.no_normative_decision_generated, true);
    assert.equal(out.material.no_normative_decision_generated, true);

    if (s06.unsupported_scope.length) {
      const unsupported = s06.unsupported_scope[0];
      assert.match(materialText, new RegExp(unsupported.claim_id));
      if (unsupported.reasons?.length) {
        assert.match(materialText, new RegExp(unsupported.reasons[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    }
  } finally {
    await engine.destroy();
  }
});

test('Main8 05/06 HTTP lossless text preserves EN compare material', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'Compare A and B on cost and safety.',
      language: 'en'
    }, tenant);
    const s06 = out.result.judgment['06_comparison'];
    const materialText = out.material.text;

    const sampleClaimId = s06.candidate_materials[0]?.undetermined_claim_ids?.[0]
      || s06.candidate_materials[0]?.confirmed_claim_ids?.[0]
      || s06.unsupported_scope[0]?.claim_id;
    if (sampleClaimId) {
      assert.match(materialText, new RegExp(sampleClaimId));
    }

    const sampleObservation = s06.candidate_materials[0]?.observations?.[0];
    if (sampleObservation) {
      assert.match(materialText, new RegExp(sampleObservation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    assert.match(materialText, /candidate_id=candidate:1:A/);
    assert.match(materialText, /label=A/);
    assert.match(materialText, /dimension=cost/i);

    assert.match(materialText, /Candidate Material:/);
    assert.match(materialText, /Trade-off Difference:/);
    assert.match(materialText, /Per-candidate:/);
    assert.match(materialText, /Condition Differences:/);
    assert.match(materialText, /Unsupported Scope:/);
    assert.doesNotMatch(materialText, /A\[AVAILABLE/);
    assert.doesNotMatch(materialText, /cost\[MATERIAL/);
  } finally {
    await engine.destroy();
  }
});

test('Main8 06 HTTP text preserves evidence source identity from internal compare refs', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try {
    const compareRequest = engine.prepareRequest({
      question: 'A案とB案を費用と安全性で比較する。',
      language: 'ja'
    });
    const compareTask = compareRequest.analysis_task_packet.tasks[0];
    const claimRequest = engine.prepareRequest({
      question: 'A案の費用は公式根拠で検証する。',
      language: 'ja'
    });
    const claimTask = claimRequest.analysis_task_packet.tasks[0];
    const domain = routeDomainTemplates({ question: compareTask.source_span?.text || compareTask.target });
    const canonicalPlan = buildCanonicalTaskPlan(claimTask, domain);
    const claim = canonicalPlan.claims.find((entry) => String(entry.raw_text || '').includes('A案'));
    assert.ok(claim, 'expected claim with A案 in raw_text for compare candidate_materials');
    const projected = projectCanonicalTask({
      task: { ...compareTask, canonical_plan: canonicalPlan, domain },
      evidenceRaw: validEvidence(claim.raw_text, canonicalPlan.search_plan.queries)
    });
    const compare = projected.lanes.compare;
    const aMaterial = compare.candidate_materials.find((entry) => entry.label === 'A案');
    assert.ok(aMaterial, 'expected A案 candidate material');
    assert.ok(aMaterial.evidence_refs.length >= 1, 'expected evidence_refs on A案 candidate material without overwrite');
    for (const ref of aMaterial.evidence_refs) {
      assertProductionEvidenceRef(ref, 'candidate_materials evidence_ref');
    }
    const officialRef = aMaterial.evidence_refs.find((ref) => ref.candidate_id === 'ev-official');
    assert.ok(officialRef, 'expected ev-official evidence_ref on A案 candidate material');
    assert.equal(officialRef.source_role, 'OFFICIAL');
    assert.equal(officialRef.source_family_id, 'official-family');
    assert.equal(officialRef.authority_id, 'official-authority');
    assert.equal(officialRef.url, 'https://official.test/evidence');
    const canonicalOfficialBinding = canonicalBindingForCandidate(projected, 'ev-official');
    assert.ok(canonicalOfficialBinding, 'expected ev-official binding in canonical.records confirmation.bindings');
    assert.equal(officialRef.binding_id, canonicalOfficialBinding.evidence_binding_id);

    const perspectivesWithEvidence = projected.perspective_expansion.perspectives.filter(
      (perspective) => Array.isArray(perspective.support_evidence_refs) && perspective.support_evidence_refs.length > 0
    );
    assert.ok(perspectivesWithEvidence.length >= 1, 'expected perspectives with support_evidence_refs');
    for (const perspective of perspectivesWithEvidence) {
      for (const ref of perspective.support_evidence_refs) {
        assertM08SupportEvidenceRef(ref);
        assert.ok(Object.hasOwn(ref, 'relation'), 'support_evidence_ref must have relation key');
        assert.ok(Object.hasOwn(ref, 'query_role'), 'support_evidence_ref must have query_role key');
        assert.equal(ref.relation, 'SUPPORTS');
      }
    }

    const counterRefs = projected.perspective_expansion.perspectives
      .flatMap((perspective) => perspective.counter_evidence_refs || []);
    const counterCandidate = counterRefs.find((ref) => ref.candidate_id === 'ev-counter');
    if (counterCandidate) {
      assert.equal(counterCandidate.query_role, QUERY_ROLES.COUNTER);
    }

    const judgment = {
      format: 'astera_judgment_v4',
      output_language: 'ja',
      order: [...MAIN8_ORDER]
    };
    for (let index = 0; index < MAIN8_ORDER.length; index += 1) {
      const key = MAIN8_ORDER[index];
      if (key === '06_comparison') {
        judgment[key] = {
          ...dummyJudgmentSection(MAIN8_JA_LABELS[index]),
          comparison_candidates: compare.comparison_candidates,
          dimensions: compare.dimensions,
          candidate_materials: compare.candidate_materials,
          trade_off_differences: compare.trade_off_differences,
          condition_differences: compare.condition_differences || {},
          contradiction_map: compare.contradiction_map || [],
          supported_scope: compare.supported_scope || [],
          unsupported_scope: compare.unsupported_scope || []
        };
      } else if (key === '05_opposition') {
        judgment[key] = {
          ...dummyJudgmentSection(MAIN8_JA_LABELS[index]),
          expanded_perspectives: projected.perspective_expansion.perspectives
        };
      } else {
        judgment[key] = dummyJudgmentSection(MAIN8_JA_LABELS[index]);
      }
    }
    const material = engine.material(judgment);
    const materialText = material.text;
    assert.match(materialText, new RegExp(`claim=${officialRef.claim_id}`));
    assert.match(materialText, new RegExp(`binding=${officialRef.binding_id}`));
    assert.match(materialText, new RegExp(`candidate=${officialRef.candidate_id}`));
    assert.match(materialText, new RegExp(`source_role=${officialRef.source_role}`));
    assert.match(materialText, new RegExp(`source_family_id=${officialRef.source_family_id}`));
    assert.match(materialText, new RegExp(`authority_id=${officialRef.authority_id}`));
    assert.match(materialText, new RegExp(`url=${officialRef.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(materialText, /relation=SUPPORTS/);
    if (counterCandidate) {
      assert.match(materialText, /query_role=COUNTER/);
    }
    assert.match(materialText, /candidate_id=candidate:1:A案/);
    assert.match(materialText, /Per-candidate:\ncandidate_id=candidate:1:A案/);
    assert.doesNotMatch(materialText, /"claim_id"/);
  } finally {
    await engine.destroy();
  }
});
