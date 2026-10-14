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
        slot_id: `${owner}:LENS:${channel}:${i + 1}`,
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
  const searchRequired = current.length > 0 || task?.evidence_need?.required === true;
  // A local-only request must not be exported to network providers just because a
  // generic requirement such as decision criteria is not yet resolved.
  if (!searchRequired) {
    return deepFreeze({
      ...existingPlan,
      material_evidence_plan: {
        schema_version: 'astera.material-evidence-plan.v1',
        search_authorized: false, required_slot_ids: targets.map(t => t.slot_id),
        planned_slot_ids: [], unplanned_slot_ids: targets.map(t => t.slot_id),
        coverage_complete: targets.length === 0
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

module.exports = { LIMIT, materialTargets, materialEvidencePlan, requestGraphForTask };
