'use strict';

const { securePostJson } = require('./secure-json-post-transport');
const { getPath, mapRecord } = require('./free-official-live-provider');

function templateValue(value, plan) {
  if (typeof value === 'string') {
    return value.replace(/\{([a-z_]+)\}/g, (match, name) => {
      if (name === 'query') return (plan.query_set || []).map((item) => item.text).join(' ');
      if (name === 'domain') return plan.domain_lens?.id || '';
      if (name === 'as_of') return plan.effective_as_of || '';
      if (name === 'request_id') return plan.request_id || '';
      const error = new Error(`unsupported POST JSON placeholder: ${name}`);
      error.code = 'SOURCE_TEMPLATE_INVALID';
      throw error;
    });
  }
  if (Array.isArray(value)) return value.map((item) => templateValue(item, plan));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, templateValue(child, plan)]));
  return value;
}

function recordIdentity(record) {
  return String(record.canonical_record_id || record.record_id || record.id || record.canonical_url || record.url || '').trim();
}

function normalizeEndpoint(raw, allowedHosts) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('endpoint must be an object');
  const endpointId = String(raw.endpoint_id || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,126}[a-z0-9]$/i.test(endpointId)) throw new TypeError('endpoint.endpoint_id is invalid');
  const url = String(raw.url || raw.url_template || '').trim();
  if (!url) throw new TypeError('endpoint.url is required');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname.toLowerCase())) throw new TypeError('endpoint URL must use an allowed HTTPS host');
  if (!raw.request_body || typeof raw.request_body !== 'object' || Array.isArray(raw.request_body)) throw new TypeError('endpoint.request_body must be an object');
  return Object.freeze({
    endpoint_id: endpointId,
    url,
    request_body: Object.freeze({ ...raw.request_body }),
    request_headers: Object.freeze(Object.fromEntries(Object.entries(raw.request_headers || {}).map(([key, value]) => [String(key), String(value)]))),
    records_path: String(raw.records_path || ''),
    field_map: Object.freeze({ ...(raw.field_map || {}) }),
    fixed_fields: Object.freeze({ ...(raw.fixed_fields || {}) }),
    authority_id: String(raw.authority_id || ''),
    publisher_id: String(raw.publisher_id || ''),
    publisher_name: String(raw.publisher_name || raw.authority_id || ''),
    capability_id: String(raw.capability_id || 'official_post_json_search'),
    maximum_records: Math.max(1, Math.min(128, Number(raw.maximum_records || 20))),
    max_request_bytes: Math.max(1024, Math.min(1024 * 1024, Number(raw.max_request_bytes || 256 * 1024))),
    max_response_bytes: Math.max(1024, Math.min(32 * 1024 * 1024, Number(raw.max_response_bytes || 4 * 1024 * 1024))),
    timeout_ms: Math.max(100, Math.min(15_000, Number(raw.timeout_ms || 5000))),
    maximum_attempts: Math.max(1, Math.min(3, Number(raw.maximum_attempts || 1)))
  });
}

function createPostJsonProvider(options = {}) {
  const providerId = String(options.provider_id || '').trim();
  if (!providerId) throw new TypeError('provider_id is required');
  const allowedHosts = new Set((options.allowed_hosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) throw new TypeError('allowed_hosts must not be empty');
  const sourceFamilyId = String(options.source_family_id || providerId);
  const endpoint = normalizeEndpoint(options.endpoint || (Array.isArray(options.endpoints) ? options.endpoints[0] : null), allowedHosts);
  const transport = options.transport || securePostJson;
  const providerShape = { provider_id: providerId, source_family_id: sourceFamilyId };

  return Object.freeze({
    provider_id: providerId,
    source_class: 'FREE_OFFICIAL_LIVE',
    source_family_id: sourceFamilyId,
    priority: Number.isInteger(options.priority) ? options.priority : 100,
    domains: Object.freeze([...(options.domains || [])].map((value) => String(value).toUpperCase())),
    capabilities: Object.freeze([...(options.capabilities || [])].map(String)),
    routing_terms: Object.freeze([...(options.routing_terms || [])].map(String)),
    latency_p50_ms: Math.max(1, Number(options.latency_p50_ms || 700)),
    latency_p95_ms: Math.max(1, Number(options.latency_p95_ms || 2500)),
    maximum_cost_minor: 0,
    certified: options.certified !== false,

    async search(plan, context = {}) {
      const candidates = [], failures = [], queryResults = [];
      let requests = 0, responseBytes = 0;
      for (const query of Array.isArray(plan.query_set) ? plan.query_set : []) {
        const singleQueryPlan = Object.freeze({ ...plan, query_set: Object.freeze([query]) });
        let endpointError = null;
        let mapped = [];
        for (let attempt = 1; attempt <= endpoint.maximum_attempts; attempt += 1) {
          try {
            const remaining = Number(context.deadline_at || 0) - Date.now();
            if (Number(context.deadline_at || 0) > 0 && remaining <= 0) {
              const error = new Error('official source deadline exhausted before request');
              error.code = 'SOURCE_DEADLINE_EXCEEDED';
              throw error;
            }
            const payload = templateValue(endpoint.request_body, singleQueryPlan);
            requests += 1;
            const response = await transport(endpoint.url, payload, {
              allowedHosts: [...allowedHosts],
              maxRequestBytes: endpoint.max_request_bytes,
              maxResponseBytes: endpoint.max_response_bytes,
              timeoutMs: Math.min(endpoint.timeout_ms, remaining > 0 ? Math.max(100, remaining) : endpoint.timeout_ms),
              headers: endpoint.request_headers,
              signal: context.signal
            });
            responseBytes += response.body.length;
            if (response.status < 200 || response.status >= 300) {
              const error = new Error(`official source returned HTTP ${response.status}`);
              error.code = `SOURCE_HTTP_${response.status}`;
              throw error;
            }
            const parsed = JSON.parse(response.body.toString('utf8'));
            const records = getPath(parsed, endpoint.records_path);
            const items = Array.isArray(records) ? records : records == null ? [] : [records];
            mapped = items.slice(0, endpoint.maximum_records).map((item) => {
              const record = mapRecord(item, endpoint, providerShape);
              return Object.freeze({
                ...record,
                retrieval_trace: Object.freeze({ ...(record.retrieval_trace || {}), query_id: query.query_id, query_role: query.role || query.class || null })
              });
            });
            endpointError = null;
            break;
          } catch (error) {
            endpointError = error;
            const code = String(error.code || '');
            const retryable = code === 'SOURCE_TIMEOUT' || /^SOURCE_HTTP_(429|500|502|503|504)$/.test(code);
            if (!retryable || attempt >= endpoint.maximum_attempts) break;
          }
        }
        if (endpointError) {
          failures.push(Object.freeze({ query_id: query.query_id, endpoint_id: endpoint.endpoint_id, code: endpointError.code || 'SOURCE_REQUEST_FAILED', message: endpointError.message }));
        }
        candidates.push(...mapped);
        const status = endpointError ? 'RETRIEVAL_FAILED' : mapped.length ? 'FOUND' : 'NOT_FOUND';
        queryResults.push(Object.freeze({
          query_id: String(query.query_id),
          retrieval_status: status,
          candidate_record_ids: Object.freeze([...new Set(mapped.map(recordIdentity).filter(Boolean))].sort()),
          error_code: status === 'RETRIEVAL_FAILED' ? (endpointError.code || 'SOURCE_REQUEST_FAILED') : null,
          endpoint_count: 1,
          completed_endpoint_count: endpointError ? 0 : 1
        }));
      }
      const complete = queryResults.filter((item) => item.retrieval_status !== 'RETRIEVAL_FAILED').length;
      return Object.freeze({
        coverage_state: complete === queryResults.length ? 'COMPLETE_FOR_QUERY_SCOPE' : complete ? 'PARTIAL_FOR_QUERY_SCOPE' : 'UNKNOWN',
        candidates: Object.freeze(candidates),
        query_results: Object.freeze(queryResults),
        current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), coverage_state: complete === queryResults.length ? 'COMPLETE' : complete ? 'PARTIAL' : 'UNKNOWN' }),
        usage: Object.freeze({ requests, results: candidates.length, response_bytes: responseBytes, query_count: queryResults.length }),
        failures: Object.freeze(failures)
      });
    }
  });
}

module.exports = { createPostJsonProvider, normalizeEndpoint, templateValue };
