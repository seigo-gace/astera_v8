'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const Logger = require('../../logger');
const TenantManager = require('../../auth/tenant');
const RateLimiter = require('../../guard/rate-limiter');
const { UsageMeter } = require('../../billing/meter');
const { parseJsonStrict, maskSecrets } = require('../../safe-json');
const { authenticateSkillApiKey, isSkillApiConfigured } = require('../../auth/skill-api-key');
const { evaluate } = require('..');
const pkg = require('../package.json');

const ONE_MB = 1024 * 1024;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function allowedOrigins() {
  return String(process.env.ASTERA_EVALUATOR_CORS_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
}

function isLoopbackAddress(address = '') {
  return /^(127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/i.test(String(address || ''));
}

class EvaluatorApiServer {
  constructor(options = {}) {
    this.port = options.port === 0 ? 0 : positiveInteger(options.port || process.env.ASTERA_EVALUATOR_API_PORT, 7374);
    this.host = options.host || process.env.ASTERA_EVALUATOR_API_HOST || '127.0.0.1';
    this.logger = options.logger || new Logger();
    if (!options.store) throw new Error('EvaluatorApiServer requires store');
    this.store = options.store;
    this.tenants = new TenantManager(this.store);
    this.limiter = options.limiter || new RateLimiter();
    this.meter = new UsageMeter(this.store);
    this.server = http.createServer((req, res) => {
      req.requestId = crypto.randomUUID();
      const startedAt = Date.now();
      res.once('finish', () => {
        if (req.method === 'GET' && req.url === '/healthz' && res.statusCode < 400) return;
        this.logger.write({
          tenantId: 'owner-skill-private',
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
      this.logger.write({ type: 'evaluator_api_started', text: `Astera evaluator API listening at http://${this.host}:${port}`, payload: { host: this.host, port } });
    });
    return this.server;
  }

  async stop() {
    if (this.server.listening) await new Promise((resolve) => this.server.close(resolve));
    this.logger.write({ type: 'evaluator_api_stopped', text: 'Astera evaluator API stopped' });
    this.store.close?.();
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
        return this._json(req, res, 200, { ok: true, service: 'astera-quality-completion-evaluator-api', version: pkg.version, public_endpoint: '/v1/evaluate', skill_endpoint: '/v1/skill/evaluate', skill_api_enabled: isSkillApiConfigured(), publication_enabled: false, store: this.store.mode, time: new Date().toISOString() });
      }
      if (req.method === 'POST' && (url.pathname === '/v1/evaluate' || url.pathname === '/v1/skill/evaluate')) {
        const isSkillRoute = url.pathname === '/v1/skill/evaluate';
        if (isSkillRoute && !isSkillApiConfigured()) return this._json(req, res, 503, { error: 'skill_api_not_configured' });
        const tenant = isSkillRoute
          ? authenticateSkillApiKey(req.headers['x-api-key'])
          : this.tenants.resolve(req.headers['x-api-key']);
        if (!tenant) return this._json(req, res, 401, { error: 'unauthorized' });
        if (!isSkillRoute) {
          const limits = this.tenants.limitsFor(tenant);
          const rate = this.limiter.check({ key: `evaluate:${tenant.id}`, limit: limits.perMinute, windowMs: 60_000 });
          if (!rate.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate });
        }
        const result = await evaluate(await this._readJsonObject(req));
        if (!isSkillRoute) this.meter.record({ tenant, route: '/v1/evaluate', units: 1, status: result.status, meta: { candidate_id: result.candidate_id || null } });
        this.logger.write({
          tenantId: tenant.id, type: 'evaluation_completed', text: `QualityCompletionEvaluator returned ${result.status}`,
          payload: { request_id: req.requestId, access_mode: isSkillRoute ? 'owner_skill_private' : 'tenant', candidate_id: result.candidate_id || null, status: result.status, quality: result.scores?.quality ?? null, completion: result.scores?.completion ?? null, kb_eligible: result.judgment?.kb_eligible === true }
        });
        return this._json(req, res, 200, result);
      }
      return this._json(req, res, 404, { error: 'not_found' });
    } catch (error) {
      const requested = Number(error?.status);
      const status = requested >= 400 && requested <= 599 ? requested : 500;
      this.logger.write({ tenantId: 'owner-skill-private', type: 'evaluator_api_failed', severity: status >= 500 ? 'error' : 'warn', text: `${req.method} ${String(req.url || '').split('?')[0]} failed`, payload: { request_id: req.requestId, status, error } });
      return this._json(req, res, status, { error: status >= 500 ? 'internal_error' : error.message, status, requestId: req.requestId });
    }
  }
}

module.exports = EvaluatorApiServer;
