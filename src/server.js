'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const KaguraEngine = require('./astera-engine');
const Logger = require('./logger');
const RateLimiter = require('./guard/rate-limiter');
const { parseJsonStrict, maskSecrets } = require('./safe-json');
const { authenticateSkillApiKey, isSkillApiConfigured, timingSafeStringEqual } = require('./auth/skill-api-key');
const { resolveRequestLLM } = require('./llm-request');
const pkg = require('../package.json');

const ONE_MB = 1024 * 1024;
const DEFAULT_PROCESS_RATE_LIMIT_PER_MINUTE = 60;

const ALLOWED_MOOD_KEYS = new Set([
  'good', 'confident', 'calm', 'deepThink', 'urgent', 'angry', 'tired', 'bad', 'confused', 'anxious'
]);
const MAX_MOOD_ANSWER_KEYS = 8;

function transportProcessRateLimit() {
  return positiveInteger(process.env.ASTERA_PROCESS_RATE_LIMIT_PER_MINUTE, DEFAULT_PROCESS_RATE_LIMIT_PER_MINUTE);
}

function sanitizeMoodAnswers(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  let count = 0;
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_MOOD_KEYS.has(key)) continue;
    if (typeof value !== 'boolean') continue;
    if (count >= MAX_MOOD_ANSWER_KEYS) break;
    out[key] = value;
    count += 1;
  }
  return out;
}

function buildProcessAllowlist(body) {
  const allowlist = { question: body.question };
  if (body.context !== undefined) allowlist.context = body.context;
  if (body.language !== undefined) allowlist.language = body.language;
  if (body.locale !== undefined) allowlist.locale = body.locale;
  if (body.output_language !== undefined) allowlist.output_language = body.output_language;
  const moodAnswers = sanitizeMoodAnswers(body.moodAnswers);
  if (Object.keys(moodAnswers).length) allowlist.moodAnswers = moodAnswers;
  return allowlist;
}

function parseAllowedOrigins() {
  const raw = process.env.ASTERA_CORS_ORIGINS || process.env.ASTERA_CORS_ORIGIN || process.env.KAGURA_CORS_ORIGINS || process.env.KAGURA_CORS_ORIGIN || '';
  const list = String(raw || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : ['http://127.0.0.1:7373', 'http://localhost:7373'];
}

function isLoopbackAddress(address = '') {
  return /^(127(?:\.\d{1,3}){3}|::1|::ffff:127(?:\.\d{1,3}){3})$/i.test(String(address || ''));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function resolveGlobalApiKeyTenant(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key || key.length > 256) return null;
  const globalKey = process.env.ASTERA_API_KEY || process.env.KAGURA_API_KEY || '';
  if (!globalKey || !timingSafeStringEqual(key, globalKey)) return null;
  return { id: 'admin', plan: 'admin', status: 'active', key_prefix: 'admin', is_global: true };
}

class KaguraServer {
  constructor(options = {}) {
    this.port = options.port === 0 ? 0 : positiveInteger(options.port, 7373);
    this.host = options.host || '127.0.0.1';
    this.logger = options.logger || new Logger();
    this.engine = options.engine || new KaguraEngine({ poolSize: Number(options.poolSize || 4), logger: this.logger });
    this.limiter = options.limiter || new RateLimiter();
    this.server = http.createServer((req, res) => {
      req.requestId = crypto.randomUUID();
      const startedAt = Date.now();
      const context = { tenantId: 'anonymous' };
      const requestPath = String(req.url || '').split('?')[0];
      let accessLogged = false;
      const logAccess = (aborted = false) => {
        if (accessLogged) return;
        accessLogged = true;
        const status = aborted ? 499 : res.statusCode;
        const isSuccessfulHealthCheck = !aborted
          && req.method === 'GET'
          && requestPath === '/healthz'
          && status >= 200
          && status < 400;
        if (isSuccessfulHealthCheck) return;
        const severity = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
        this.logger.write({
          tenantId: context.tenantId,
          type: 'http_access',
          severity,
          text: `${req.method} ${requestPath} ${status}`,
          payload: {
            request_id: req.requestId,
            method: req.method,
            path: requestPath,
            status,
            client_aborted: aborted,
            duration_ms: Date.now() - startedAt,
            user_agent: req.headers['user-agent'] || null
          }
        });
      };
      res.once('finish', () => logAccess(false));
      res.once('close', () => logAccess(!res.writableFinished));
      void this._handle(req, res, context);
    });
    this.server.on('clientError', (error, socket) => {
      this.logger.write({ type: 'http_client_error', severity: 'warn', text: 'HTTP client protocol error', payload: { error } });
      if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });
    this.server.headersTimeout = positiveInteger(process.env.ASTERA_HEADERS_TIMEOUT_MS, 10_000);
    this.server.requestTimeout = positiveInteger(process.env.ASTERA_REQUEST_TIMEOUT_MS, 60_000);
    this.server.keepAliveTimeout = positiveInteger(process.env.ASTERA_KEEPALIVE_TIMEOUT_MS, 5_000);
    this.server.maxRequestsPerSocket = positiveInteger(process.env.ASTERA_MAX_REQUESTS_PER_SOCKET, 1000);
  }

  start() {
    this.server.listen(this.port, this.host, () => {
      const address = this.server.address();
      const actualPort = typeof address === 'object' && address ? address.port : this.port;
      this.logger.write({ type: 'server_started', text: `Astera v8 listening at http://${this.host}:${actualPort}`, payload: { host: this.host, port: actualPort } });
    });
    return this.server;
  }

  async stop() {
    if (this.server.listening) await new Promise((resolve) => this.server.close(resolve));
    await this.engine.destroy();
    this.logger.write({ type: 'server_stopped', text: 'Astera v8 stopped' });
    await this.logger.flush?.();
  }

  _corsOriginFor(req) {
    const origin = req?.headers?.origin;
    const allowed = parseAllowedOrigins();
    if (!origin) return allowed.includes('*') ? '*' : null;
    if (allowed.includes('*')) return '*';
    if (allowed.includes(origin)) return origin;
    return null;
  }

  _headers(req, extra = {}) {
    const origin = this._corsOriginFor(req);
    const headers = {
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'no-store',
      ...extra
    };
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if ((process.env.ASTERA_ENABLE_HSTS || process.env.KAGURA_ENABLE_HSTS) === '1') {
      headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
    }
    return headers;
  }

  _isSecureRequest(req) {
    if (req.socket.encrypted) return true;
    const trustProxy = process.env.ASTERA_TRUST_PROXY === '1' || isLoopbackAddress(req.socket.remoteAddress);
    return trustProxy && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
  }

  _requiresHttps(req) {
    if ((process.env.ASTERA_REQUIRE_HTTPS || process.env.KAGURA_REQUIRE_HTTPS) !== '1') return false;
    if (isLoopbackAddress(req.socket.remoteAddress)) return false;
    return !this._isSecureRequest(req);
  }

  _json(req, res, status, payload, options = {}) {
    const shouldMask = options.mask !== false;
    res.writeHead(status, this._headers(req, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Request-ID': req.requestId || ''
    }));
    res.end(JSON.stringify(shouldMask ? maskSecrets(payload) : payload, null, 2));
  }

  _text(req, res, status, text) {
    res.writeHead(status, this._headers(req, {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Request-ID': req.requestId || ''
    }));
    res.end(String(text || ''));
  }

  async _readRawBody(req, limit = ONE_MB) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > limit) {
        const err = new Error('Payload too large');
        err.status = 413;
        throw err;
      }
      chunks.push(buf);
    }
    return Buffer.concat(chunks, total);
  }

  async _readJson(req, limit = ONE_MB) {
    return parseJsonStrict(await this._readRawBody(req, limit));
  }

  async _readJsonObject(req, limit = ONE_MB) {
    const body = await this._readJson(req, limit);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      const error = new Error('JSON body must be an object');
      error.status = 400;
      throw error;
    }
    return body;
  }

  async _authenticate(req) {
    const key = req.headers['x-api-key'];
    const localNoAuth = (process.env.ASTERA_LOCAL_NO_AUTH || process.env.KAGURA_LOCAL_NO_AUTH) === '1' && ['127.0.0.1', 'localhost', '::1'].includes(this.host);
    if (!key && localNoAuth) return { id: 'local-dev', plan: 'admin', status: 'active', is_global: true };
    if (key) {
      const globalTenant = resolveGlobalApiKeyTenant(key);
      if (globalTenant) return globalTenant;
    }
    return null;
  }

  async _authenticateSkill(req) {
    return authenticateSkillApiKey(req.headers['x-api-key']);
  }

  async _processRequest(req, res, context, tenant, { unlimited = false, route = '/process' } = {}) {
    context.tenantId = tenant.id;
    if (!unlimited) {
      const rl = this.limiter.check({ key: `process:${tenant.id}`, limit: transportProcessRateLimit(), windowMs: 60_000 });
      if (!rl.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate: rl });
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
    const allowlist = buildProcessAllowlist(body);
    allowlist.llm = resolveRequestLLM(allowlist);
    const out = await this.engine.process(allowlist, tenant);
    return this._text(req, res, 200, out.material?.text || '');
  }

  async _handle(req, res, context = { tenantId: 'anonymous' }) {
    try {
      if (this._requiresHttps(req)) {
        return this._json(req, res, 426, { error: 'https_required', hint: 'Set HTTPS at the reverse proxy or send X-Forwarded-Proto: https.' });
      }

      if (req.headers.origin && !this._corsOriginFor(req)) {
        return this._json(req, res, 403, { error: 'cors_origin_denied' });
      }

      if (req.method === 'OPTIONS') {
        res.writeHead(204, this._headers(req));
        return res.end();
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (req.method === 'GET' && url.pathname === '/healthz') {
        const logging = this.logger.status?.() || {
          enabled: Boolean(this.logger.tgsEnabled),
          project_id: this.logger.projectId || null,
          pending_deliveries: this.logger.pending?.size || 0,
          outbox: null
        };
        return this._json(req, res, 200, {
          ok: true,
          service: 'astera-v8',
          version: pkg.version,
          tgserver_logging: this.logger.tgsEnabled,
          skill_api: {
            enabled: isSkillApiConfigured(),
            process_endpoint: '/v1/skill/process'
          },
          logging,
          runtime: {
            node: process.version,
            uptime_seconds: Math.floor(process.uptime()),
            pid: process.pid
          },
          time: new Date().toISOString()
        });
      }

      if (req.method === 'POST' && url.pathname === '/process') {
        const tenant = await this._authenticate(req);
        if (!tenant) {
          return this._json(req, res, 401, {
            error: 'unauthorized',
            hint: 'Set X-API-Key (ASTERA_API_KEY) or enable ASTERA_LOCAL_NO_AUTH=1 on loopback.'
          });
        }
        return await this._processRequest(req, res, context, tenant);
      }

      if (req.method === 'POST' && url.pathname === '/v1/skill/process') {
        if (!isSkillApiConfigured()) return this._json(req, res, 503, { error: 'skill_api_not_configured' });
        const tenant = await this._authenticateSkill(req);
        if (!tenant) return this._json(req, res, 401, { error: 'unauthorized' });
        return await this._processRequest(req, res, context, tenant, { unlimited: true, route: '/v1/skill/process' });
      }

      return this._json(req, res, 404, { error: 'not_found' });
    } catch (error) {
      const requestedStatus = Number(error?.status);
      const status = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
      this.logger.write({
        tenantId: context.tenantId,
        type: 'request_failed',
        severity: status >= 500 ? 'error' : 'warn',
        text: `${req.method} ${String(req.url || '').split('?')[0]} failed`,
        payload: { request_id: req.requestId, status, error }
      });
      const publicMessage = status >= 500 ? 'internal_error' : error.message;
      return this._json(req, res, status, { error: publicMessage, status, requestId: req.requestId });
    }
  }
}

module.exports = KaguraServer;
module.exports.parseAllowedOrigins = parseAllowedOrigins;
module.exports.resolveGlobalApiKeyTenant = resolveGlobalApiKeyTenant;
module.exports.transportProcessRateLimit = transportProcessRateLimit;
