'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const AsteraEngine = require('./astera-engine');
const Logger = require('./logger');
const RateLimiter = require('./guard/rate-limiter');
const { parseJsonStrict, maskSecrets } = require('./safe-json');
const { authenticateSkillApiKey, isSkillApiConfigured, timingSafeStringEqual } = require('./auth/skill-api-key');
const { resolveRequestLLM } = require('./llm-request');
const { normalizePurposeMode } = require('./runtime/purpose-control');
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
  const purpose = normalizePurposeMode(body.purpose);
  if (purpose) allowlist.purpose = purpose;
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

function resolveGlobalApiKeyCaller(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key || key.length > 256) return null;
  const globalKey = process.env.ASTERA_API_KEY || process.env.KAGURA_API_KEY || '';
  if (!globalKey || !timingSafeStringEqual(key, globalKey)) return null;
  return { id: 'admin', plan: 'admin', status: 'active', key_prefix: 'admin', is_global: true };
}

function publicRevisionPayload(revision) {
  return maskSecrets({
    phase: revision?.material?.phase || revision?.result?.phase || null,
    revision: revision?.material?.revision || revision?.result?.revision || null,
    material_id: revision?.material?.material_id || revision?.result?.material_id || null,
    material: revision?.material || null,
    runtime: revision?.runtime || null
  });
}

class AsteraServer {
  constructor(options = {}) {
    this.port = options.port === 0 ? 0 : positiveInteger(options.port, 7373);
    this.host = options.host || '127.0.0.1';
    this.logger = options.logger || new Logger();
    this.engine = options.engine || new AsteraEngine({ poolSize: Number(options.poolSize || 4), logger: this.logger });
    this.limiter = options.limiter || new RateLimiter();
    this.server = http.createServer((req, res) => {
      req.requestId = crypto.randomUUID();
      const startedAt = Date.now();
      const context = { callerId: 'anonymous' };
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
          callerId: context.callerId,
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

  _sse(req, res, event, payload, id = null) {
    if (res.writableEnded || res.destroyed) return false;
    if (id) res.write(`id: ${id}\n`);
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(maskSecrets(payload))}\n\n`);
    return true;
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
      const globalCaller = resolveGlobalApiKeyCaller(key);
      if (globalCaller) return globalCaller;
    }
    return null;
  }

  async _authenticateSkill(req) {
    return authenticateSkillApiKey(req.headers['x-api-key']);
  }

  _checkProcessRate(caller, unlimited = false) {
    if (unlimited) return null;
    return this.limiter.check({ key: `process:${caller.id}`, limit: transportProcessRateLimit(), windowMs: 60_000 });
  }

  async _readProcessAllowlist(req) {
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
    return allowlist;
  }

  async _processRequest(req, res, context, caller, { unlimited = false } = {}) {
    context.callerId = caller.id;
    const rl = this._checkProcessRate(caller, unlimited);
    if (rl && !rl.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate: rl });
    const allowlist = await this._readProcessAllowlist(req);
    const out = await this.engine.process(allowlist, caller);
    return this._text(req, res, 200, out.material?.text || '');
  }

  async _processProgressiveRequest(req, res, context, caller, { unlimited = false } = {}) {
    context.callerId = caller.id;
    const rl = this._checkProcessRate(caller, unlimited);
    if (rl && !rl.allowed) return this._json(req, res, 429, { error: 'rate_limited', rate: rl });
    const allowlist = await this._readProcessAllowlist(req);
    if (!this.engine || typeof this.engine.processProgressive !== 'function') {
      return this._json(req, res, 503, { error: 'progressive_runtime_not_available' });
    }

    res.writeHead(200, this._headers(req, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Request-ID': req.requestId || ''
    }));
    res.flushHeaders?.();

    const abortController = new AbortController();
    const abort = () => abortController.abort();
    req.once('aborted', abort);
    res.once('close', abort);

    let lastMaterialId = null;
    try {
      await this.engine.processProgressive(allowlist, caller, {
        signal: abortController.signal,
        onRevision: async (revision) => {
          const payload = publicRevisionPayload(revision);
          lastMaterialId = payload.material_id || lastMaterialId;
          const revisionId = payload.material_id && payload.revision
            ? `${payload.material_id}:${payload.revision}`
            : null;
          this._sse(req, res, 'material', payload, revisionId);
        }
      });
      this._sse(req, res, 'complete', {
        material_id: lastMaterialId,
        status: 'COMPLETE'
      }, lastMaterialId ? `${lastMaterialId}:complete` : null);
    } catch (error) {
      const cancelled = abortController.signal.aborted || error?.code === 'REQUEST_CANCELLED';
      if (!cancelled) {
        this.logger.write({
          callerId: context.callerId,
          type: 'progressive_process_failed',
          severity: 'error',
          text: 'Progressive judgment-material processing failed',
          payload: { request_id: req.requestId, error }
        });
        this._sse(req, res, 'error', {
          material_id: lastMaterialId,
          status: 'FAILED',
          error: error?.code || 'progressive_processing_failed'
        }, lastMaterialId ? `${lastMaterialId}:error` : null);
      }
    } finally {
      req.removeListener('aborted', abort);
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  }

  async _handle(req, res, context = { callerId: 'anonymous' }) {
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
          progressive_api: {
            enabled: typeof this.engine?.processProgressive === 'function',
            endpoint: '/v2/process/stream',
            transport: 'SSE',
            initial_phase: 'INITIAL_FAST_PATH',
            final_phase: 'FINAL_ENRICHED'
          },
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
        const caller = await this._authenticate(req);
        if (!caller) {
          return this._json(req, res, 401, {
            error: 'unauthorized',
            hint: 'Set X-API-Key (ASTERA_API_KEY) or enable ASTERA_LOCAL_NO_AUTH=1 on loopback.'
          });
        }
        return await this._processRequest(req, res, context, caller);
      }

      if (req.method === 'POST' && url.pathname === '/v2/process/stream') {
        const caller = await this._authenticate(req);
        if (!caller) {
          return this._json(req, res, 401, {
            error: 'unauthorized',
            hint: 'Set X-API-Key (ASTERA_API_KEY) or enable ASTERA_LOCAL_NO_AUTH=1 on loopback.'
          });
        }
        return await this._processProgressiveRequest(req, res, context, caller);
      }

      if (req.method === 'POST' && url.pathname === '/v1/skill/process') {
        if (!isSkillApiConfigured()) return this._json(req, res, 503, { error: 'skill_api_not_configured' });
        const caller = await this._authenticateSkill(req);
        if (!caller) return this._json(req, res, 401, { error: 'unauthorized' });
        return await this._processRequest(req, res, context, caller, { unlimited: true });
      }

      return this._json(req, res, 404, { error: 'not_found' });
    } catch (error) {
      const requestedStatus = Number(error?.status);
      const status = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
      this.logger.write({
        callerId: context.callerId,
        type: 'request_failed',
        severity: status >= 500 ? 'error' : 'warn',
        text: `${req.method} ${String(req.url || '').split('?')[0]} failed`,
        payload: { request_id: req.requestId, status, error }
      });
      if (res.headersSent) {
        if (!res.writableEnded && !res.destroyed) res.end();
        return;
      }
      const publicMessage = status >= 500 ? 'internal_error' : error.message;
      return this._json(req, res, status, { error: publicMessage, status, requestId: req.requestId });
    }
  }
}

module.exports = AsteraServer;
module.exports.parseAllowedOrigins = parseAllowedOrigins;
module.exports.resolveGlobalApiKeyCaller = resolveGlobalApiKeyCaller;
module.exports.transportProcessRateLimit = transportProcessRateLimit;
module.exports.publicRevisionPayload = publicRevisionPayload;