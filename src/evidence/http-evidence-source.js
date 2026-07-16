'use strict';

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function assertHttpUrl(value, name) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`${name} must use http or https`);
  return url.toString();
}

class HttpEvidenceSource {
  constructor(options = {}) {
    this.id = String(options.id || options.channel || 'evidence-source');
    this.channel = String(options.channel || 'published_text');
    this.searchUrl = assertHttpUrl(options.searchUrl, `${this.id}.searchUrl`);
    this.fetchUrl = options.fetchUrl ? assertHttpUrl(options.fetchUrl, `${this.id}.fetchUrl`) : '';
    this.sourceClass = String(options.sourceClass || 'specialist_kb');
    this.timeoutMs = positiveInteger(options.timeoutMs || process.env.ASTERA_EVIDENCE_TIMEOUT_MS, 5_000);
    this.maxResponseBytes = positiveInteger(options.maxResponseBytes || process.env.ASTERA_EVIDENCE_MAX_RESPONSE_BYTES, 5 * 1024 * 1024);
    this.apiKey = String(options.apiKey || '');
    this.apiKeyHeader = String(options.apiKeyHeader || 'authorization').toLowerCase();
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') throw new Error('Global fetch is unavailable');
  }

  headers({ requestId, tenantId } = {}) {
    const headers = {
      'content-type': 'application/json',
      'accept': 'application/json',
      'x-astera-request-id': String(requestId || '')
    };
    if (tenantId) headers['x-astera-tenant-id'] = String(tenantId);
    if (this.apiKey) {
      headers[this.apiKeyHeader] = this.apiKeyHeader === 'authorization' && !/^\w+\s/.test(this.apiKey)
        ? `Bearer ${this.apiKey}`
        : this.apiKey;
    }
    return headers;
  }

  async requestJson(url, body, meta = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: this.headers(meta),
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      if (Buffer.byteLength(text) > this.maxResponseBytes) throw new Error(`${this.id} response exceeds limit`);
      if (!response.ok) throw new Error(`${this.id} returned HTTP ${response.status}`);
      if (!text.trim()) return {};
      return JSON.parse(text);
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error(`${this.id} timed out after ${this.timeoutMs}ms`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async search({ requestId, keywordPacket, limit, tenantId } = {}) {
    const payload = {
      schema_version: 'astera.evidence.search.request.v1',
      request_id: requestId,
      channel: this.channel,
      source_policy: this.channel === 'official_live' ? 'OFFICIAL_PRIMARY_ONLY' : 'PUBLIC_SPECIALIST_KB_ONLY',
      query: keywordPacket,
      limit
    };
    const response = await this.requestJson(this.searchUrl, payload, { requestId, tenantId });
    const items = Array.isArray(response) ? response : (response.items || response.results || response.hits || []);
    if (!Array.isArray(items)) throw new Error(`${this.id} search response must contain an item array`);
    return items;
  }

  async fetchDetails({ requestId, hits, keywordPacket, tenantId } = {}) {
    if (!this.fetchUrl || !hits?.length) return [];
    const payload = {
      schema_version: 'astera.evidence.fetch.request.v1',
      request_id: requestId,
      channel: this.channel,
      query: keywordPacket,
      hits: hits.map((hit) => ({
        source_id: hit.source_id || null,
        record_id: hit.record_id || null,
        file_id: hit.file_id || null,
        segment_id: hit.segment_id || null,
        fetch_token: hit.fetch_token || null,
        location: hit.location || null
      }))
    };
    const response = await this.requestJson(this.fetchUrl, payload, { requestId, tenantId });
    const items = Array.isArray(response) ? response : (response.items || response.results || response.hits || []);
    if (!Array.isArray(items)) throw new Error(`${this.id} fetch response must contain an item array`);
    return items;
  }
}

module.exports = HttpEvidenceSource;
