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

function normalizeMetadataValue(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 256 || /[\u0000-\u001f\u007f]/.test(normalized)) return '';
  return normalized;
}

function resolveMetadata(overrides = {}) {
  const defaults = {
    source: process.env.ASTERA_TGS_SOURCE || 'astera-v8',
    repo: process.env.ASTERA_TGS_REPO || process.env.GITHUB_REPOSITORY || 'seigo-gace/astera_v8',
    branch: process.env.ASTERA_TGS_BRANCH || process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || '',
    workflow: process.env.ASTERA_TGS_WORKFLOW || process.env.GITHUB_WORKFLOW || '',
    run_id: process.env.ASTERA_TGS_RUN_ID || process.env.GITHUB_RUN_ID || '',
    module: process.env.ASTERA_TGS_MODULE || 'core'
  };
  const result = {};
  for (const field of ['source', 'repo', 'branch', 'workflow', 'run_id', 'module']) {
    const value = normalizeMetadataValue(overrides[field] ?? defaults[field]);
    if (value) result[field] = value;
  }
  return result;
}

class TgsClient {
  constructor({
    url = process.env.ASTERA_TGS_URL || 'http://127.0.0.1:3000/ingest',
    projectId = process.env.ASTERA_TGS_PROJECT_ID || 'P002',
    timeoutMs = Number(process.env.ASTERA_TGS_TIMEOUT_MS || 20_000),
    retries = Number(process.env.ASTERA_TGS_RETRIES || 3),
    metadata = {},
    fetchImpl = globalThis.fetch
  } = {}) {
    this.url = normalizeEndpoint(url);
    this.projectId = /^P\d+$/.test(String(projectId)) ? String(projectId) : 'P002';
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 20_000);
    this.retries = Math.max(1, Math.min(10, Number(retries) || 3));
    this.metadata = resolveMetadata(metadata);
    this.fetch = fetchImpl;
  }

  async deliver(row) {
    if (!this.url || typeof this.fetch !== 'function') return false;
    for (let attempt = 1; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('TGserver request timeout')), this.timeoutMs);
      timer.unref?.();
      try {
        const source = normalizeMetadataValue(row?.source) || this.metadata.source;
        const metadata = { ...this.metadata, ...(source ? { source } : {}) };
        const response = await this.fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: this.projectId,
            severity: row.severity,
            timestamp: row.at,
            hint: row.type,
            message: JSON.stringify(row),
            ...metadata
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
module.exports.normalizeMetadataValue = normalizeMetadataValue;
module.exports.resolveMetadata = resolveMetadata;
