'use strict';

// The decision-backward Requirement Graph owns the material *needs*.
// Claim policies own confirmation. This adapter only adds scoped search work;
// it never creates a confirmed Claim from a search result.
const { createQueryId, deepFreeze, sanitizeQueryTerm } = require('../v4-canonical/core');
const { lensPlanValues } = require('../lens-plan');

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
      if (node.required === false || !GAP.has(node.status) || !EXTERNALLY_RESEARCHABLE.has(node.material_kind)) continue;
      out.push({
        slot_id: node.slot_id,
        owner_request_id: row.owner_request_id,
        source: 'DECISION_BACKWARD_MATERIAL_REQUIREMENT',
        material_kind: node.material_kind,
        question: clean(node.question),
        status: node.status
      });
    }
  }
  const owner = clean(task?.request_id || row?.owner_request_id || task?.id);
  for (const channel of LENS_CHANNELS) {
    const terms = [...new Set((lensPlanValues(domain, channel) || []).map(clean).filter(Boolean))];
    for (const [i, term] of terms.entries()) {
      out.push({
        slot_id: `${owner}:${clean(task?.id || "TASK")}:LENS:${channel}:${i + 1}`,
        owner_request_id: owner,
        source: 'ADDITIVE_SPECIALIST_LENS',
        material_kind: `LENS_${channel.toUpperCase()}`,
        question: term,
        status: 'UNRESOLVED'
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
        targets
      }
    });
  }

  const queries = [...current];
  const planned = [], unplanned = [];
  const objective = clean(task?.target || task?.purpose || task?.objective || task?.source_span?.text).slice(0, 320);
  const domainId = clean(domain?.primary?.id) || null;
  for (const target of targets) {
    if (queries.length + ROLES.length > LIMIT) {
      unplanned.push(target.slot_id);
      continue;
    }
    const subject = sanitizeQueryTerm(`${objective} ${target.question}`).slice(0, 600);
    if (!subject) {
      unplanned.push(target.slot_id);
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
      coverage_complete: unplanned.length === 0,
      // These are search plans, not verified facts or adopted Evidence.
      targets
    }
  });
}


function materialEvidenceExecution(canonicalPlan = {}, rawEvidence = null) {
  const plan = canonicalPlan.material_evidence_plan || {};
  const queries = canonicalPlan.search_plan?.queries || [];
  const planned = new Set(plan.planned_slot_ids || []);
  const queryExecutions = [
    ...(Array.isArray(rawEvidence?.query_execution?.initial) ? rawEvidence.query_execution.initial : []),
    ...(Array.isArray(rawEvidence?.query_execution?.reinforcement) ? rawEvidence.query_execution.reinforcement : [])
  ];
  const byQuery = new Map(queryExecutions.map(q => [String(q.query_id || ''), q]));
  const requirements = (plan.targets || []).map(target => {
    const scopedQueries = queries.filter(q => q.requirement_slot_id === target.slot_id);
    const executions = scopedQueries.map(q => byQuery.get(q.query_id)).filter(Boolean);
    // Executed search != adopted evidence != confirmed claim.
    const search_status = !planned.has(target.slot_id)
      ? 'NOT_PLANNED'
      : !executions.length
        ? 'NOT_EXECUTED_OR_UNATTRIBUTED'
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
      planning_status: planned.has(target.slot_id) ? 'PLANNED' : 'NOT_PLANNED',
      search_status,
      // Requirement-to-Claim evidence validation is still separate.
      confirmation_status: 'UNRESOLVED'
    };
  });
  return deepFreeze({
    schema_version: 'astera.material-evidence-execution.v1',
    planning_complete: plan.coverage_complete === true,
    required_count: requirements.length,
    search_execution_count: queryExecutions.length,
    unresolved_count: requirements.length,
    requirements
  });
}

module.exports = { LIMIT, materialTargets, materialEvidencePlan, requestGraphForTask, selectRequestMaterialOwners, materialEvidenceExecution };
