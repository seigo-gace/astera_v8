'use strict';

// The decision-backward Requirement Graph owns the material *needs*.
// Claim policies own confirmation. This adapter only adds scoped search work;
// it never creates a confirmed Claim from a search result.
const { createQueryId, deepFreeze, sanitizeQueryTerm } = require('../v4-canonical/core');
const { lensPlanEntries } = require('../lens-plan');

const LIMIT = 128; // Evidence Search upstream-search-plan API maximum.
const QUERY_VERSION = 'material-requirement-evidence-v1';
const GAP = new Set(['MISSING', 'UNRESOLVED', 'CONFLICTING']);
const EXTERNALLY_RESEARCHABLE = new Set([
  'DECISION_CRITERION', 'FALSIFICATION_OR_DISQUALIFIER',
  'ASSUMPTION_VALIDATION', 'UNRESOLVED_ITEM', 'SUBQUESTION_ANSWER',
  'OBSERVATION_VALIDATION', 'EVIDENCE_SUPPORT', 'COMPARISON_BASIS'
]);
const LENS_CHANNELS = Object.freeze(['fact', 'risk', 'multi', 'inquiry', 'compare', 'evidence']);
const ROLES = Object.freeze(['OFFICIAL', 'COUNTER']);
const REQUIRED_MATERIAL_PRIORITY = Object.freeze({
  FALSIFICATION_OR_DISQUALIFIER: 0,
  COMPARISON_BASIS: 1,
  DECISION_CRITERION: 2,
  OBSERVATION_VALIDATION: 3,
  ASSUMPTION_VALIDATION: 4,
  EVIDENCE_SUPPORT: 5,
  UNRESOLVED_ITEM: 6,
  SUBQUESTION_ANSWER: 7
});
function planningPriority(target) {
  // A missing safety counterexample and the basis for comparing options must
  // not be silently pushed behind a large set of generic subquestions.
  // This only changes execution ordering; it does not drop or resolve slots.
  const kind = target?.material_kind;
  const base = REQUIRED_MATERIAL_PRIORITY[kind];
  return Number.isInteger(base) ? base : (String(kind || '').startsWith('LENS_') ? 8 : 9);
}
function prioritizedMaterialTargets(targets) {
  return targets.map((value, index) => ({ value, index })).sort((a, b) =>
    planningPriority(a.value) - planningPriority(b.value)
    || (a.value.status === 'CONFLICTING' ? -1 : 0) - (b.value.status === 'CONFLICTING' ? -1 : 0)
    || a.index - b.index
  ).map(row => row.value);
}

const LENS_REQUIREMENT_LINKS = Object.freeze({
  fact: ['OBSERVATION_VALIDATION', 'ASSUMPTION_VALIDATION', 'SUBQUESTION_ANSWER', 'EVIDENCE_SUPPORT'],
  risk: ['FALSIFICATION_OR_DISQUALIFIER'],
  multi: ['FALSIFICATION_OR_DISQUALIFIER', 'DECISION_CRITERION'],
  inquiry: ['UNRESOLVED_ITEM', 'SUBQUESTION_ANSWER', 'EVIDENCE_SUPPORT'],
  compare: ['COMPARISON_BASIS', 'DECISION_CRITERION'],
  evidence: ['EVIDENCE_SUPPORT', 'OBSERVATION_VALIDATION', 'ASSUMPTION_VALIDATION']
});


function clean(value) {
  return String(value ?? '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function requestGraphForTask(task, graph) {
  const requests = Array.isArray(graph?.requests) ? graph.requests : [];
  const requestId = clean(task?.request_id);
  if (requestId) return requests.find((row) => clean(row.owner_request_id) === requestId) || null;
  return requests.length === 1 ? requests[0] : null;
}

function selectRequestMaterialOwners(tasks = [], graph = {}) {
  const grouped = new Map();
  for (const task of tasks) {
    const request = requestGraphForTask(task, graph);
    const id = clean(request?.owner_request_id || task?.request_id || task?.id);
    if (!id) continue;
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(task);
  }
  const owners = new Map();
  for (const [id, group] of grouped) {
    const preferred = group.find(task =>
      task?.evidence_need?.required === true ||
      (Array.isArray(task?.canonical_plan?.search_plan?.queries) &&
       task.canonical_plan.search_plan.queries.length > 0)
    );
    // When no task requires external Evidence, keep the full unsatisfied
    // requirement inventory on the first task WITHOUT authorizing network search.
    owners.set(id, clean((preferred || group[0]).id));
  }
  return owners;
}

function materialTargets(task, graph, domain = {}, { ownsRequest = true } = {}) {
  const row = requestGraphForTask(task, graph);
  const out = [];
  if (row && ownsRequest) {
    for (const node of (Array.isArray(row.nodes) ? row.nodes : [])) {
      const sourceBackedDisqualifier = node.material_kind === 'FALSIFICATION_OR_DISQUALIFIER'
        && node.status === 'SATISFIED'
        && node.truth_state === 'SOURCE_BACKED_RULE_OR_CONTEXT';
      if (node.required === false ||
          (!GAP.has(node.status) && !sourceBackedDisqualifier) ||
          !EXTERNALLY_RESEARCHABLE.has(node.material_kind)) continue;
      out.push({
        slot_id: node.slot_id,
        owner_request_id: row.owner_request_id,
        source: 'DECISION_BACKWARD_MATERIAL_REQUIREMENT',
        material_kind: node.material_kind,
        question: clean(node.question),
        status: node.status,
        applicability: 'APPLICABLE_REQUIRED',
        applicability_reason: 'UNRESOLVED_OR_SOURCE_SPECIFIED_GRAPH_REQUIREMENT',
        linked_requirement_slot_ids: [node.slot_id]
      });
    }
  }
  // A routed specialist Lens alone is NOT evidence that every generic phrase
  // in every channel must be searched. Preserve its full candidate set,
  // but give each external query a case-specific Requirement owner.
  // Missing/uncertain applicability is DEFERRED, never silently NOT_APPLICABLE
  // and never interpreted as SATISFIED.
  const owner = clean(task?.request_id || row?.owner_request_id || task?.id);
  const links = ownsRequest ? out.filter(item =>
    item.source === 'DECISION_BACKWARD_MATERIAL_REQUIREMENT') : [];
  for (const channel of LENS_CHANNELS) {
    const entries = lensPlanEntries(domain, channel) || [];
    const sourceTerm = clean(task?.source_span?.text || task?.raw_text || task?.target || '').toLowerCase();
    const scoped = links.filter(item => LENS_REQUIREMENT_LINKS[channel].includes(item.material_kind));
    const seen = new Set();
    let ordinal = 0;
    for (const entry of entries) {
      const term = clean(entry?.value);
      if (!term || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      ordinal += 1;
      const tiers = (entry?.sources || []).map(item => item.tier);
      const primarySpecialist = tiers.some(tier =>
        ['PRIMARY','PRIMARY_BREADTH','REQUEST_SPECIALIST'].includes(tier));
      // A secondary/overlay specialist can also become applicable through
      // explicit source/requirement scope. Generic channel placeholder wording
      // does NOT on its own establish the specialist subdomain.
      const meaningfulParts = term.split(/[・;；,、/]/u)
        .map(part => clean(part).toLowerCase()).filter(part => part.length >= 5);
      const directMatch = meaningfulParts.some(part =>
        sourceTerm.includes(part) || scoped.some(item =>
          clean(item.question).toLowerCase().includes(part) &&
          item.applicability === 'APPLICABLE_REQUIRED'
        ));
      const applicable = scoped.length > 0 && (primarySpecialist || directMatch);
      out.push({
        slot_id: `${owner}:${clean(task?.id || 'TASK')}:LENS:${channel}:${ordinal}`,
        owner_request_id: owner,
        source: 'ADDITIVE_SPECIALIST_LENS',
        material_kind: `LENS_${channel.toUpperCase()}`,
        question: term,
        status: 'UNRESOLVED',
        applicability: applicable ? 'APPLICABLE_REQUIRED' : 'DEFERRED_APPLICABILITY_UNKNOWN',
        applicability_reason: applicable
          ? (primarySpecialist
              ? `REQUIRED_BY_${channel.toUpperCase()}_PRIMARY_SPECIALIST_REQUIREMENT`
              : `REQUIRED_BY_${channel.toUpperCase()}_EXPLICIT_SOURCE_SCOPE`)
          : scoped.length > 0
            ? `SECONDARY_OR_OVERLAY_${channel.toUpperCase()}_APPLICABILITY_NOT_ESTABLISHED`
            : `NO_REQUEST_LOCAL_${channel.toUpperCase()}_REQUIREMENT_LINK`,
        linked_requirement_slot_ids: scoped.map(item => item.slot_id),
        lens_source_tiers: tiers
      });
    }
  }
  return out;
}

function materialEvidencePlan(task, graph, domain, existingPlan, options = {}) {
  const current = existingPlan?.search_plan?.queries || [];
  const targets = materialTargets(task, graph, domain, options);
  const graphEvidenceRequested = options.ownsRequest !== false && Boolean(
    requestGraphForTask(task, graph)?.nodes?.some(node =>
      node?.required !== false && node?.material_kind === 'EVIDENCE_SUPPORT'
      && GAP.has(node.status))
  );
  const searchRequired = current.length > 0 || task?.evidence_need?.required === true || graphEvidenceRequested;
  // A local-only request must not be exported to network providers just because a
  // generic requirement such as decision criteria is not yet resolved.
  if (!searchRequired) {
    return deepFreeze({
      ...existingPlan,
      material_evidence_plan: {
        schema_version: 'astera.material-evidence-plan.v1',
        search_authorized: false, required_slot_ids: targets.map(t => t.slot_id),
        planned_slot_ids: [], unplanned_slot_ids: targets.map(t => t.slot_id),
        coverage_complete: targets.length === 0,
        unplanned_reasons: targets.map(t => ({
          slot_id: t.slot_id,
          reason: t.applicability === 'DEFERRED_APPLICABILITY_UNKNOWN'
            ? 'DEFERRED_APPLICABILITY_UNKNOWN' : 'EXTERNAL_SEARCH_NOT_AUTHORIZED'
        })),
        deferred_slot_ids: targets.filter(t => t.applicability === 'DEFERRED_APPLICABILITY_UNKNOWN').map(t => t.slot_id),
        targets
      }
    });
  }

  const queries = [...current];
  const planned = [], unplanned = [], deferred = [], unplannedReasons = [];
  const objective = clean(task?.target || task?.purpose || task?.objective || task?.source_span?.text).slice(0, 320);
  const domainId = clean(domain?.primary?.id) || null;
  for (const target of prioritizedMaterialTargets(targets)) {
    if (target.applicability !== 'APPLICABLE_REQUIRED') {
      unplanned.push(target.slot_id);
      deferred.push(target.slot_id);
      unplannedReasons.push({slot_id: target.slot_id, reason: 'DEFERRED_APPLICABILITY_UNKNOWN'});
      continue;
    }
    if (queries.length + ROLES.length > LIMIT) {
      unplanned.push(target.slot_id);
      unplannedReasons.push({slot_id: target.slot_id, reason: 'PLAN_QUERY_LIMIT'});
      continue;
    }
    const subject = sanitizeQueryTerm(`${objective} ${target.question}`).slice(0, 600);
    if (!subject) {
      unplanned.push(target.slot_id);
      unplannedReasons.push({slot_id: target.slot_id, reason: 'EMPTY_SEARCH_SUBJECT'});
      continue;
    }
    const claimId = `material-requirement:${target.slot_id}`;
    for (const role of ROLES) {
      const queryText = role === 'COUNTER'
        ? `${subject} 反例 例外 失敗条件`
        : `${subject} 公式 一次資料 根拠`;
      queries.push({
        query_id: createQueryId({ claimId, queryRole: role, normalizedQueryText: queryText, queryTemplateVersion: QUERY_VERSION }),
        claim_id: claimId,
        role, text: queryText, normalized_query_text: queryText,
        domain_filter: domainId, domain_id: domainId,
        query_template_version: QUERY_VERSION,
        requirement_slot_id: target.slot_id,
        owner_request_id: target.owner_request_id,
        material_kind: target.material_kind
      });
    }
    planned.push(target.slot_id);
  }
  const roleList = [...new Set(queries.map(q => q.role))].sort();
  return deepFreeze({
    ...existingPlan,
    search_plan: {
      ...existingPlan.search_plan,
      queries,
      planned_query_roles: roleList
    },
    material_evidence_plan: {
      schema_version: 'astera.material-evidence-plan.v1',
      search_authorized: true,
      required_slot_ids: targets.map(t => t.slot_id),
      planned_slot_ids: planned,
      unplanned_slot_ids: unplanned,
      unplanned_reasons: unplannedReasons,
      deferred_slot_ids: deferred,
      coverage_complete: unplanned.length === 0,
      // These are search plans, not verified facts or adopted Evidence.
      targets
    }
  });
}


function materialEvidenceExecution(canonicalPlan = {}, rawEvidence = null, normalizedEvidence = null) {
  const plan = canonicalPlan.material_evidence_plan || {};
  const queries = canonicalPlan.search_plan?.queries || [];
  const planned = new Set(plan.planned_slot_ids || []);
  const queryExecutions = [
    ...(Array.isArray(rawEvidence?.query_execution?.initial) ? rawEvidence.query_execution.initial : []),
    ...(Array.isArray(rawEvidence?.query_execution?.reinforcement) ? rawEvidence.query_execution.reinforcement : [])
  ];
  const accepted = normalizedEvidence?.state === 'VALID';
  const adoptedById = new Map();
  if (accepted) for (const candidate of (rawEvidence?.evidence || [])) {
    if (candidate.candidate_id) adoptedById.set(String(candidate.candidate_id), candidate);
    if (candidate.canonical_record_id) adoptedById.set(String(candidate.canonical_record_id), candidate);
  }
  const requirements = (plan.targets || []).map(target => {
    const scopedQueries = queries.filter(q => q.requirement_slot_id === target.slot_id);
    const executions = queryExecutions.filter(record => scopedQueries.some(q =>
      (record.query_id === q.query_id ||
        (String(record.query_id || '').startsWith('retry_') &&
          String(record.query_id).endsWith('_' + q.query_id)))
      && (!record.claim_id || record.claim_id === q.claim_id)
    ));
    const attributed = new Map();
    for (const record of executions) {
      if (record.status !== 'FOUND') continue;
      for (const provider of (record.provider_records || [])) {
        if (provider.status !== 'FOUND') continue;
        for (const id of (provider.candidate_record_ids || [])) {
          const candidate = adoptedById.get(String(id));
          if (!candidate) continue;
          const key = String(candidate.candidate_id || candidate.canonical_record_id || '');
          if (!key || attributed.has(key)) continue;
          attributed.set(key, {
            candidate_id: key,
            canonical_record_id: candidate.canonical_record_id || null,
            provider_id: provider.provider_id || candidate.provider_id || null,
            source_family_id: candidate.source_family_id || null,
            source_url: candidate.canonical_locator?.url || null,
            query_id: record.query_id
          });
        }
      }
    }
    // Executed search != adopted evidence != confirmed claim.
    const adoptedRefs = [...attributed.values()];
    const search_status = !planned.has(target.slot_id)
      ? 'NOT_PLANNED'
      : !executions.length
        ? 'NOT_EXECUTED_OR_UNATTRIBUTED'
        : attributed.size > 0 ? 'ADOPTED_EVIDENCE_ATTRIBUTED_REQUIREMENT_UNCONFIRMED'
          : executions.some(q => String(q.status).toUpperCase() === 'FOUND')
          ? 'CANDIDATES_FOUND_NOT_BOUND'
          : executions.some(q => String(q.status).toUpperCase() === 'RETRIEVAL_FAILED')
            ? 'RETRIEVAL_FAILED'
            : 'NO_ATTRIBUTED_EVIDENCE';
    return {
      slot_id: target.slot_id,
      owner_request_id: target.owner_request_id,
      material_kind: target.material_kind,
      source: target.source,
      question: target.question,
      applicability: target.applicability || 'APPLICABLE_REQUIRED',
      applicability_reason: target.applicability_reason || null,
      linked_requirement_slot_ids: target.linked_requirement_slot_ids || [],
      planning_status: planned.has(target.slot_id) ? 'PLANNED'
        : target.applicability === 'DEFERRED_APPLICABILITY_UNKNOWN'
          ? 'DEFERRED_APPLICABILITY_UNKNOWN' : 'NOT_PLANNED',
      search_status,
      adopted_evidence_refs: adoptedRefs,
      // Requirement-to-Claim evidence validation is still separate.
      confirmation_status: 'UNRESOLVED'
    };
  });
  return deepFreeze({
    schema_version: 'astera.material-evidence-execution.v1',
    planning_complete: plan.coverage_complete === true,
    required_count: requirements.length,
    search_execution_count: queryExecutions.length,
    attributed_adopted_count: requirements.reduce((sum, row) => sum + row.adopted_evidence_refs.length, 0),
    unresolved_count: requirements.length,
    requirements
  });
}

module.exports = { LIMIT, materialTargets, materialEvidencePlan, requestGraphForTask, selectRequestMaterialOwners, materialEvidenceExecution };
