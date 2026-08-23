'use strict';

const crypto = require('node:crypto');
const CanonicalAsteraEngine = require('./canonical-astera-engine');

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
        score_bp: 0,
        reasons: ['PROVIDER_FAILURE']
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

function suppliedEvidence(input, taskId, taskCount) {
  const byTask = input.taskEvidencePackets || input.task_evidence_packets || {};
  if (byTask && typeof byTask === 'object' && byTask[taskId]) return byTask[taskId];
  const globalEvidence = input.evidencePacket || input.evidence_packet || null;
  return taskCount === 1 ? globalEvidence : null;
}

function searchRequestFor(task, upstreamPlan, input, tenant, requestId) {
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
    request_id: requestId,
    tenant_id: tenant.id
  };
}

class CanonicalEvidenceAutoEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    this.evidenceSearchClient = options.evidenceSearchClient || null;
  }

  setEvidenceSearchClient(client) {
    this.evidenceSearchClient = client || null;
    return this;
  }

  async process(input = {}, tenant = { id: 'unknown' }) {
    const initial = await super.process(input, tenant);
    if (initial?.result?.type !== 'cognitive_map') return initial;

    const taskResults = Array.isArray(initial.result.task_results) ? initial.result.task_results : [];
    const requiringSearch = taskResults.filter((result) => {
      const queries = result?.task?.canonical_plan?.search_plan?.queries;
      return Array.isArray(queries) && queries.length > 0;
    });
    if (!requiringSearch.length) return initial;

    const existingByTask = input.taskEvidencePackets || input.task_evidence_packets || {};
    const mergedByTask = { ...(existingByTask && typeof existingByTask === 'object' ? existingByTask : {}) };
    const missing = requiringSearch.filter((result) => !suppliedEvidence(input, result.task.id, taskResults.length));
    if (!missing.length) return initial;

    await Promise.all(missing.map(async (result) => {
      const task = result.task;
      const upstreamPlan = task.canonical_plan.search_plan;
      const requestId = `auto-evidence:${tenant.id}:${task.id}:${crypto.randomUUID()}`;
      if (!this.evidenceSearchClient || typeof this.evidenceSearchClient.search !== 'function') {
        const error = new Error('Evidence Search API client is not configured');
        error.code = 'EVIDENCE_SEARCH_NOT_CONFIGURED';
        mergedByTask[task.id] = {
          ...failedEvidence(task.id, error),
          planning_authority: 'UPSTREAM_CANONICAL',
          planned_query_roles: upstreamPlan.planned_query_roles || []
        };
        return;
      }
      try {
        const payload = searchRequestFor(task, upstreamPlan, input, tenant, requestId);
        const packet = await this.evidenceSearchClient.search(payload, {
          requestId,
          tenantId: tenant.id
        });
        mergedByTask[task.id] = {
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
        mergedByTask[task.id] = {
          ...failedEvidence(task.id, error),
          planning_authority: 'UPSTREAM_CANONICAL',
          planned_query_roles: upstreamPlan.planned_query_roles || []
        };
      }
    }));

    return super.process({
      ...input,
      preparedRequest: initial.result.request_model,
      taskEvidencePackets: mergedByTask
    }, tenant);
  }
}

module.exports = CanonicalEvidenceAutoEngine;
module.exports.searchRequestFor = searchRequestFor;
module.exports.failedEvidence = failedEvidence;
