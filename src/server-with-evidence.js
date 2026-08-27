'use strict';

const AsteraServer = require('./server');
const EvidenceSearchClient = require('./evidence-search/api/client');
const { isSkillApiConfigured } = require('./auth/skill-api-key');
const { createRequestAbortContext } = require('./request-abort-context');

const EVIDENCE_REQUEST_LIMIT = 256 * 1024;
const INTEGRATED_REQUEST_LIMIT = 1024 * 1024;

function evidenceClientConfigured(options = {}) {
  return Boolean(
    options.evidenceClient
    || options.internalSecret
    || options.internalSecretFile
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE
  );
}

function taskGraphView(request = {}) {
  const packet = request.analysis_task_packet || {};
  return {
    task_count: (packet.tasks || []).length,
    dependencies: packet.dependencies || [],
    execution_waves: packet.execution_waves || [],
    branches: packet.branches || [],
    branch_groups: packet.branch_groups || [],
    reference_resolutions: packet.reference_resolutions || [],
    context_bindings: packet.context_bindings || [],
    unresolved: packet.unresolved || [],
    hard_blockers: packet.hard_blockers || [],
    validation: packet.task_graph_validation || null
  };
}

function integratedEvidenceByTask(result = {}) {
  return Object.fromEntries((result.task_results || []).map((entry) => {
    const evidence = entry.evidence || {};
    const searchPlan = entry.task?.canonical_plan?.search_plan || {};
    const queryIds = Array.isArray(searchPlan.queries)
      ? searchPlan.queries.map((query) => query.query_id)
      : [];
    return [entry.task?.id, {
      schema_version: 'astera.evidence.integrated-view.v1',
      status: evidence.source_status || (evidence.state === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : evidence.state || 'UNKNOWN'),
      state: evidence.state || 'UNKNOWN',
      search_state: evidence.search_state || (evidence.state === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : 'UNKNOWN'),
      evidence: evidence.evidence || [],
      quality_score_bp: evidence.quality_score_bp ?? null,
      coverage_state: evidence.coverage_state || 'UNKNOWN',
      conflict_detected: evidence.conflict_detected === true,
      eligibility_reasons: evidence.eligibility_reasons || [],
      provider_failures: evidence.provider_failures || [],
      planning_authority: 'UPSTREAM_CANONICAL',
      planned_query_roles: searchPlan.planned_query_roles || [],
      query_plan: {
        planning_authority: 'UPSTREAM_CANONICAL',
        planned_query_roles: searchPlan.planned_query_roles || [],
        query_ids: queryIds
      }
    }];
  }).filter(([taskId]) => Boolean(taskId)));
}

function aggregateEvidence(byTask) {
  const entries = Object.entries(byTask);
  const searched = entries.filter(([, value]) => value.status !== 'NOT_REQUIRED');
  if (!searched.length) {
    return {
      status: 'NOT_REQUIRED',
      searched_task_count: 0,
      valid_task_count: 0,
      rejected_task_count: 0,
      evidence: []
    };
  }
  const valid = searched.filter(([, value]) => value.state === 'VALID' || value.status === 'FINAL_VALID');
  const rejected = searched.filter(([, value]) => value.state === 'REJECTED' || String(value.status || '').startsWith('REJECTED'));
  return {
    status: valid.length === searched.length
      ? 'FINAL_VALID'
      : rejected.length === searched.length
        ? 'REJECTED_TASK_EVIDENCE'
        : 'PARTIAL_TASK_EVIDENCE',
    searched_task_count: searched.length,
    valid_task_count: valid.length,
    rejected_task_count: rejected.length,
    evidence: searched.flatMap(([taskId, value]) =>
      (value.evidence || []).map((item) => ({ task_id: taskId, ...item })))
  };
}

function claimSummary(result = {}) {
  const canonical = result.canonical_claims || {};
  return {
    status: canonical.status || 'UNDETERMINED',
    claim_count: canonical.claim_count || 0,
    confirmed_count: canonical.confirmed_count || 0,
    undetermined_count: canonical.undetermined_count || 0
  };
}

function safeEvidenceOptions(body = {}) {
  const source = body.evidence_search && typeof body.evidence_search === 'object'
    ? body.evidence_search
    : {};
  if (source.paid_search?.enabled === true) {
    const error = new Error('paid search is disabled; free providers only');
    error.code = 'PAID_SEARCH_DISABLED';
    error.status = 400;
    throw error;
  }
  return {
    ...(Array.isArray(source.provider_allowlist) ? { provider_allowlist: source.provider_allowlist } : {}),
    ...(Array.isArray(source.provider_denylist) ? { provider_denylist: source.provider_denylist } : {}),
    ...(Number.isInteger(source.maximum_results) ? { maximum_results: source.maximum_results } : {}),
    ...(Number.isInteger(source.deadline_ms) ? { deadline_ms: source.deadline_ms } : {})
  };
}

class AsteraServerWithEvidence extends AsteraServer {
  constructor(options = {}) {
    super(options);
    this.evidenceClient = options.evidenceClient || (evidenceClientConfigured(options)
      ? new EvidenceSearchClient({
          baseUrl: options.evidenceBaseUrl,
          timeoutMs: options.evidenceTimeoutMs,
          internalSecret: options.internalSecret,
          internalSecretFile: options.internalSecretFile,
          fetch: options.fetch
        })
      : null);
    if (typeof this.engine?.setEvidenceSearchClient === 'function') {
      this.engine.setEvidenceSearchClient(this.evidenceClient);
    }
  }

  async _handle(req, res, context = { tenantId: 'anonymous' }) {
    const pathname = String(req.url || '').split('?')[0];
    const isIntegrated = req.method === 'POST' && pathname === '/v1/integrated/process';
    const isPublicEvidence = req.method === 'POST' && pathname === '/v1/evidence/search';
    const isSkillEvidence = req.method === 'POST' && pathname === '/v1/skill/evidence/search';
    if (!isIntegrated && !isPublicEvidence && !isSkillEvidence) return super._handle(req, res, context);

    try {
      if (this._requiresHttps(req)) {
        return this._json(req, res, 426, { error: 'https_required', hint: 'Set HTTPS at the reverse proxy or send X-Forwarded-Proto: https.' });
      }
      if (req.headers.origin && !this._corsOriginFor(req)) {
        return this._json(req, res, 403, { error: 'cors_origin_denied' });
      }
      if (!this.evidenceClient) return this._json(req, res, 503, { error: 'evidence_search_not_configured' });

      const tenant = isSkillEvidence ? await this._authenticateSkill(req) : await this._authenticate(req);
      if (isSkillEvidence && !isSkillApiConfigured()) return this._json(req, res, 503, { error: 'skill_api_not_configured' });
      if (!tenant) {
        return this._json(req, res, 401, {
          error: 'unauthorized',
          hint: isSkillEvidence
            ? 'Valid ASTERA_SKILL_API_KEY is required.'
            : 'X-API-Key header is required. Provision tenant credentials outside the Astera Core runtime.'
        });
      }
      context.tenantId = tenant.id;

      if (!isSkillEvidence) {
        const limits = this.tenants.limitsFor(tenant);
        const rate = this.limiter.check({
          key: `${isIntegrated ? 'integrated' : 'evidence'}:${tenant.id}`,
          limit: limits.perMinute,
          windowMs: 60_000
        });
        if (!rate.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate });
      }

      if (isIntegrated) return this._handleIntegrated(req, res, context, tenant);

      const body = await this._readJsonObject(req, EVIDENCE_REQUEST_LIMIT);
      if (body.paid_search?.enabled === true) {
        const error = new Error('paid search is disabled; free providers only');
        error.code = 'PAID_SEARCH_DISABLED';
        error.status = 400;
        throw error;
      }
      const requestExecution = createRequestAbortContext(req, res);
      let result;
      try {
        result = await this.evidenceClient.search(
          { ...body, request_id: req.requestId, tenant_id: tenant.id, paid_search: { enabled: false } },
          { requestId: req.requestId, tenantId: tenant.id, signal: requestExecution.signal }
        );
      } finally {
        requestExecution.dispose();
      }
      if (!isSkillEvidence) {
        this.meter.record({
          tenant,
          route: '/v1/evidence/search',
          units: 1,
          status: result.status,
          meta: {
            evidence_count: Array.isArray(result.evidence) ? result.evidence.length : 0,
            final_score_bp: result.quality?.final?.score_bp ?? null
          }
        });
      }
      this.logger.write({
        tenantId: tenant.id,
        type: 'evidence_search_proxy_completed',
        text: `Evidence search proxy returned ${result.status}`,
        payload: {
          request_id: req.requestId,
          access_mode: isSkillEvidence ? 'owner_skill_private' : 'tenant',
          status: result.status,
          evidence_count: Array.isArray(result.evidence) ? result.evidence.length : 0,
          final_score_bp: result.quality?.final?.score_bp ?? null
        }
      });
      return this._json(req, res, 200, result);
    } catch (error) {
      const requestedStatus = Number(error?.status);
      const status = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
      this.logger.write({
        tenantId: context.tenantId,
        type: 'evidence_or_integrated_failed',
        severity: status >= 500 ? 'error' : 'warn',
        text: `${req.method} ${pathname} failed`,
        payload: { request_id: req.requestId, status, error_code: error.code || 'INTERNAL_ERROR' }
      });
      return this._json(req, res, status, {
        error: status >= 500 ? 'internal_error' : error.message,
        code: error.code || 'INTERNAL_ERROR',
        status,
        requestId: req.requestId
      });
    }
  }

  async _handleIntegrated(req, res, context, tenant) {
    const body = await this._readJsonObject(req, INTEGRATED_REQUEST_LIMIT);
    if (typeof body.question !== 'string' || !body.question.trim()) {
      const error = new Error('question must be a non-empty string');
      error.code = 'INVALID_QUESTION';
      error.status = 400;
      throw error;
    }
    if (body.context !== undefined && typeof body.context !== 'string') {
      const error = new Error('context must be a string');
      error.code = 'INVALID_CONTEXT';
      error.status = 400;
      throw error;
    }

    const evidenceSearch = safeEvidenceOptions(body);
    const requestExecution = createRequestAbortContext(req, res);
    let decision;
    try {
      decision = await this.engine.process({
        question: body.question,
        context: body.context || '',
        language: body.language,
        locale: body.locale,
        output_language: body.output_language,
        moodAnswers: body.moodAnswers || {},
        evidence_search: evidenceSearch
      }, tenant, { signal: requestExecution.signal });
    } finally {
      requestExecution.dispose();
    }

    const request = decision.result?.request_model || {};
    if (decision.result?.type === 'task_graph_blocked') {
      const hardBlockers = decision.result.hard_blockers || request.analysis_task_packet?.hard_blockers || [];
      this.logger.write({
        tenantId: tenant.id,
        type: 'integrated_task_graph_blocked',
        severity: 'warn',
        text: 'Integrated processing stopped before Evidence Search because Task Graph contains a hard blocker.',
        payload: { request_id: req.requestId, hard_blockers: hardBlockers, unresolved: decision.result.unresolved || [] }
      });
      return this._json(req, res, 422, {
        schema_version: 'astera.integrated.blocked.v1',
        request_id: req.requestId,
        non_ai: true,
        status: 'TASK_GRAPH_BLOCKED',
        instruction_understanding: decision.result.instruction_understanding || null,
        task_graph: taskGraphView(request),
        evidence: { status: 'NOT_STARTED', searched_task_count: 0, valid_task_count: 0, rejected_task_count: 0, by_task: {} },
        canonical: { status: 'NOT_STARTED', by_task: {} },
        decision_materials: null
      });
    }

    if (decision.result?.type !== 'cognitive_map') {
      return this._json(req, res, 422, {
        schema_version: 'astera.integrated.clarification.v1',
        request_id: req.requestId,
        non_ai: true,
        status: 'CLARIFICATION_REQUIRED',
        instruction_understanding: decision.result?.instruction_understanding || null,
        task_graph: taskGraphView(request),
        questions: decision.result?.questions || [],
        decision_materials: { result: decision.result, material: decision.material, runtime: decision.runtime }
      });
    }

    const evidenceByTask = integratedEvidenceByTask(decision.result);
    const evidenceSummary = aggregateEvidence(evidenceByTask);
    const claims = claimSummary(decision.result);
    const canonicalByTask = decision.result.canonical_claims?.per_task || {};

    this.meter.record({
      tenant,
      route: '/v1/integrated/process',
      units: 1,
      status: claims.status,
      meta: {
        instruction_mode: decision.result.instruction_understanding?.mode || 'UNKNOWN',
        evidence_status: evidenceSummary.status,
        claim_status: claims.status,
        searched_task_count: evidenceSummary.searched_task_count,
        confirmed_claim_count: claims.confirmed_count,
        undetermined_claim_count: claims.undetermined_count,
        ai_used: false
      }
    });
    this.logger.write({
      tenantId: tenant.id,
      type: 'integrated_process_completed',
      text: `Integrated single pipeline completed: evidence=${evidenceSummary.status} claims=${claims.status}`,
      payload: {
        request_id: req.requestId,
        task_count: taskGraphView(request).task_count,
        searched_task_count: evidenceSummary.searched_task_count,
        evidence_status: evidenceSummary.status,
        claim_status: claims.status,
        confirmed_claim_count: claims.confirmed_count,
        undetermined_claim_count: claims.undetermined_count,
        ai_used: false
      }
    });

    return this._json(req, res, 200, {
      schema_version: 'astera.integrated.result.v2',
      request_id: req.requestId,
      non_ai: true,
      instruction_understanding: decision.result.instruction_understanding || null,
      task_graph: taskGraphView(request),
      canonical: { claim_summary: claims, by_task: canonicalByTask },
      evidence: { ...evidenceSummary, by_task: evidenceByTask },
      decision_materials: { result: decision.result, material: decision.material, runtime: decision.runtime }
    });
  }
}

module.exports = AsteraServerWithEvidence;
module.exports.taskGraphView = taskGraphView;
module.exports.integratedEvidenceByTask = integratedEvidenceByTask;
