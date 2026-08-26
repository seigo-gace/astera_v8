'use strict';

const crypto = require('node:crypto');

function failedEvidence(taskId, error) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    status: 'REJECTED_PROVIDER_FAILURE',
    task_id: taskId,
    evidence: [],
    coverage: { discovery_scope_state: 'PARTIAL' },
    quality: {
      final: {
        status: 'REJECTED_PROVIDER_FAILURE',
        phase: 'FINAL',
        score_bp: 0,
        blocking_reasons: ['PROVIDER_FAILURE']
      }
    },
    provider_execution: {
      initial: [{
        provider_id: 'task_evidence_search',
        status: 'REJECTED',
        error_code: error?.code || 'PROVIDER_FAILURE'
      }],
      reinforcement: []
    },
    ai_used: false,
    payment_executed: false
  };
}

function evidenceQuestion(task) {
  const values = [task.target || '', task.source_span?.text || '']
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set(values)].join('\n') || String(task.objective || '');
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
  return [...new Set(values)].join('\n');
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
    search: {
      free_projection: true,
      free_current: true
    },
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
      ...failedEvidence(task.id, error),
      planning_authority: 'UPSTREAM_CANONICAL',
      planned_query_roles: upstreamPlan.planned_query_roles || []
    };
  }

  try {
    const payload = searchRequestFor(task, input, tenant, requestId);
    const packet = await client.search(payload, { requestId, tenantId: tenant.id, signal });
    return {
      ...packet,
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
      ...failedEvidence(task.id, error),
      planning_authority: 'UPSTREAM_CANONICAL',
      planned_query_roles: upstreamPlan.planned_query_roles || []
    };
  }
}

module.exports = {
  resolveTaskEvidence,
  searchRequestFor,
  failedEvidence,
  evidenceQuestion,
  evidenceContext
};
