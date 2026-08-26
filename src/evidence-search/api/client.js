'use strict';

const {
  createInternalHeaders,
  loadInternalServiceSecret
} = require('./internal-auth');

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

class EvidenceSearchClient {
  constructor(options = {}) {
    this.baseUrl = String(
      options.baseUrl
      || process.env.ASTERA_EVIDENCE_URL
      || `http://${process.env.ASTERA_EVIDENCE_HOST || '127.0.0.1'}:${process.env.ASTERA_EVIDENCE_PORT || 7375}`
    ).replace(/\/+$/, '');
    this.timeoutMs = positiveInteger(
      options.timeoutMs || process.env.ASTERA_EVIDENCE_CLIENT_TIMEOUT_MS,
      8500
    );
    this.secret = loadInternalServiceSecret({
      secret: options.internalSecret,
      secretFile: options.internalSecretFile
    });
    this.fetch = options.fetch || globalThis.fetch;
    if (typeof this.fetch !== 'function') {
      throw new Error('EvidenceSearchClient requires fetch');
    }
  }

  async search(payload, context = {}) {
    const body = JSON.stringify(payload);
    const controller = new AbortController();
    const externalSignal = context.signal || null;
    let timedOut = false;
    let externallyCancelled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const onExternalAbort = () => {
      externallyCancelled = true;
      controller.abort();
    };
    if (externalSignal) {
      if (externalSignal.aborted) onExternalAbort();
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    try {
      const headers = createInternalHeaders({
        body,
        secret: this.secret,
        service: 'astera-main',
        tenantId: context.tenantId,
        requestId: context.requestId,
        ttlMs: Math.min(this.timeoutMs + 5000, 60_000)
      });
      const response = await this.fetch(
        `${this.baseUrl}/internal/v1/evidence/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headers
          },
          body,
          signal: controller.signal
        }
      );
      const text = await response.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const error = new Error('evidence search API returned invalid JSON');
        error.code = 'EVIDENCE_API_INVALID_RESPONSE';
        error.status = 502;
        throw error;
      }
      if (!response.ok) {
        const error = new Error(parsed.error || 'evidence search API request failed');
        error.code = parsed.code || 'EVIDENCE_API_REQUEST_FAILED';
        error.status = response.status;
        error.details = parsed;
        throw error;
      }
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (externallyCancelled || externalSignal?.aborted) {
          const cancelled = new Error('evidence search API cancelled by caller');
          cancelled.code = 'EVIDENCE_API_CANCELLED';
          cancelled.status = 499;
          throw cancelled;
        }
        if (timedOut) {
          const timeout = new Error('evidence search API timed out');
          timeout.code = 'EVIDENCE_API_TIMEOUT';
          timeout.status = 504;
          throw timeout;
        }
      }
      throw error;
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', onExternalAbort);
    }
  }

  async health() {
    const response = await this.fetch(`${this.baseUrl}/healthz`, {
      method: 'GET',
      signal: AbortSignal.timeout(Math.min(this.timeoutMs, 3000))
    });
    if (!response.ok) return null;
    return response.json();
  }
}

module.exports = EvidenceSearchClient;
