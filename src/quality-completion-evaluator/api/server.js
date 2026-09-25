'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const Logger = require('../../logger');
const RateLimiter = require('../../guard/rate-limiter');
const { parseJsonStrict, maskSecrets } = require('../../safe-json');
const { authenticateSkillApiKey, isSkillApiConfigured, timingSafeStringEqual } = require('../../auth/skill-api-key');
const { evaluate, GENERIC_REQUEST_SCHEMA_VERSION } = require('..');
const pkg = require('../package.json');

const ONE_MB = 1024 * 1024;
const DEFAULT_EVALUATE_RATE_LIMIT_PER_MINUTE = 60;
const EVALUATE_ROUTES = Object.freeze({
  '/v1/evaluate': Object.freeze({ version: 'v1', skill: false }),
  '/v1/skill/evaluate': Object.freeze({ version: 'v1', skill: true }),
  '/v2/evaluate': Object.freeze({ version: 'v2', skill: false }),
  '/v2/skill/evaluate': Object.freeze({ version: 'v2', skill: true })
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function transportEvaluateRateLimit() {
  return positiveInteger(process.env.ASTERA_EVALUATE_RATE_LIMIT_PER_MINUTE, DEFAULT_EVALUATE_RATE_LIMIT_PER_MINUTE);
}

function allowedOrigins() {
  return String(process.env.ASTERA_EVALUATOR_CORS_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
}

function isLoopbackAddress(address = '') {
  return /^(127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/i.test(String(address || ''));
}

function resolveGlobalApiKeyCaller(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key || key.length > 256) return null;
  const globalKey = process.env.ASTERA_API_KEY || process.env.KAGURA_API_KEY || '';
  if (!globalKey || !timingSafeStringEqual(key, globalKey)) return null;
  return { id: 'admin', plan: 'admin', status: 'active', key_prefix: 'admin', is_global: true };
}

function authenticateEvaluateRequest(req, host) {
  const key = req.headers['x-api-key'];
  const localNoAuth = (process.env.ASTERA_LOCAL_NO_AUTH || process.env.KAGURA_LOCAL_NO_AUTH) === '1' && ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!key && localNoAuth) return { id: 'local-dev', plan: 'admin', status: 'active', is_global: true };
  if (key) {
    const globalCaller = resolveGlobalApiKeyCaller(key);
    if (globalCaller) return globalCaller;
  }
  return null;
}

class EvaluatorApiServer {
  constructor(options = {}) {
    this.port = options.port === 0 ? 0 : positiveInteger(options.port || process.env.ASTERA_EVALUATOR_API_PORT, 7374);
    this.host = options.host || process.env.ASTERA_EVALUATOR_API_HOST || '127.0.0.1';
    this.logger = options.logger || new Logger();
    this.limiter = options.limiter || new RateLimiter();
    this.server = http.createServer((req, res) => {
      req.requestId = crypto.randomUUID();
      const startedAt = Date.now();
      res.once('finish', () => {
        if (req.method === 'GET' && req.url === '/healthz' && res.statusCode < 400) return;
        this.logger.write({
          callerId: 'owner-skill-private',
          type: 'evaluator_api_access',
          severity: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
          text: `${req.method} ${String(req.url || '').split('?')[0]} ${res.statusCode}`,
          payload: { request_id: req.requestId, status: res.statusCode, duration_ms: Date.now() - startedAt }
        });
      });
      void this._handle(req, res);
    });
    this.server.headersTimeout = positiveInteger(process.env.ASTERA_HEADERS_TIMEOUT_MS, 10_000);
    this.server.requestTimeout = positiveInteger(process.env.ASTERA_REQUEST_TIMEOUT_MS, 60_000);
    this.server.keepAliveTimeout = positiveInteger(process.env.ASTERA_KEEPALIVE_TIMEOUT_MS, 5_000);
    this.server.maxRequestsPerSocket = positiveInteger(process.env.ASTERA_MAX_REQUESTS_PER_SOCKET, 1000);
  }

  start() {
    this.server.listen(this.port, this.host, () => {
      const address = this.server.address();
      const port = typeof address === 'object' && address ? address.port : this.port;
      this.logger.write({ type: 'evaluator_api_started', text: `Astera evaluation API listening at http://${this.host}:${port}`, payload: { host: this.host, port } });
    });
    return this.server;
  }

  async stop() {
    if (this.server.listening) await new Promise((resolve) => this.server.close(resolve));
    this.logger.write({ type: 'evaluator_api_stopped', text: 'Astera evaluation API stopped' });
    await this.logger.flush?.();
  }

  _origin(req) {
    const origin = req.headers.origin;
    if (!origin) return null;
    const allowed = allowedOrigins();
    if (allowed.includes('*')) return '*';
    return allowed.includes(origin) ? origin : null;
  }

  _headers(req, extra = {}) {
    const headers = {
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      ...extra
    };
    const origin = this._origin(req);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (process.env.ASTERA_ENABLE_HSTS === '1') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    return headers;
  }

  _requiresHttps(req) {
    if (process.env.ASTERA_REQUIRE_HTTPS !== '1') return false;
    if (isLoopbackAddress(req.socket.remoteAddress)) return false;
    if (req.socket.encrypted) return false;
    const trustProxy = process.env.ASTERA_TRUST_PROXY === '1' || isLoopbackAddress(req.socket.remoteAddress);
    return !(trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
  }

  _json(req, res, status, payload) {
    res.writeHead(status, this._headers(req, { 'Content-Type': 'application/json; charset=utf-8', 'X-Request-ID': req.requestId }));
    res.end(JSON.stringify(maskSecrets(payload), null, 2));
  }

  async _readJsonObject(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > ONE_MB) {
        const error = new Error('Payload too large');
        error.status = 413;
        throw error;
      }
      chunks.push(chunk);
    }
    const body = parseJsonStrict(Buffer.concat(chunks, total));
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      const error = new Error('JSON body must be an object');
      error.status = 400;
      throw error;
    }
    return body;
  }

  async _handle(req, res) {
    try {
      if (this._requiresHttps(req)) return this._json(req, res, 426, { error: 'https_required' });
      if (req.headers.origin && !this._origin(req)) return this._json(req, res, 403, { error: 'cors_origin_denied' });
      if (req.method === 'OPTIONS') {
        res.writeHead(204, this._headers(req));
        return res.end();
      }
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return this._json(req, res, 200, {
          ok: true,
          service: 'astera-evaluation-verification-api',
          version: pkg.version,
          public_endpoint: '/v1/evaluate',
          skill_endpoint: '/v1/skill/evaluate',
          legacy_public_endpoint: '/v1/evaluate',
          generic_public_endpoint: '/v2/evaluate',
          legacy_skill_endpoint: '/v1/skill/evaluate',
          generic_skill_endpoint: '/v2/skill/evaluate',
          skill_api_enabled: isSkillApiConfigured(),
          publication_enabled: false,
          ai_used: false,
          time: new Date().toISOString()
        });
      }

      const route = EVALUATE_ROUTES[url.pathname];
      if (req.method === 'POST' && route) {
        const isSkillRoute = route.skill;
        if (isSkillRoute && !isSkillApiConfigured()) return this._json(req, res, 503, { error: 'skill_api_not_configured' });
        const caller = isSkillRoute
          ? authenticateSkillApiKey(req.headers['x-api-key'])
          : authenticateEvaluateRequest(req, this.host);
        if (!caller) return this._json(req, res, 401, { error: 'unauthorized' });
        if (!isSkillRoute) {
          const rate = this.limiter.check({ key: `evaluate:${route.version}:${caller.id}`, limit: transportEvaluateRateLimit(), windowMs: 60_000 });
          if (!rate.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate });
        }

        const body = await this._readJsonObject(req);
        if (route.version === 'v2' && body.schema_version !== GENERIC_REQUEST_SCHEMA_VERSION) {
          return this._json(req, res, 400, { error: 'evaluation_schema_route_mismatch', expected: GENERIC_REQUEST_SCHEMA_VERSION });
        }
        if (route.version === 'v1' && body.schema_version === GENERIC_REQUEST_SCHEMA_VERSION) {
          return this._json(req, res, 400, { error: 'evaluation_schema_route_mismatch', expected: 'legacy_v1_contract' });
        }

        const result = await evaluate(body);
        this.logger.write({
          callerId: caller.id,
          type: 'evaluation_completed',
          text: `Evaluation engine returned ${result.status}`,
          payload: {
            request_id: req.requestId,
            api_version: route.version,
            access_mode: isSkillRoute ? 'owner_skill_private' : 'api_key',
            candidate_id: result.candidate_id || null,
            subject_id: result.subject_id || null,
            status: result.status,
            total_score: result.scores?.total ?? result.scores?.minimum ?? null,
            quality: result.scores?.quality ?? null,
            completion: result.scores?.completion ?? null,
            passed: result.judgment?.passed === true,
            ai_used: result.ai_used === true
          }
        });
        return this._json(req, res, 200, result);
      }
      return this._json(req, res, 404, { error: 'not_found' });
    } catch (error) {
      const requested = Number(error?.status);
      const status = requested >= 400 && requested <= 599 ? requested : 500;
      this.logger.write({ callerId: 'owner-skill-private', type: 'evaluator_api_failed', severity: status >= 500 ? 'error' : 'warn', text: `${req.method} ${String(req.url || '').split('?')[0]} failed`, payload: { request_id: req.requestId, status, error } });
      return this._json(req, res, status, { error: status >= 500 ? 'internal_error' : error.message, status, requestId: req.requestId });
    }
  }
}

module.exports = EvaluatorApiServer;
