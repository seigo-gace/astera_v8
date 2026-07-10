'use strict';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('ASTERA_TGS_URL must use http or https');
  return url.toString();
}

class TgsClient {
  constructor({
    url = process.env.ASTERA_TGS_URL || 'http://127.0.0.1:3000/ingest',
    projectId = process.env.ASTERA_TGS_PROJECT_ID || 'P002',
    timeoutMs = Number(process.env.ASTERA_TGS_TIMEOUT_MS || 20_000),
    retries = Number(process.env.ASTERA_TGS_RETRIES || 3),
    fetchImpl = globalThis.fetch
  } = {}) {
    this.url = normalizeEndpoint(url);
    this.projectId = /^P\d+$/.test(String(projectId)) ? String(projectId) : 'P002';
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 20_000);
    this.retries = Math.max(1, Math.min(10, Number(retries) || 3));
    this.fetch = fetchImpl;
  }

  async deliver(row) {
    if (!this.url || typeof this.fetch !== 'function') return false;
    for (let attempt = 1; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('TGserver request timeout')), this.timeoutMs);
      timer.unref?.();
      try {
        const response = await this.fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: this.projectId,
            severity: row.severity,
            timestamp: row.at,
            hint: row.type,
            message: JSON.stringify(row)
          }),
          signal: controller.signal
        });
        if (response.ok) return true;
        await response.text().catch(() => '');
      } catch (_) {
        // Retry; the caller owns durable outbox state.
      } finally {
        clearTimeout(timer);
      }
      if (attempt < this.retries) await sleep(Math.min(5000, 250 * (2 ** (attempt - 1))));
    }
    return false;
  }
}

module.exports = TgsClient;
module.exports.normalizeEndpoint = normalizeEndpoint;
