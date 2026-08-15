'use strict';

const KaguraServer = require('./server');
const EvidenceSearchClient = require('./evidence-search/api/client');
const { routeDomainTemplates } = require('./domain-template-router');
const { isSkillApiConfigured } = require('./auth/skill-api-key');

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

function validDomainId(value) {
  return /^G(?:0[1-9]|[12][0-9]|3[0-8])$/.test(String(value || ''));
}

class AsteraServerWithEvidence extends KaguraServer {
  constructor(options = {}) {
    super(options);
    this.evidenceClient = options.evidenceClient || (
      evidenceClientConfigured(options)
        ? new EvidenceSearchClient({
          baseUrl: options.evidenceBaseUrl,
          timeoutMs: options.evidenceTimeoutMs,
          internalSecret: options.internalSecret,
          internalSecretFile: options.internalSecretFile,
          fetch: options.fetch
        })
        : null
    );
  }

  async _handle(req, res, context = { tenantId: 'anonymous' }) {
    const pathname = String(req.url || '').split('?')[0];
    const isIntegrated = req.method === 'POST' && pathname === '/v1/integrated/process';
    const isPublicEvidence = req.method === 'POST' && pathname === '/v1/evidence/search';
    const isSkillEvidence = req.method === 'POST' && pathname === '/v1/skill/evidence/search';

    if (!isIntegrated && !isPublicEvidence && !isSkillEvidence) {
      return super._handle(req, res, context);
    }

    try {
      if (this._requiresHttps(req)) {
        return this._json(req, res, 426, {
          error: 'https_required',
          hint: 'Set HTTPS at the reverse proxy or send X-Forwarded-Proto: https.'
        });
      }
      if (req.headers.origin && !this._corsOriginFor(req)) {
        return this._json(req, res, 403, { error: 'cors_origin_denied' });
      }
      if (!this.evidenceClient) {
        return this._json(req, res, 503, { error: 'evidence_search_not_configured' });
      }

      const tenant = isSkillEvidence
        ? await this._authenticateSkill(req)
        : await this._authenticate(req);
      if (isSkillEvidence && !isSkillApiConfigured()) {
        return this._json(req, res, 503, { error: 'skill_api_not_configured' });
      }
      if (!tenant) {
        return this._json(req, res, 401, {
          error: 'unauthorized',
          hint: isSkillEvidence
            ? 'Valid ASTERA_SKILL_API_KEY is required.'
            : 'X-API-Key header is required. Use /signup first.'
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

      if (isIntegrated) {
        return this._handleIntegrated(req, res, context, tenant);
      }

      const body = await this._readJsonObject(req, EVIDENCE_REQUEST_LIMIT);
      if (body.paid_search?.enabled === true) {
        const error = new Error('paid search is disabled; free providers only');
        error.code = 'PAID_SEARCH_DISABLED';
        error.status = 400;
        throw error;
      }

      const result = await this.evidenceClient.search({
        ...body,
        request_id: req.requestId,
        tenant_id: tenant.id,
        paid_search: { enabled: false }
      }, {
        requestId: req.requestId,
        tenantId: tenant.id
      });

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

    const domain = routeDomainTemplates({ question: body.question, context: body.context || '' });
    const domainId = body.domain_lens?.id || domain.primary?.id;
    if (!validDomainId(domainId)) {
      const error = new Error('domain lens could not be resolved for evidence search');
      error.code = 'DOMAIN_LENS_UNRESOLVED';
      error.status = 422;
      throw error;
    }

    const evidenceOptions = body.evidence_search && typeof body.evidence_search === 'object'
      ? body.evidence_search
      : {};
    if (evidenceOptions.paid_search?.enabled === true) {
      const error = new Error('paid search is disabled; free providers only');
      error.code = 'PAID_SEARCH_DISABLED';
      error.status = 400;
      throw error;
    }

    const evidenceRequest = {
      question: body.question,
      context: body.context || '',
      domain_lens: {
        id: domainId,
        ...(domain.primary?.taxonomy_version ? { taxonomy_version: domain.primary.taxonomy_version } : {})
      },
      overlays: (domain.overlays || []).map((overlay) => overlay.id).filter(Boolean).slice(0, 16),
      search: { free_projection: true, free_current: true },
      paid_search: { enabled: false },
      ...(Array.isArray(evidenceOptions.conditions) ? { conditions: evidenceOptions.conditions } : {}),
      ...(Array.isArray(evidenceOptions.provider_allowlist) ? { provider_allowlist: evidenceOptions.provider_allowlist } : {}),
      ...(Array.isArray(evidenceOptions.provider_denylist) ? { provider_denylist: evidenceOptions.provider_denylist } : {}),
      ...(Number.isInteger(evidenceOptions.maximum_results) ? { maximum_results: evidenceOptions.maximum_results } : {}),
      ...(Number.isInteger(evidenceOptions.deadline_ms) ? { deadline_ms: evidenceOptions.deadline_ms } : {}),
      request_id: req.requestId,
      tenant_id: tenant.id
    };

    const evidence = await this.evidenceClient.search(evidenceRequest, {
      requestId: req.requestId,
      tenantId: tenant.id
    });

    const decision = await this.engine.process({
      question: body.question,
      context: body.context || '',
      language: body.language,
      output_language: body.output_language,
      moodAnswers: body.moodAnswers || {},
      evidencePacket: evidence
    }, tenant);

    this.meter.record({
      tenant,
      route: '/v1/integrated/process',
      units: 1,
      status: decision.result?.comparison?.verdict?.decision || 'ok',
      meta: {
        evidence_status: evidence.status || null,
        evidence_count: Array.isArray(evidence.evidence) ? evidence.evidence.length : 0,
        final_score_bp: evidence.quality?.final?.score_bp ?? null,
        ai_used: false
      }
    });

    this.logger.write({
      tenantId: tenant.id,
      type: 'integrated_process_completed',
      text: `Integrated process completed: evidence=${evidence.status || 'unknown'} decision=${decision.result?.comparison?.verdict?.decision || 'unknown'}`,
      payload: {
        request_id: req.requestId,
        evidence_status: evidence.status || null,
        evidence_count: Array.isArray(evidence.evidence) ? evidence.evidence.length : 0,
        decision: decision.result?.comparison?.verdict?.decision || null,
        ai_used: false
      }
    });

    return this._json(req, res, 200, {
      schema_version: 'astera.integrated.result.v1',
      request_id: req.requestId,
      non_ai: true,
      evidence: {
        status: evidence.status,
        quality: evidence.quality || null,
        coverage: evidence.coverage || null,
        evidence: evidence.evidence || []
      },
      decision_materials: {
        result: decision.result,
        material: decision.material,
        runtime: decision.runtime
      }
    });
  }
}

module.exports = AsteraServerWithEvidence;
