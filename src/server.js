'use strict';

const ServerBase = require('./server-base');
const CanonicalAsteraEngine = require('./canonical-astera-engine');
const { sanitizePublicDecisionInput } = require('./canonical-public-input');

function isLoopbackAddress(address = '') {
  return /^(127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/i.test(String(address || ''));
}

function isLoopbackHost(host = '') {
  return ['127.0.0.1', 'localhost', '::1'].includes(String(host || '').toLowerCase());
}

class AsteraServer extends ServerBase {
  constructor(options = {}) {
    const engine = options.engine || new CanonicalAsteraEngine({
      poolSize: Number(options.poolSize || 4),
      logger: options.logger
    });
    super({ ...options, engine });
  }

  async _authenticate(req) {
    const key = req.headers['x-api-key'];
    const localNoAuthRequested = (process.env.ASTERA_LOCAL_NO_AUTH || process.env.KAGURA_LOCAL_NO_AUTH) === '1';
    const localNoAuthAllowed = localNoAuthRequested
      && process.env.NODE_ENV !== 'production'
      && isLoopbackHost(this.host)
      && isLoopbackAddress(req.socket?.remoteAddress);

    if (!key && localNoAuthAllowed) {
      return { id: 'local-dev', plan: 'admin', status: 'active', is_global: true };
    }
    return this.tenants.resolve(key);
  }

  async _processRequest(req, res, context, tenant, { unlimited = false, route = '/process' } = {}) {
    context.tenantId = tenant.id;
    if (!unlimited) {
      const limits = this.tenants.limitsFor(tenant);
      const rate = this.limiter.check({ key: `process:${tenant.id}`, limit: limits.perMinute, windowMs: 60_000 });
      if (!rate.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate });
    }

    const body = await this._readJsonObject(req);
    if (typeof body.question !== 'string') {
      const error = new Error('question must be a string');
      error.status = 400;
      throw error;
    }
    if (body.context !== undefined && typeof body.context !== 'string') {
      const error = new Error('context must be a string');
      error.status = 400;
      throw error;
    }

    const maxQuestionChars = Math.max(1, Number(process.env.ASTERA_MAX_QUESTION_CHARS) || 100_000);
    if (body.question.length > maxQuestionChars) {
      const error = new Error(`question exceeds ${maxQuestionChars} characters`);
      error.status = 413;
      throw error;
    }
    const maxContextChars = Math.max(1, Number(process.env.ASTERA_MAX_CONTEXT_CHARS) || 500_000);
    if (String(body.context || '').length > maxContextChars) {
      const error = new Error(`context exceeds ${maxContextChars} characters`);
      error.status = 413;
      throw error;
    }

    const publicInput = sanitizePublicDecisionInput(body);
    const out = await this.engine.process(publicInput, tenant);
    if (!unlimited) {
      this.meter.record({ tenant, route, units: 1, status: 'ok', meta: { claim_status: out.result?.canonical_claims?.status || null } });
    }
    return this._text(req, res, 200, out.material?.text || '');
  }
}

module.exports = AsteraServer;
module.exports.isLoopbackAddress = isLoopbackAddress;
module.exports.isLoopbackHost = isLoopbackHost;
