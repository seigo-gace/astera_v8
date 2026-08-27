'use strict';

const crypto = require('node:crypto');

const SEARCH_STATES = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED',
  NOT_EXECUTED: 'NOT_EXECUTED',
  EXECUTED_NO_EVIDENCE: 'EXECUTED_NO_EVIDENCE',
  EXECUTED_WITH_EVIDENCE: 'EXECUTED_WITH_EVIDENCE',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED'
});

function executionSummary(packet = {}) {
  const providerRuns = [
    ...(Array.isArray(packet.provider_execution?.initial) ? packet.provider_execution.initial : []),
    ...(Array.isArray(packet.provider_execution?.reinforcement) ? packet.provider_execution.reinforcement : [])
  ];
  const queryRuns = [
    ...(Array.isArray(packet.query_execution?.initial) ? packet.query_execution.initial : []),
    ...(Array.isArray(packet.query_execution?.reinforcement) ? packet.query_execution.reinforcement : [])
  ];
  const fulfilled = providerRuns.filter((item) => String(item.status || '').toUpperCase() === 'FULFILLED').length;
  const failed = providerRuns.filter((item) => String(item.status || '').toUpperCase() !== 'FULFILLED').length;
  const found = queryRuns.filter((item) => String(item.status || '').toUpperCase() === 'FOUND').length;
  const notFound = queryRuns.filter((item) => String(item.status || '').toUpperCase() === 'NOT_FOUND').length;
  const queryFailed = queryRuns.filter((item) => String(item.status || '').toUpperCase() === 'RETRIEVAL_FAILED').length;
  const evidenceCount = Array.isArray(packet.evidence) ? packet.evidence.length : 0;
  return Object.freeze({
    provider_attempt_count: providerRuns.length,
    provider_fulfilled_count: fulfilled,
    provider_failed_count: failed,
    query_count: queryRuns.length,
    query_found_count: found,
    query_not_found_count: notFound,
    query_failed_count: queryFailed,
    evidence_count: evidenceCount
  });
}

function deriveSearchState(packet = {}) {
  if (String(packet.status || '').toUpperCase() === 'NOT_REQUIRED') return SEARCH_STATES.NOT_REQUIRED;
  const summary = executionSummary(packet);
  if (summary.provider_attempt_count === 0) return SEARCH_STATES.NOT_EXECUTED;
  if (summary.provider_fulfilled_count === 0) return SEARCH_STATES.FAILED;
  if (summary.evidence_count > 0) {
    return summary.provider_failed_count || summary.query_failed_count
      ? SEARCH_STATES.PARTIAL
      : SEARCH_STATES.EXECUTED_WITH_EVIDENCE;
  }
  if (summary.query_count > 0 && summary.query_not_found_count === summary.query_count) {
    return SEARCH_STATES.EXECUTED_NO_EVIDENCE;
  }
  return summary.provider_failed_count || summary.query_failed_count
    ? SEARCH_STATES.PARTIAL
    : SEARCH_STATES.PARTIAL;
}

function failedEvidence(taskId, error, searchState = SEARCH_STATES.FAILED) {
  const notExecuted = searchState === SEARCH_STATES.NOT_EXECUTED;
  const status = notExecuted ? 'REJECTED_SEARCH_NOT_EXECUTED' : 'REJECTED_SEARCH_FAILED';
  return {
    schema_version: 'astera.evidence-search.result.v1',
    status,
    search_state: searchState,
    search_execution: {
      attempted: !notExecuted,
      completed: false,
      error_code: error?.code || (notExecuted ? 'EVIDENCE_SEARCH_NOT_EXECUTED' : 'EVIDENCE_SEARCH_FAILED')
    },
    task_id: taskId,
    evidence: [],
    coverage: { discovery_scope_state: notExecuted ? 'NOT_EXECUTED' : 'UNKNOWN' },
    quality: {
      final: {
        status,
        phase: 'FINAL',
        score_bp: 0,
        blocking_reasons: [notExecuted ? 'SEARCH_NOT_EXECUTED' : 'SEARCH_FAILED']
      }
    },
    provider_execution: {
      initial: notExecuted ? [] : [{
        provider_id: 'task_evidence_search',
        status: 'REJECTED',
        error_code: error?.code || 'EVIDENCE_SEARCH_FAILED'
      }],
      reinforcement: []
    },
    query_execution: { initial: [], reinforcement: [] },
    ai_used: false,
    payment_executed: false
  };
}

function evidenceQuestion(task) {
  const values = [task.target || '', task.source_span?.text || '']
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)].join('\\n') || String(task.objective || '');
}

function evidenceContext(task, bodyContext) {
  const values = [
    task.purpose || '',
    task.objective || '',
    ...(task.premises || []),
    ...(task.constraints || []),
    ...(task.prohibitions || []),
    ...(task.preserve || []),
    ...(task.conditions || []),
    ...(task.exceptions || []),
    ...(task.verification || []),
    task.source_span?.text || '',
    bodyContext || ''
  ].map((value) => String(value || '').trim()).filter(Boolean);
  return [...new Set(values)].join('\\n');
}

function searchRequestFor(task, input, tenant, requestId) {
  const upstreamPlan = task.canonical_plan?.search_plan;
  if (!upstreamPlan || !Array.isArray(upstreamPlan.queries) || !upstreamPlan.queries.length) return null;

  const domain = task.domain || {};
  const domainId = domain.primary?.id;
  if (!/^G(?:0[1-9]|[12][0-9]|3[0-8])$/.test(String(domainId || ''))) {
    const error = new Error('canonical task requires Evidence Search but domain lens is unresolved');
    error.code = 'DOMAIN_LENS_UNRESOLVED';
    throw error;
  }

  return {
    question: evidenceQuestion(task),
    context: evidenceContext(task, input.context || ''),
    domain_lens: {
      id: domainId,
      ...(domain.primary?.taxonomy_version ? { taxonomy_version: domain.primary.taxonomy_version } : {})
    },
    overlays: (domain.overlays || []).map((overlay) => overlay.id).filter(Boolean).slice(0, 16),
    upstream_search_plan: upstreamPlan,
    preplanned_queries: upstreamPlan.queries,
    search: { free_projection: true, free_current: true },
    paid_search: { enabled: false },
    ...(Array.isArray(input.evidence_search?.provider_allowlist) ? { provider_allowlist: input.evidence_search.provider_allowlist } : {}),
    ...(Array.isArray(input.evidence_search?.provider_denylist) ? { provider_denylist: input.evidence_search.provider_denylist } : {}),
    ...(Number.isInteger(input.evidence_search?.maximum_results) ? { maximum_results: input.evidence_search.maximum_results } : {}),
    ...(Number.isInteger(input.evidence_search?.deadline_ms) ? { deadline_ms: input.evidence_search.deadline_ms } : {}),
    request_id: requestId,
    tenant_id: tenant.id
  };
}

function cancellationError() {
  const error = new Error('evidence search cancelled by request boundary');
  error.code = 'EVIDENCE_API_CANCELLED';
  error.status = 499;
  return error;
}

async function resolveTaskEvidence({ client, task, input = {}, tenant = { id: 'unknown' }, signal = null }) {
  const upstreamPlan = task.canonical_plan?.search_plan;
  if (!upstreamPlan?.queries?.length) return null;
  if (signal?.aborted) throw cancellationError();

  const requestId = `auto-evidence:${tenant.id}:${task.id}:${crypto.randomUUID()}`;
  if (!client || typeof client.search !== 'function') {
    const error = new Error('Evidence Search API client is not configured');
    error.code = 'EVIDENCE_SEARCH_NOT_CONFIGURED';
    return {
      ...failedEvidence(task.id, error, SEARCH_STATES.NOT_EXECUTED),
      planning_authority: 'UPSTREAM_CANONICAL',
      planned_query_roles: upstreamPlan.planned_query_roles || []
    };
  }

  try {
    const payload = searchRequestFor(task, input, tenant, requestId);
    const packet = await client.search(payload, { requestId, tenantId: tenant.id, signal });
    const searchState = deriveSearchState(packet);
    const summary = executionSummary(packet);
    return {
      ...packet,
      search_state: searchState,
      search_execution: { attempted: searchState !== SEARCH_STATES.NOT_EXECUTED, completed: ![SEARCH_STATES.NOT_EXECUTED, SEARCH_STATES.FAILED].includes(searchState), ...summary },
      planning_authority: 'UPSTREAM_CANONICAL',
      planned_query_roles: upstreamPlan.planned_query_roles || [],
      query_plan: {
        planning_authority: 'UPSTREAM_CANONICAL',
        planned_query_roles: upstreamPlan.planned_query_roles || [],
        query_ids: upstreamPlan.queries.map((query) => query.query_id)
      }
    };
  } catch (error) {
    if (signal?.aborted || error?.code === 'EVIDENCE_API_CANCELLED') throw error;
    return {
      ...failedEvidence(task.id, error, SEARCH_STATES.FAILED),
      planning_authority: 'UPSTREAM_CANONICAL',
      planned_query_roles: upstreamPlan.planned_query_roles || []
    };
  }
}

module.exports = {
  SEARCH_STATES,
  deriveSearchState,
  executionSummary,
  resolveTaskEvidence,
  searchRequestFor,
  failedEvidence,
  evidenceQuestion,
  evidenceContext
};
