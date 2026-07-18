'use strict';

const KaguraServer = require('./server');
const EvidenceSearchClient = require('./evidence-search/api/client');
const { isSkillApiConfigured } = require('./auth/skill-api-key');

const EVIDENCE_REQUEST_LIMIT = 256 * 1024;

function evidenceClientConfigured(options = {}) {
  return Boolean(
    options.evidenceClient
    || options.internalSecret
    || options.internalSecretFile
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET
    || process.env.ASTERA_INTERNAL_SERVICE_SECRET_FILE
  );
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
    const isPublicEvidence = req.method === 'POST' && pathname === '/v1/evidence/search';
    const isSkillEvidence = req.method === 'POST' && pathname === '/v1/skill/evidence/search';

    if (!isPublicEvidence && !isSkillEvidence) {
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
        return this._json(req, res, 503, {
          error: 'evidence_search_not_configured'
        });
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
          key: `evidence:${tenant.id}`,
          limit: limits.perMinute,
          windowMs: 60_000
        });
        if (!rate.allowed) {
          return this._json(req, res, 429, {
            error: 'rate_limited',
            rate
          });
        }
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
            evidence_count: Array.isArray(result.evidence)
              ? result.evidence.length
              : 0,
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
          evidence_count: Array.isArray(result.evidence)
            ? result.evidence.length
            : 0,
          final_score_bp: result.quality?.final?.score_bp ?? null
        }
      });

      return this._json(req, res, 200, result);
    } catch (error) {
      const requestedStatus = Number(error?.status);
      const status = requestedStatus >= 400 && requestedStatus <= 599
        ? requestedStatus
        : 500;
      this.logger.write({
        tenantId: context.tenantId,
        type: 'evidence_search_proxy_failed',
        severity: status >= 500 ? 'error' : 'warn',
        text: `${req.method} ${pathname} failed`,
        payload: {
          request_id: req.requestId,
          status,
          error_code: error.code || 'INTERNAL_ERROR'
        }
      });
      return this._json(req, res, status, {
        error: status >= 500 ? 'internal_error' : error.message,
        code: error.code || 'INTERNAL_ERROR',
        status,
        requestId: req.requestId
      });
    }
  }
}

module.exports = AsteraServerWithEvidence;
