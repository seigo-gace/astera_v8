'use strict';

const EvaluatorApiServer = require('./server');
const { parseJsonStrict } = require('../../safe-json');
const { evaluateInformationQuality } = require('..');
const {
  ReplayNonceGuard,
  hasInternalServiceSecret,
  loadInternalServiceSecret,
  verifyInternalRequest
} = require('../../internal-service-auth');

const MAX_INTERNAL_REQUEST_BYTES = 1024 * 1024;

function statusForInternalError(error) {
  const code = String(error?.code || '');
  if (code === 'INTERNAL_AUTH_REQUIRED' || code === 'INTERNAL_SIGNATURE_INVALID') return 401;
  if (
    code === 'INTERNAL_SERVICE_FORBIDDEN'
    || code === 'INTERNAL_REPLAY_DETECTED'
    || code === 'INTERNAL_REQUEST_EXPIRED'
    || code === 'INTERNAL_BODY_HASH_MISMATCH'
  ) return 403;
  if (code.startsWith('INVALID_') || code === 'INFORMATION_PROFILE_INVALID') return 400;
  const requested = Number(error?.status);
  return requested >= 400 && requested <= 599 ? requested : 500;
}

class EvaluatorApiServerWithInternal extends EvaluatorApiServer {
  constructor(options = {}) {
    super(options);
    this.internalEndpointEnabled = hasInternalServiceSecret({
      secret: options.internalSecret,
      secretFile: options.internalSecretFile
    });
    this.internalSecret = this.internalEndpointEnabled
      ? loadInternalServiceSecret({
        secret: options.internalSecret,
        secretFile: options.internalSecretFile
      })
      : null;
    this.internalNonceGuard = options.internalNonceGuard || new ReplayNonceGuard();
  }

  async _readInternalRawBody(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_INTERNAL_REQUEST_BYTES) {
        const error = new Error('Payload too large');
        error.status = 413;
        throw error;
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks, total);
  }

  async _handle(req, res) {
    const pathname = String(req.url || '').split('?')[0];
    const internalRoute = req.method === 'POST'
      && pathname === '/internal/v1/information-quality/evaluate';

    if (!internalRoute) return super._handle(req, res);

    try {
      if (!this.internalEndpointEnabled) {
        return this._json(req, res, 503, {
          error: 'internal_evaluator_not_configured'
        });
      }

      const rawBody = await this._readInternalRawBody(req);
      const identity = verifyInternalRequest({
        headers: req.headers,
        body: rawBody,
        secret: this.internalSecret,
        nonceGuard: this.internalNonceGuard,
        expectedService: 'astera-evidence-search'
      });
      req.requestId = identity.request_id;

      const input = parseJsonStrict(rawBody);
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        const error = new Error('JSON body must be an object');
        error.code = 'INVALID_INFORMATION_QUALITY_REQUEST';
        throw error;
      }

      const result = evaluateInformationQuality(input);
      if (result.status === 'ERROR') {
        const error = new Error(result.error || 'information quality evaluation failed');
        error.code = result.blocking_reasons?.[0] || 'INFORMATION_QUALITY_ERROR';
        error.status = 400;
        throw error;
      }

      this.logger.write({
        tenantId: identity.tenant_id,
        type: 'information_quality_internal_completed',
        text: `Information quality evaluator returned ${result.status}`,
        payload: {
          request_id: identity.request_id,
          phase: result.phase,
          status: result.status,
          score_bp: result.score_bp,
          profile_version: result.profile_version,
          profile_hash: result.profile_hash
        }
      });
      return this._json(req, res, 200, result);
    } catch (error) {
      const status = statusForInternalError(error);
      this.logger.write({
        tenantId: 'internal-evidence-search',
        type: 'information_quality_internal_failed',
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

module.exports = EvaluatorApiServerWithInternal;
