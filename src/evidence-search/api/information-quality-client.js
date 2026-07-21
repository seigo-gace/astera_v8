'use strict';

const {
  createInternalHeaders,
  loadInternalServiceSecret
} = require('./internal-auth');

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

class InformationQualityClient {
  constructor(options = {}) {
    this.baseUrl = String(
      options.baseUrl
      || process.env.ASTERA_EVALUATOR_API_URL
      || `http://${process.env.ASTERA_EVALUATOR_API_HOST || '127.0.0.1'}:${process.env.ASTERA_EVALUATOR_API_PORT || 7374}`
    ).replace(/\/+$/, '');
    this.timeoutMs = positiveInteger(
      options.timeoutMs || process.env.ASTERA_EVALUATOR_CLIENT_TIMEOUT_MS,
      1000
    );
    this.secret = loadInternalServiceSecret({
      secret: options.internalSecret,
      secretFile: options.internalSecretFile
    });
    this.fetch = options.fetch || globalThis.fetch;
    if (typeof this.fetch !== 'function') {
      throw new Error('InformationQualityClient requires fetch');
    }
  }

  async evaluate(request, context = {}) {
    const body = JSON.stringify(request);
    const controller = new AbortController();
    const remainingMs = typeof context.remaining_ms === 'function'
      ? context.remaining_ms()
      : this.timeoutMs;
    const timeoutMs = Math.max(100, Math.min(this.timeoutMs, remainingMs));
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers = createInternalHeaders({
        body,
        secret: this.secret,
        service: 'astera-evidence-search',
        tenantId: context.tenant_id || 'internal-evidence-search',
        requestId: context.request_id || request.request_id || 'information-quality',
        ttlMs: Math.min(timeoutMs + 5000, 60_000)
      });
      const response = await this.fetch(
        `${this.baseUrl}/internal/v1/information-quality/evaluate`,
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
        const error = new Error('information quality API returned invalid JSON');
        error.code = 'INFORMATION_QUALITY_API_INVALID_RESPONSE';
        error.status = 502;
        throw error;
      }
      if (!response.ok) {
        const error = new Error(parsed.error || 'information quality API request failed');
        error.code = parsed.code || 'INFORMATION_QUALITY_API_REQUEST_FAILED';
        error.status = response.status;
        error.details = parsed;
        throw error;
      }
      return parsed;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeout = new Error('information quality API timed out');
        timeout.code = 'INFORMATION_QUALITY_API_TIMEOUT';
        timeout.status = 504;
        throw timeout;
      }
      throw error;
    } finally {
      clearTimeout(timer);
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

module.exports = InformationQualityClient;
