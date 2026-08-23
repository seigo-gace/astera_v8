'use strict';

const AsteraServerWithEvidence = require('./server-with-evidence');
const AsteraEngine = require('./astera-engine');
const { evaluate } = require('./quality-completion-evaluator');
const { AsteraModuleSwitch } = require('./astera-module-switch');
const { sanitizePublicDecisionInput } = require('./canonical-public-input');

const MODULE_SWITCH_REQUEST_LIMIT = 1024 * 1024;

function apiError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

class AsteraServerWithModuleSwitch extends AsteraServerWithEvidence {
  constructor(options = {}) {
    const engine = options.engine || new AsteraEngine({ poolSize: Number(options.poolSize || 4), logger: options.logger });
    super({ ...options, engine });
    this.qualityEvaluator = options.qualityEvaluator || evaluate;
    if (typeof this.qualityEvaluator !== 'function') {
      throw new TypeError('qualityEvaluator must be a function');
    }
    this.moduleSwitch = options.moduleSwitch || new AsteraModuleSwitch({
      decisionMaterials: ({ input, tenant }) => this._executeDecisionMaterials(input, tenant),
      evidenceSearch: ({ input, tenant, requestId }) => this._executeEvidenceSearch(input, tenant, requestId),
      qualityGate: ({ input }) => this.qualityEvaluator(input)
    });
  }

  async _executeDecisionMaterials(input, tenant) {
    if (typeof input.question !== 'string' || !input.question.trim()) {
      throw apiError('INVALID_QUESTION', 'decision-materials input.question must be a non-empty string', 400);
    }
    if (input.context !== undefined && typeof input.context !== 'string') {
      throw apiError('INVALID_CONTEXT', 'decision-materials input.context must be a string', 400);
    }
    return this.engine.process(sanitizePublicDecisionInput(input), tenant);
  }

  async _executeEvidenceSearch(input, tenant, requestId) {
    if (!this.evidenceClient) {
      throw apiError('EVIDENCE_SEARCH_NOT_CONFIGURED', 'evidence search is not configured', 503);
    }
    if (input.paid_search?.enabled === true) {
      throw apiError('PAID_SEARCH_DISABLED', 'paid search is disabled; free providers only', 400);
    }
    return this.evidenceClient.search(
      {
        ...input,
        request_id: requestId,
        tenant_id: tenant.id,
        paid_search: { enabled: false }
      },
      { requestId, tenantId: tenant.id }
    );
  }

  async _handle(req, res, context = { tenantId: 'anonymous' }) {
    const pathname = String(req.url || '').split('?')[0];
    const isSwitch = req.method === 'POST' && pathname === '/v1/astera/execute';
    if (!isSwitch) return super._handle(req, res, context);

    try {
      if (this._requiresHttps(req)) {
        return this._json(req, res, 426, { error: 'https_required', hint: 'Set HTTPS at the reverse proxy or send X-Forwarded-Proto: https.' });
      }
      if (req.headers.origin && !this._corsOriginFor(req)) {
        return this._json(req, res, 403, { error: 'cors_origin_denied' });
      }

      const tenant = await this._authenticate(req);
      if (!tenant) {
        return this._json(req, res, 401, { error: 'unauthorized', hint: 'X-API-Key header is required. Provision tenant credentials outside the Astera Core runtime.' });
      }
      context.tenantId = tenant.id;

      const limits = this.tenants.limitsFor(tenant);
      const rate = this.limiter.check({ key: `module-switch:${tenant.id}`, limit: limits.perMinute, windowMs: 60_000 });
      if (!rate.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate });

      const body = await this._readJsonObject(req, MODULE_SWITCH_REQUEST_LIMIT);
      const moduleResult = await this.moduleSwitch.execute({
        target: body.target,
        input: body.input,
        context: { tenant, requestId: req.requestId }
      });

      const moduleStatus = moduleResult?.status
        || moduleResult?.result?.comparison?.verdict?.decision
        || 'ok';
      this.meter.record({
        tenant,
        route: '/v1/astera/execute',
        units: 1,
        status: String(moduleStatus),
        meta: { target: body.target }
      });
      this.logger.write({
        tenantId: tenant.id,
        type: 'astera_module_switch_completed',
        text: `Astera module switch executed ${body.target}`,
        payload: { request_id: req.requestId, target: body.target, status: moduleStatus }
      });

      return this._json(req, res, 200, {
        schema_version: 'astera.module-switch.result.v1',
        request_id: req.requestId,
        target: body.target,
        module_result: moduleResult
      });
    } catch (error) {
      const requested = Number(error?.status);
      const status = requested >= 400 && requested <= 599 ? requested : 500;
      this.logger.write({
        tenantId: context.tenantId,
        type: 'astera_module_switch_failed',
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
}

module.exports = AsteraServerWithModuleSwitch;
