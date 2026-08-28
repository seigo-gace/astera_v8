'use strict';

const { unique } = require('./judgment-materials-analyzer');
const { lensPlanEntries, lensPlanValues } = require('./lens-plan');
const { deepFreeze } = require('./v4-canonical/core');
const { fragmentInput } = require('./v4-canonical/fragmenter');
const { extractClaimsForTask } = require('./v4-canonical/claim-extractor');
const { QUERY_ROLES, policyForClaim } = require('./v4-canonical/policy-registry');
const { planQueriesForClaim, planTaskQueries } = require('./v4-canonical/query-planner');
const { bindClaimEvidence } = require('./v4-canonical/evidence-binding');
const { ClaimStatus, evaluateClaimConfirmation } = require('./v4-canonical/confirmation');
const { buildFiveLanes } = require('./v4-canonical/lanes');

const CONFIRMED = ClaimStatus.CONFIRMED;
const UNDETERMINED = ClaimStatus.UNDETERMINED;
const PERSPECTIVE_CLASSES = Object.freeze(['mainline', 'opposition', 'failure_reference', 'third_way', 'human_fit']);

function fragmentText(text, baseOffset = 0) {
  const result = fragmentInput({ inputDocumentId: `adhoc:${baseOffset}`, text, sourceAxes: {}, maxFragments: 256 });
  if (!baseOffset) return result.fragments;
  return deepFreeze(result.fragments.map((fragment) => ({
    ...fragment,
    span: { start: fragment.span.start + baseOffset, end: fragment.span.end + baseOffset },
    canonical_source_position: `${fragment.span.start + baseOffset}:${fragment.span.end + baseOffset}`
  })));
}

function claimsForTask(task, options = {}) {
  return extractClaimsForTask(task, options).claims;
}
function policyFor(claim) { return policyForClaim(claim); }
function queriesForClaim(claim, policy, domainId = null) {
  return planQueriesForClaim(claim, policy, { primary: domainId ? { id: domainId } : null });
}

function buildCanonicalTaskPlan(task, domain = {}, options = {}) {
  const extraction = extractClaimsForTask(task, {
    executionAt: options.executionAt || new Date().toISOString(),
    documentReferenceDate: options.documentReferenceDate || null,
    knownNames: options.knownNames || []
  });
  const policyByClaim = {};
  for (const claim of extraction.claims) policyByClaim[claim.claim_id] = policyForClaim(claim);
  const searchPlan = planTaskQueries(extraction.claims, policyByClaim, domain);
  return deepFreeze({
    schema_version: 'astera.canonical-task-plan.v2',
    task_id: task.id,
    fragments: extraction.fragments,
    unmapped_fragments: extraction.unmapped,
    diagnostics: extraction.diagnostics,
    claims: extraction.claims,
    policy_by_claim_id: policyByClaim,
    search_plan: {
      ...searchPlan,
      task_id: task.id,
      planned_query_roles: unique(searchPlan.queries.map((query) => query.role)).sort()
    }
  });
}

function evaluateCanonicalTaskPlan(plan, rawEvidence) {
  const records = plan.claims.map((claim) => {
    const policy = plan.policy_by_claim_id[claim.claim_id];
    const bindingResult = bindClaimEvidence(claim, policy, rawEvidence);
    const queries = plan.search_plan.queries.filter((query) => query.claim_id === claim.claim_id);
    const confirmation = evaluateClaimConfirmation({ claim, policy, bindings: bindingResult.bindings, queries, rawEvidence });
    const confirmationWithBindings = deepFreeze({ ...confirmation, bindings: bindingResult.bindings });
    return deepFreeze({ claim, policy, bindings: bindingResult.bindings, confirmation: confirmationWithBindings });
  });
  return deepFreeze({
    schema_version: 'astera.canonical-claim-records.v2',
    task_id: plan.task_id,
    search_plan: plan.search_plan,
    records,
    confirmed_count: records.filter((record) => record.confirmation.status === CONFIRMED).length,
    undetermined_count: records.filter((record) => record.confirmation.status === UNDETERMINED).length
  });
}

function projectFiveLanes({ task, canonical, domain = {} }) {
  const claims = (canonical.records || []).map((record) => record.claim);
  const results = (canonical.records || []).map((record) => record.confirmation);
  const policyByClaimId = Object.fromEntries((canonical.records || []).map((record) => [record.claim.claim_id, record.policy]));
  return buildFiveLanes({ claims, results, policyByClaimId, task, domain, searchPlan: canonical.search_plan || {} });
}

function uniqueStrings(values = []) {
  return unique(values.map((value) => String(value ?? '').trim()).filter(Boolean));
}

function recordBindingRefs(records = []) {
  const refs = [];
  for (const record of records) {
    const bindings = record.confirmation?.bindings || record.bindings || [];
    for (const binding of bindings) {
      refs.push({
        claim_id: record.claim?.claim_id || null,
        binding_id: binding.binding_id || null,
        candidate_id: binding.candidate_id || binding.evidence_id || null,
        source_role: binding.source_role || null,
        source_family_id: binding.source_family_id || null,
        authority_id: binding.authority_id || null,
        query_role: binding.query_role || binding.role || null,
        url: binding.url || binding.canonical_locator?.url || null
      });
    }
  }
  return [...new Map(refs.map((ref) => [JSON.stringify(ref), ref])).values()];
}

function unresolvedRefs(records = []) {
  return records
    .filter((record) => record.confirmation?.status !== CONFIRMED)
    .map((record) => ({
      claim_id: record.claim?.claim_id || null,
      text: record.claim?.raw_text || '',
      reasons: record.confirmation?.reasons || [],
      missing_scope_fields: record.confirmation?.gate_details?.missing_scope_fields || []
    }));
}

function buildTradeOffMaterial({
  dimensions = [],
  conditions = [],
  failureConditions = [],
  confirmedClaimIds = [],
  undeterminedClaimIds = [],
  supportEvidence = [],
  counterEvidence = [],
  missingEvidence = [],
  materialByDimension = null
}) {
  const normalizedDimensions = uniqueStrings(dimensions);
  const hasMaterial = normalizedDimensions.length > 0
    || conditions.length > 0
    || failureConditions.length > 0
    || confirmedClaimIds.length > 0
    || supportEvidence.length > 0
    || counterEvidence.length > 0;
  const status = hasMaterial ? 'MATERIAL_ONLY' : 'INSUFFICIENT_TRADE_OFF_MATERIAL';
  const material = {
    status,
    dimensions: normalizedDimensions,
    conditions: uniqueStrings(conditions),
    failure_conditions: uniqueStrings(failureConditions),
    confirmed_claim_ids: [...confirmedClaimIds].sort(),
    undetermined_claim_ids: [...undeterminedClaimIds].sort(),
    support_evidence_refs: supportEvidence,
    counter_evidence_refs: counterEvidence,
    missing_evidence_refs: missingEvidence
  };
  if (materialByDimension && typeof materialByDimension === 'object' && Object.keys(materialByDimension).length) {
    material.material_by_dimension = materialByDimension;
  }
  return deepFreeze(material);
}

function perspective({ id, focus, conditions = [], failureConditions = [], supportEvidence = [], counterEvidence = [], missingEvidence = [], tradeOffs = [], tradeOffMaterial = null, queryRoles = [], basis = {} }) {
  const confirmedClaimIds = basis.confirmed_claim_ids || [];
  const undeterminedClaimIds = basis.undetermined_claim_ids || [];
  const trade_off_material = tradeOffMaterial || buildTradeOffMaterial({
    dimensions: tradeOffs,
    conditions,
    failureConditions,
    confirmedClaimIds,
    undeterminedClaimIds,
    supportEvidence,
    counterEvidence,
    missingEvidence
  });
  return deepFreeze({
    id,
    class: id.toUpperCase(),
    focus,
    conditions: uniqueStrings(conditions),
    failure_conditions: uniqueStrings(failureConditions),
    support_evidence_refs: supportEvidence,
    counter_evidence_refs: counterEvidence,
    missing_evidence_refs: missingEvidence,
    trade_offs: uniqueStrings(tradeOffs),
    trade_off_material,
    query_roles: uniqueStrings(queryRoles),
    basis
  });
}

function deterministicPerspectiveExpansion({ task, canonical, domain = {} }) {
  const records = canonical?.records || [];
  const confirmedRecords = records.filter((record) => record.confirmation?.status === CONFIRMED);
  const undeterminedRecords = records.filter((record) => record.confirmation?.status !== CONFIRMED);
  const confirmed = confirmedRecords.length;
  const undetermined = undeterminedRecords.length;
  const lensIds = [
    ...(domain.primary?.id ? [domain.primary.id] : []),
    ...((domain.secondary || []).map((lens) => lens.id).filter(Boolean))
  ];
  const supportEvidence = recordBindingRefs(confirmedRecords);
  const allBindings = recordBindingRefs(records);
  const counterEvidence = allBindings.filter((ref) => ref.query_role === QUERY_ROLES.COUNTER);
  const missingEvidence = unresolvedRefs(records);
  const queries = canonical?.search_plan?.queries || [];
  const queryRoles = canonical?.search_plan?.planned_query_roles || unique(queries.map((query) => query.role)).sort();
  const counterQueries = queries.filter((query) => query.role === QUERY_ROLES.COUNTER);
  const constraints = uniqueStrings([...(task.constraints || []), ...(task.prohibitions || []), ...(task.preserve || [])]);
  const success = uniqueStrings([...(task.completion_criteria || []), ...(task.success_criteria || [])]);
  const domainRisks = lensPlanValues(domain, 'risk');
  const compareDimensions = lensPlanValues(domain, 'compare');
  const hardBlockers = uniqueStrings(task.hard_blockers || []);
  const unresolvedReasons = uniqueStrings(undeterminedRecords.flatMap((record) => record.confirmation?.reasons || []));

  const perspectives = [
    perspective({
      id: 'mainline',
      focus: task.objective || task.target || '',
      conditions: [...success, ...constraints],
      failureConditions: [...hardBlockers, ...unresolvedReasons],
      supportEvidence,
      counterEvidence,
      missingEvidence,
      tradeOffs: compareDimensions,
      queryRoles,
      basis: {
        rule_ids: ['PERSPECTIVE-MAINLINE-CANONICAL'],
        confirmed_claim_ids: confirmedRecords.map((record) => record.claim.claim_id).sort(),
        undetermined_claim_ids: undeterminedRecords.map((record) => record.claim.claim_id).sort(),
        lens_ids: lensIds
      }
    }),
    perspective({
      id: 'opposition',
      focus: uniqueStrings([...domainRisks, ...hardBlockers, ...unresolvedReasons, ...counterQueries.map((query) => query.text)]),
      conditions: counterQueries.map((query) => query.text),
      failureConditions: counterQueries.length ? [] : ['Counter query role is not represented in the current Search Plan.'],
      supportEvidence,
      counterEvidence,
      missingEvidence,
      tradeOffs: ['前進条件と反証・Failure Conditionを同時に保持する。', ...compareDimensions],
      queryRoles: [QUERY_ROLES.COUNTER],
      basis: {
        rule_ids: ['PERSPECTIVE-OPPOSITION-COUNTER'],
        counter_query_ids: counterQueries.map((query) => query.query_id).filter(Boolean),
        lens_ids: lensIds
      }
    }),
    perspective({
      id: 'failure_reference',
      focus: uniqueStrings([...hardBlockers, ...unresolvedReasons, ...domainRisks]),
      conditions: ['UNDETERMINEDをCONFIRMEDへ推測昇格しない。', ...constraints],
      failureConditions: uniqueStrings([...hardBlockers, ...unresolvedReasons]),
      supportEvidence,
      counterEvidence,
      missingEvidence,
      tradeOffs: ['失敗回避材料であり採用候補ではない。'],
      queryRoles,
      basis: {
        rule_ids: ['PERSPECTIVE-FAILURE-REFERENCE'],
        undetermined_count: undetermined,
        hard_blocker_count: hardBlockers.length,
        lens_ids: lensIds
      }
    }),
    perspective({
      id: 'third_way',
      focus: uniqueStrings([...(task.conditions || []), ...(task.exceptions || []), ...(task.depends_on || []).map((id) => `dependency:${id}`), ...compareDimensions]),
      conditions: uniqueStrings([...success, ...(task.conditions || []), ...(task.exceptions || []), ...(task.depends_on || []).map((id) => `dependency:${id}`)]),
      failureConditions: hardBlockers,
      supportEvidence,
      counterEvidence,
      missingEvidence,
      tradeOffs: ['成立条件ごとに材料を分離し、一括の勝者決定を行わない。', ...compareDimensions],
      queryRoles,
      basis: {
        rule_ids: ['PERSPECTIVE-THIRD-WAY-CONDITION-SPLIT'],
        dependency_count: (task.depends_on || []).length,
        condition_count: (task.conditions || []).length,
        exception_count: (task.exceptions || []).length,
        lens_ids: lensIds
      }
    }),
    perspective({
      id: 'human_fit',
      focus: uniqueStrings([task.target, task.objective, ...success, ...(task.preserve || []), ...(task.prohibitions || [])]),
      conditions: uniqueStrings([...success, ...constraints]),
      failureConditions: uniqueStrings([...(task.prohibitions || []), ...hardBlockers]),
      supportEvidence,
      counterEvidence,
      missingEvidence,
      tradeOffs: ['利用者明示条件への適合材料だけを扱い、Human Readerの状態推定で事実を書き換えない。'],
      queryRoles,
      basis: {
        rule_ids: ['PERSPECTIVE-HUMAN-FIT-EXPLICIT-CONDITIONS'],
        explicit_condition_count: success.length + constraints.length,
        lens_ids: lensIds
      }
    })
  ];

  return deepFreeze({
    engine: 'Astera Deterministic Perspective Expansion',
    mode: 'MATERIAL_ONLY',
    policy: {
      fixed_classes: [...PERSPECTIVE_CLASSES],
      ranking_allowed: false,
      selection_allowed: false,
      recommendation_allowed: false,
      final_decision_allowed: false
    },
    claim_state: { confirmed, undetermined },
    lens_ids: lensIds,
    perspectives,
    candidates: [],
    selected: null,
    rejected: []
  });
}

module.exports = {
  QUERY_ROLES,
  CONFIRMED,
  UNDETERMINED,
  PERSPECTIVE_CLASSES,
  fragmentText,
  claimsForTask,
  policyFor,
  queriesForClaim,
  buildCanonicalTaskPlan,
  evaluateCanonicalTaskPlan,
  projectFiveLanes,
  deterministicPerspectiveExpansion
};
