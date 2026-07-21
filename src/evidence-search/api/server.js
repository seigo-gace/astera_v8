'use strict';

const http = require('node:http');
const createEvidenceSearchModule = require('..');
const {
  ReplayNonceGuard,
  loadInternalServiceSecret,
  sha256,
  verifyInternalRequest
} = require('./internal-auth');

const MAX_REQUEST_BYTES = 256 * 1024;

const SECRET_KEY_RE = /(api[_-]?key|authorization|secret|token|password|bearer|client_secret|access[_-]?key)/i;
const SECRET_VALUE_RE = /(Bearer\s+[A-Za-z0-9._\-]+|sk-(?:proj-|ant-)?[A-Za-z0-9_\-]{8,}|gh[pousr]_[A-Za-z0-9_]{20,})/g;
const NOOP_LOGGER = Object.freeze({ write() {}, async flush() { return true; } });

function maskSecrets(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.replace(SECRET_VALUE_RE, '***');
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) {
    const out = value.map((item) => maskSecrets(item, seen));
    seen.delete(value);
    return out;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = SECRET_KEY_RE.test(key) ? '***' : maskSecrets(item, seen);
  }
  seen.delete(value);
  return out;
}

function parseJsonStrict(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    const invalid = new Error('Invalid JSON');
    invalid.code = 'INVALID_SEARCH_REQUEST';
    invalid.status = 400;
    throw invalid;
  }
}

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
  if (code === 'EVIDENCE_JOB_LEASE_CONFLICT' || code === 'EVIDENCE_JOB_CAS_CONFLICT') return 409;
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
    this.logger = options.logger || NOOP_LOGGER;
    this.secret = loadInternalServiceSecret({
      secret: options.internalSecret,
      secretFile: options.internalSecretFile
    });
    this.nonceGuard = options.nonceGuard || new ReplayNonceGuard();
    this.module = options.module || createEvidenceSearchModule(options.moduleOptions || {});
    this.jobManager = options.jobManager || null;
    this.closeJobManagerOnStop = options.closeJobManagerOnStop !== false;

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
            job_id: req.evidenceJobId || null,
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
        payload: {
          host: this.host,
          port,
          durable_recovery: Boolean(this.jobManager)
        }
      });
    });
    return this.server;
  }

  async stop() {
    if (this.server.listening) {
      await new Promise((resolve) => this.server.close(resolve));
    }
    if (this.jobManager && this.closeJobManagerOnStop) {
      this.jobManager.close();
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

  async _terminalReplay(job) {
    const latest = typeof this.jobManager.readLatestValidCheckpointAsync === 'function'
      ? await this.jobManager.readLatestValidCheckpointAsync(job.job_id)
      : this.jobManager.readLatestValidCheckpoint(job.job_id);
    const value = latest.checkpoint?.value;
    if (!value || !['FINAL_VALID', 'REJECTED'].includes(value.status)) {
      const error = new Error('completed evidence job has no valid terminal checkpoint');
      error.code = 'RECOVERY_ARTIFACT_INVALID';
      throw error;
    }
    return Object.freeze({
      ...value,
      job_id: job.job_id,
      idempotent_replay: true
    });
  }

  async _handle(req, res) {
    let activeJob = null;
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/healthz') {
        const health = await this.module.execute({
          schema_version: 'astera.evidence-search.module-request.v1',
          operation: 'HEALTH'
        });
        const moduleHealth = health.result || {};
        const providerCount = Number(moduleHealth.provider_count || 0);
        return this._json(res, 200, {
          ok: true,
          ready: providerCount > 0,
          service: 'astera-evidence-search-api',
          active_search_mode: 'FREE_ONLY',
          durable_recovery: Boolean(this.jobManager),
          provider_count: providerCount,
          module: moduleHealth,
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

      let lifecycle;
      if (this.jobManager) {
        const started = this.jobManager.begin({
          tenantId: identity.tenant_id,
          requestId: identity.request_id,
          idempotencyKey: payload.idempotency_key || identity.request_id
        });
        activeJob = started.job;
        req.evidenceJobId = activeJob.job_id;

        if (started.reusedTerminal) {
          return this._json(res, 200, await this._terminalReplay(activeJob));
        }

        activeJob = typeof this.jobManager.checkpointAsync === 'function'
          ? await this.jobManager.checkpointAsync(
            activeJob,
            'AUTHENTICATED',
          {
            request_id: identity.request_id,
            tenant_id: identity.tenant_id,
            body_sha256: sha256(rawBody),
            domain_lens: payload.domain_lens || null,
            free_projection: payload.search?.free_projection !== false,
            free_current: payload.search?.free_current !== false
          }
          )
          : this.jobManager.checkpoint(
            activeJob,
            'AUTHENTICATED',
            {
              request_id: identity.request_id,
              tenant_id: identity.tenant_id,
              body_sha256: sha256(rawBody),
              domain_lens: payload.domain_lens || null,
              free_projection: payload.search?.free_projection !== false,
              free_current: payload.search?.free_current !== false
            }
          );
        lifecycle = this.jobManager.lifecycle(activeJob);
      }

      const response = await this.module.execute({
        schema_version: 'astera.evidence-search.module-request.v1',
        operation: 'SEARCH_EVIDENCE',
        context: {
          tenant_id: identity.tenant_id,
          request_id: identity.request_id,
          execution_time: new Date().toISOString(),
          lifecycle
        },
        payload: {
          ...payload,
          tenant_id: identity.tenant_id,
          request_id: identity.request_id,
          paid_search: { enabled: false }
        }
      });

      let completedJob = null;
      if (this.jobManager && activeJob) {
        completedJob = typeof this.jobManager.completeAsync === 'function'
          ? await this.jobManager.completeAsync(activeJob, response.result)
          : this.jobManager.complete(activeJob, response.result);
        activeJob = completedJob;
      }

      const result = Object.freeze({
        ...response.result,
        ...(completedJob ? { job_id: completedJob.job_id } : {})
      });

      this.logger.write({
        tenantId: identity.tenant_id,
        type: 'evidence_search_completed',
        text: `Evidence search returned ${result.status}`,
        payload: {
          request_id: identity.request_id,
          job_id: completedJob?.job_id || null,
          status: result.status,
          evidence_count: result.evidence.length,
          initial_score_bp: result.quality.initial.score_bp,
          final_score_bp: result.quality.final.score_bp,
          reinforcement_attempt_count: result.quality.reinforcement_attempt_count,
          duration_ms: result.duration_ms
        }
      });
      return this._json(res, 200, result);
    } catch (error) {
      if (this.jobManager && activeJob && !['FINAL_VALID', 'REJECTED', 'ERROR'].includes(activeJob.state)) {
        try {
          activeJob = typeof this.jobManager.failAsync === 'function'
            ? await this.jobManager.failAsync(activeJob, error)
            : this.jobManager.fail(activeJob, error);
        } catch (jobError) {
          this.logger.write({
            tenantId: req.verifiedTenantId || 'internal-unverified',
            type: 'evidence_job_failure_record_failed',
            severity: 'error',
            text: 'Failed to persist evidence job error state',
            payload: {
              request_id: req.verifiedRequestId || null,
              job_id: req.evidenceJobId || null,
              error_code: jobError.code || 'EVIDENCE_JOB_ERROR'
            }
          });
        }
      }

      const status = statusForError(error);
      this.logger.write({
        tenantId: req.verifiedTenantId || 'internal-unverified',
        type: 'evidence_search_api_failed',
        severity: status >= 500 ? 'error' : 'warn',
        text: `${req.method} ${String(req.url || '').split('?')[0]} failed`,
        payload: {
          request_id: req.verifiedRequestId || null,
          job_id: req.evidenceJobId || null,
          status,
          error_code: error.code || 'INTERNAL_ERROR'
        }
      });
      return this._json(res, status, {
        error: status >= 500 ? 'internal_error' : error.message,
        code: error.code || 'INTERNAL_ERROR',
        status,
        requestId: req.verifiedRequestId || null,
        jobId: req.evidenceJobId || null
      });
    }
  }
}

module.exports = EvidenceSearchApiServer;
