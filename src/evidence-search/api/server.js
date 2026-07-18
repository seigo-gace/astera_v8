'use strict';

const http = require('node:http');
const Logger = require('../../logger');
const { parseJsonStrict, maskSecrets } = require('../../safe-json');
const createEvidenceSearchModule = require('..');
const {
  ReplayNonceGuard,
  loadInternalServiceSecret,
  verifyInternalRequest
} = require('./internal-auth');

const MAX_REQUEST_BYTES = 256 * 1024;

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function statusForError(error) {
  const code = String(error?.code || '');
  if (code === 'INTERNAL_AUTH_REQUIRED' || code === 'INTERNAL_SIGNATURE_INVALID') return 401;
  if (
    code === 'INTERNAL_SERVICE_FORBIDDEN'
    || code === 'INTERNAL_REPLAY_DETECTED'
    || code === 'INTERNAL_REQUEST_EXPIRED'
    || code === 'INTERNAL_BODY_HASH_MISMATCH'
  ) return 403;
  if (
    code.startsWith('INVALID_')
    || code === 'NO_CORE_CONDITION'
    || code === 'PAID_SEARCH_DISABLED'
    || code === 'UNSUPPORTED_MODULE_SCHEMA'
    || code === 'UNSUPPORTED_MODULE_OPERATION'
  ) return 400;
  if (code === 'PROVIDER_TIMEOUT' || code === 'SEARCH_DEADLINE_EXCEEDED') return 504;
  const requested = Number(error?.status);
  return requested >= 400 && requested <= 599 ? requested : 500;
}

class EvidenceSearchApiServer {
  constructor(options = {}) {
    this.port = options.port === 0
      ? 0
      : positiveInteger(options.port || process.env.ASTERA_EVIDENCE_PORT, 7375);
    this.host = options.host || process.env.ASTERA_EVIDENCE_HOST || '127.0.0.1';
    this.logger = options.logger || new Logger();
    this.secret = loadInternalServiceSecret({
      secret: options.internalSecret,
      secretFile: options.internalSecretFile
    });
    this.nonceGuard = options.nonceGuard || new ReplayNonceGuard();
    this.module = options.module || createEvidenceSearchModule(options.moduleOptions || {});

    this.server = http.createServer((req, res) => {
      const startedAt = Date.now();
      res.once('finish', () => {
        if (req.method === 'GET' && req.url === '/healthz' && res.statusCode < 400) return;
        this.logger.write({
          tenantId: req.verifiedTenantId || 'internal-unverified',
          type: 'evidence_search_api_access',
          severity: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
          text: `${req.method} ${String(req.url || '').split('?')[0]} ${res.statusCode}`,
          payload: {
            request_id: req.verifiedRequestId || null,
            status: res.statusCode,
            duration_ms: Date.now() - startedAt
          }
        });
      });
      void this._handle(req, res);
    });

    this.server.headersTimeout = positiveInteger(process.env.ASTERA_HEADERS_TIMEOUT_MS, 10_000);
    this.server.requestTimeout = positiveInteger(process.env.ASTERA_REQUEST_TIMEOUT_MS, 10_000);
    this.server.keepAliveTimeout = positiveInteger(process.env.ASTERA_KEEPALIVE_TIMEOUT_MS, 5_000);
    this.server.maxRequestsPerSocket = positiveInteger(process.env.ASTERA_MAX_REQUESTS_PER_SOCKET, 1000);
  }

  start() {
    this.server.listen(this.port, this.host, () => {
      const address = this.server.address();
      const port = typeof address === 'object' && address ? address.port : this.port;
      this.logger.write({
        type: 'evidence_search_api_started',
        text: `Astera evidence search API listening at http://${this.host}:${port}`,
        payload: { host: this.host, port }
      });
    });
    return this.server;
  }

  async stop() {
    if (this.server.listening) {
      await new Promise((resolve) => this.server.close(resolve));
    }
    this.logger.write({
      type: 'evidence_search_api_stopped',
      text: 'Astera evidence search API stopped'
    });
    await this.logger.flush?.();
  }

  _headers(extra = {}) {
    return {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
      ...extra
    };
  }

  _json(res, status, payload) {
    res.writeHead(status, this._headers());
    res.end(JSON.stringify(maskSecrets(payload), null, 2));
  }

  async _readRawBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_REQUEST_BYTES) {
        const error = new Error('Payload too large');
        error.status = 413;
        throw error;
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
  }

  async _handle(req, res) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/healthz') {
        const health = await this.module.execute({
          schema_version: 'astera.evidence-search.module-request.v1',
          operation: 'HEALTH'
        });
        return this._json(res, 200, {
          ok: true,
          service: 'astera-evidence-search-api',
          active_search_mode: 'FREE_ONLY',
          module: health.result,
          time: new Date().toISOString()
        });
      }

      if (req.method !== 'POST' || url.pathname !== '/internal/v1/evidence/search') {
        return this._json(res, 404, { error: 'not_found' });
      }

      const rawBody = await this._readRawBody(req);
      const identity = verifyInternalRequest({
        headers: req.headers,
        body: rawBody,
        secret: this.secret,
        nonceGuard: this.nonceGuard,
        expectedService: 'astera-main'
      });
      req.verifiedTenantId = identity.tenant_id;
      req.verifiedRequestId = identity.request_id;

      const payload = parseJsonStrict(rawBody);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        const error = new Error('JSON body must be an object');
        error.code = 'INVALID_SEARCH_REQUEST';
        throw error;
      }
      if (payload.paid_search?.enabled === true) {
        const error = new Error('paid search is disabled; free providers only');
        error.code = 'PAID_SEARCH_DISABLED';
        throw error;
      }

      const response = await this.module.execute({
        schema_version: 'astera.evidence-search.module-request.v1',
        operation: 'SEARCH_EVIDENCE',
        context: {
          tenant_id: identity.tenant_id,
          request_id: identity.request_id,
          execution_time: new Date().toISOString()
        },
        payload: {
          ...payload,
          tenant_id: identity.tenant_id,
          request_id: identity.request_id,
          paid_search: { enabled: false }
        }
      });

      this.logger.write({
        tenantId: identity.tenant_id,
        type: 'evidence_search_completed',
        text: `Evidence search returned ${response.result.status}`,
        payload: {
          request_id: identity.request_id,
          status: response.result.status,
          evidence_count: response.result.evidence.length,
          initial_score_bp: response.result.quality.initial.score_bp,
          final_score_bp: response.result.quality.final.score_bp,
          reinforcement_attempt_count: response.result.quality.reinforcement_attempt_count,
          duration_ms: response.result.duration_ms
        }
      });
      return this._json(res, 200, response.result);
    } catch (error) {
      const status = statusForError(error);
      this.logger.write({
        tenantId: req.verifiedTenantId || 'internal-unverified',
        type: 'evidence_search_api_failed',
        severity: status >= 500 ? 'error' : 'warn',
        text: `${req.method} ${String(req.url || '').split('?')[0]} failed`,
        payload: {
          request_id: req.verifiedRequestId || null,
          status,
          error_code: error.code || 'INTERNAL_ERROR'
        }
      });
      return this._json(res, status, {
        error: status >= 500 ? 'internal_error' : error.message,
        code: error.code || 'INTERNAL_ERROR',
        status,
        requestId: req.verifiedRequestId || null
      });
    }
  }
}

module.exports = EvidenceSearchApiServer;
