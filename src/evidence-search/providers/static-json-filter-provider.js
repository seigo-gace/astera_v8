'use strict';

const { secureGet } = require('./secure-http-transport');
const { getPath, mapRecord } = require('./free-official-live-provider');

function normalizeText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).normalize('NFKC').toLowerCase();
  }
  return JSON.stringify(value).normalize('NFKC').toLowerCase();
}

function queryTokens(value) {
  return normalizeText(value).split(/\s+/).map((token) => token.trim()).filter(Boolean);
}

function recordMatchesQuery(record, query, filterFields) {
  const tokens = queryTokens(query);
  if (!tokens.length) return false;
  const haystack = filterFields.map((field) => normalizeText(getPath(record, field))).filter(Boolean).join(' ');
  return tokens.every((token) => haystack.includes(token));
}

function normalizeEndpoint(raw, allowedHosts) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('endpoint must be an object');
  const endpointId = String(raw.endpoint_id || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,126}[a-z0-9]$/i.test(endpointId)) throw new TypeError('endpoint.endpoint_id is invalid');
  const url = String(raw.url || raw.url_template || '').trim();
  if (!url) throw new TypeError('endpoint.url is required');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new TypeError('endpoint.url must use HTTPS');
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) throw new TypeError('endpoint host is not included in allowed_hosts');
  const filterFields = [...new Set((raw.filter_fields || []).map(String).filter(Boolean))];
  if (!filterFields.length) throw new TypeError('endpoint.filter_fields must not be empty');
  return Object.freeze({
    endpoint_id: endpointId,
    url,
    records_path: String(raw.records_path || ''),
    filter_fields: Object.freeze(filterFields),
    field_map: Object.freeze({ ...(raw.field_map || {}) }),
    fixed_fields: Object.freeze({ ...(raw.fixed_fields || {}) }),
    authority_id: String(raw.authority_id || ''),
    publisher_id: String(raw.publisher_id || ''),
    publisher_name: String(raw.publisher_name || raw.authority_id || ''),
    capability_id: String(raw.capability_id || 'static_registry_search'),
    maximum_records: Math.max(1, Math.min(128, Number(raw.maximum_records || 20))),
    max_source_records: Math.max(1, Math.min(100_000, Number(raw.max_source_records || 50_000))),
    max_response_bytes: Math.max(1024, Math.min(32 * 1024 * 1024, Number(raw.max_response_bytes || 8 * 1024 * 1024))),
    timeout_ms: Math.max(100, Math.min(15_000, Number(raw.timeout_ms || 5000))),
    cache_ttl_ms: Math.max(0, Math.min(60 * 60 * 1000, Number(raw.cache_ttl_ms || 300_000))),
    request_headers: Object.freeze(Object.fromEntries(Object.entries(raw.request_headers || {}).map(([key, value]) => [String(key), String(value)])))
  });
}

function recordIdentity(record) {
  return String(record.canonical_record_id || record.record_id || record.id || record.canonical_url || record.url || '').trim();
}

function createStaticJsonFilterProvider(options = {}) {
  const providerId = String(options.provider_id || '').trim();
  if (!providerId) throw new TypeError('provider_id is required');
  const allowedHosts = new Set((options.allowed_hosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) throw new TypeError('allowed_hosts must not be empty');
  const sourceFamilyId = String(options.source_family_id || providerId);
  const endpoint = normalizeEndpoint(options.endpoint || (Array.isArray(options.endpoints) ? options.endpoints[0] : null), allowedHosts);
  const transport = options.transport || secureGet;
  const providerShape = { provider_id: providerId, source_family_id: sourceFamilyId };
  let cache = null;

  async function loadRecords(context) {
    const now = Date.now();
    if (cache && endpoint.cache_ttl_ms > 0 && now - cache.fetched_at < endpoint.cache_ttl_ms) {
      return { records: cache.records, responseBytes: 0, requests: 0, cacheHit: true, sourceUrl: cache.source_url };
    }
    const remaining = Number(context.deadline_at || 0) - now;
    if (Number(context.deadline_at || 0) > 0 && remaining <= 0) {
      const error = new Error('static source deadline exhausted before request');
      error.code = 'SOURCE_DEADLINE_EXCEEDED';
      throw error;
    }
    const response = await transport(endpoint.url, {
      allowedHosts: [...allowedHosts],
      maxBytes: endpoint.max_response_bytes,
      timeoutMs: Math.min(endpoint.timeout_ms, remaining > 0 ? Math.max(100, remaining) : endpoint.timeout_ms),
      headers: endpoint.request_headers,
      signal: context.signal
    });
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`static source returned HTTP ${response.status}`);
      error.code = `SOURCE_HTTP_${response.status}`;
      throw error;
    }
    const parsed = JSON.parse(response.body.toString('utf8'));
    const rawRecords = getPath(parsed, endpoint.records_path);
    const records = (Array.isArray(rawRecords) ? rawRecords : rawRecords == null ? [] : [rawRecords]).slice(0, endpoint.max_source_records);
    cache = Object.freeze({ records: Object.freeze(records), fetched_at: now, source_url: response.url || endpoint.url });
    return { records: cache.records, responseBytes: response.body.length, requests: 1, cacheHit: false, sourceUrl: cache.source_url };
  }

  return Object.freeze({
    provider_id: providerId,
    source_class: 'FREE_OFFICIAL_LIVE',
    source_family_id: sourceFamilyId,
    priority: Number.isInteger(options.priority) ? options.priority : 100,
    domains: Object.freeze([...(options.domains || [])].map((value) => String(value).toUpperCase())),
    capabilities: Object.freeze([...(options.capabilities || [])].map(String)),
    routing_terms: Object.freeze([...(options.routing_terms || [])].map(String)),
    latency_p50_ms: Math.max(1, Number(options.latency_p50_ms || 80)),
    latency_p95_ms: Math.max(1, Number(options.latency_p95_ms || 500)),
    maximum_cost_minor: 0,
    certified: options.certified !== false,

    async search(plan, context = {}) {
      const queries = Array.isArray(plan.query_set) ? plan.query_set : [];
      const candidates = [], queryResults = [], failures = [];
      let loaded;
      try {
        loaded = await loadRecords(context);
      } catch (error) {
        for (const query of queries) {
          queryResults.push(Object.freeze({ query_id: String(query.query_id), retrieval_status: 'RETRIEVAL_FAILED', candidate_record_ids: Object.freeze([]), error_code: error.code || 'SOURCE_REQUEST_FAILED', endpoint_count: 1, completed_endpoint_count: 0 }));
        }
        failures.push(Object.freeze({ endpoint_id: endpoint.endpoint_id, code: error.code || 'SOURCE_REQUEST_FAILED', message: error.message }));
        return Object.freeze({ coverage_state: 'UNKNOWN', candidates: Object.freeze([]), query_results: Object.freeze(queryResults), current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), coverage_state: 'UNKNOWN' }), usage: Object.freeze({ requests: 1, results: 0, response_bytes: 0, query_count: queries.length, cache_hit: false }), failures: Object.freeze(failures) });
      }

      for (const query of queries) {
        const matches = loaded.records.filter((record) => recordMatchesQuery(record, query.text, endpoint.filter_fields)).slice(0, endpoint.maximum_records);
        const mapped = matches.map((item) => {
          const record = mapRecord(item, endpoint, providerShape);
          return Object.freeze({ ...record, retrieval_trace: Object.freeze({ ...(record.retrieval_trace || {}), source_url: loaded.sourceUrl, query_id: query.query_id, query_role: query.role || query.class || null }) });
        });
        candidates.push(...mapped);
        queryResults.push(Object.freeze({
          query_id: String(query.query_id),
          retrieval_status: mapped.length ? 'FOUND' : 'NOT_FOUND',
          candidate_record_ids: Object.freeze([...new Set(mapped.map(recordIdentity).filter(Boolean))].sort()),
          error_code: null,
          endpoint_count: 1,
          completed_endpoint_count: 1
        }));
      }

      return Object.freeze({
        coverage_state: 'COMPLETE_FOR_QUERY_SCOPE',
        candidates: Object.freeze(candidates),
        query_results: Object.freeze(queryResults),
        current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), coverage_state: 'COMPLETE', cache_hit: loaded.cacheHit }),
        usage: Object.freeze({ requests: loaded.requests, results: candidates.length, response_bytes: loaded.responseBytes, query_count: queries.length, cache_hit: loaded.cacheHit }),
        failures: Object.freeze([])
      });
    }
  });
}

module.exports = { createStaticJsonFilterProvider, normalizeText, queryTokens, recordMatchesQuery };
