'use strict';

const { secureGet } = require('./secure-http-transport');

const FORMATS = new Set(['JSON', 'JSONL', 'TEXT']);
const LIVE_SOURCE_CLASSES = new Set(['FREE_OFFICIAL_LIVE', 'FREE_PROJECTION']);
const PLACEHOLDERS = Object.freeze({
  query: (plan) => (plan.query_set || []).map((item) => item.text).join(' '),
  domain: (plan) => plan.domain_lens?.id || '',
  as_of: (plan) => plan.effective_as_of || '',
  request_id: (plan) => plan.request_id || ''
});

function getPath(value, dottedPath) {
  if (!dottedPath) return value;
  return String(dottedPath).split('.').filter(Boolean).reduce(
    (current, key) => current == null ? undefined : current[key],
    value
  );
}

function applyTemplate(template, plan) {
  return String(template).replace(/\{([a-z_]+)\}/g, (match, name) => {
    const resolver = PLACEHOLDERS[name];
    if (!resolver) {
      const error = new Error(`unsupported official source URL placeholder: ${name}`);
      error.code = 'SOURCE_TEMPLATE_INVALID';
      throw error;
    }
    return encodeURIComponent(resolver(plan));
  });
}

function mapField(item, specification) {
  if (typeof specification === 'string') return getPath(item, specification);
  if (!specification || typeof specification !== 'object' || Array.isArray(specification)) return specification;
  if (Object.hasOwn(specification, 'value')) return specification.value;
  if (specification.path) {
    const value = getPath(item, specification.path);
    return value === undefined ? specification.default : value;
  }
  return Object.fromEntries(Object.entries(specification).map(([key, value]) => [key, mapField(item, value)]));
}

function mapRecord(item, endpoint, provider) {
  const mapped = Object.fromEntries(Object.entries(endpoint.field_map || {}).map(([field, spec]) => [field, mapField(item, spec)]));
  const fixed = endpoint.fixed_fields || {};
  const record = {
    ...fixed,
    ...mapped,
    source_id: mapped.source_id || fixed.source_id || endpoint.endpoint_id,
    source_family_id: mapped.source_family_id || fixed.source_family_id || provider.source_family_id,
    capability_id: mapped.capability_id || fixed.capability_id || endpoint.capability_id || 'current_official',
    source_role: String(mapped.source_role || fixed.source_role || 'OFFICIAL').toUpperCase(),
    authority_id: mapped.authority_id || fixed.authority_id || endpoint.authority_id || provider.provider_id,
    publisher_id: mapped.publisher_id || fixed.publisher_id || endpoint.publisher_id || endpoint.authority_id || provider.provider_id,
    publisher_name: mapped.publisher_name || fixed.publisher_name || endpoint.publisher_name || endpoint.authority_id || provider.provider_id,
    retrieval_trace: {
      ...(fixed.retrieval_trace || {}),
      ...(mapped.retrieval_trace || {}),
      provider_id: provider.provider_id,
      endpoint_id: endpoint.endpoint_id,
      current_pointer_verified: true
    },
    rights: { access: 'public', ...(fixed.rights || {}), ...(mapped.rights || {}) }
  };
  if (record.excerpt != null) record.excerpt = String(record.excerpt).slice(0, endpoint.maximum_excerpt_chars || 32_768);
  if (record.title != null) record.title = String(record.title).slice(0, 2048);
  return record;
}

function parseResponse(response, endpoint, provider) {
  const format = endpoint.response_format;
  const text = response.body.toString(endpoint.encoding || 'utf8');
  if (format === 'TEXT') {
    return [mapRecord({ body: text, url: response.url, title: endpoint.title || endpoint.endpoint_id }, {
      ...endpoint,
      field_map: {
        canonical_url: { value: response.url },
        canonical_record_id: { value: `${endpoint.endpoint_id}:${response.url}` },
        title: 'title', excerpt: 'body', ...(endpoint.field_map || {})
      }
    }, provider)];
  }
  let parsed;
  if (format === 'JSON') parsed = JSON.parse(text);
  else if (format === 'JSONL') parsed = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const records = getPath(parsed, endpoint.records_path || '');
  const items = Array.isArray(records) ? records : records == null ? [] : [records];
  return items.slice(0, endpoint.maximum_records || 128).map((item) => mapRecord(item, endpoint, provider));
}

function normalizeEndpoint(raw, index, allowedHosts) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError(`endpoints[${index}] must be an object`);
  const endpointId = String(raw.endpoint_id || '').trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,126}[a-z0-9]$/i.test(endpointId)) throw new TypeError(`endpoints[${index}].endpoint_id is invalid`);
  const urlTemplate = String(raw.url_template || '').trim();
  if (!urlTemplate) throw new TypeError(`endpoints[${index}].url_template is required`);
  const probeUrl = new URL(urlTemplate.replace(/\{[a-z_]+\}/g, 'probe'));
  if (probeUrl.protocol !== 'https:') throw new TypeError(`endpoints[${index}] must use HTTPS`);
  if (!allowedHosts.has(probeUrl.hostname.toLowerCase())) throw new TypeError(`endpoints[${index}] host is not included in allowed_hosts`);
  const responseFormat = String(raw.response_format || 'JSON').toUpperCase();
  if (!FORMATS.has(responseFormat)) throw new TypeError(`endpoints[${index}].response_format is unsupported`);
  return Object.freeze({
    endpoint_id: endpointId, url_template: urlTemplate, response_format: responseFormat,
    records_path: String(raw.records_path || ''), field_map: Object.freeze({ ...(raw.field_map || {}) }), fixed_fields: Object.freeze({ ...(raw.fixed_fields || {}) }),
    authority_id: raw.authority_id ? String(raw.authority_id) : '', publisher_id: raw.publisher_id ? String(raw.publisher_id) : '', publisher_name: raw.publisher_name ? String(raw.publisher_name) : '',
    capability_id: raw.capability_id ? String(raw.capability_id) : 'current_official', title: raw.title ? String(raw.title) : endpointId,
    maximum_records: Math.max(1, Math.min(512, Number(raw.maximum_records || 128))), maximum_excerpt_chars: Math.max(256, Math.min(131_072, Number(raw.maximum_excerpt_chars || 32_768))),
    max_response_bytes: Math.max(1024, Math.min(32 * 1024 * 1024, Number(raw.max_response_bytes || 4 * 1024 * 1024))), timeout_ms: Math.max(100, Math.min(10_000, Number(raw.timeout_ms || 2500))), encoding: String(raw.encoding || 'utf8')
  });
}

function recordIdentity(record) {
  return String(record.canonical_record_id || record.record_id || record.id || record.canonical_url || record.url || '').trim();
}

function createFreeOfficialLiveProvider(options = {}) {
  const providerId = String(options.provider_id || '').trim();
  if (!providerId) throw new TypeError('provider_id is required');
  const allowedHosts = new Set((options.allowed_hosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) throw new TypeError('allowed_hosts must not be empty');
  const sourceFamilyId = String(options.source_family_id || providerId);
  const sourceClass = String(options.source_class || 'FREE_OFFICIAL_LIVE').toUpperCase();
  if (!LIVE_SOURCE_CLASSES.has(sourceClass)) throw new TypeError(`unsupported live source_class: ${sourceClass}`);
  const provider = { provider_id: providerId, source_class: sourceClass, source_family_id: sourceFamilyId };
  const endpoints = (options.endpoints || []).map((endpoint, index) => normalizeEndpoint(endpoint, index, allowedHosts));
  if (!endpoints.length) throw new TypeError('endpoints must not be empty');
  const transport = options.transport || secureGet;

  return Object.freeze({
    provider_id: providerId,
    source_class: sourceClass,
    source_family_id: sourceFamilyId,
    priority: Number.isInteger(options.priority) ? options.priority : 100,
    domains: Object.freeze([...(options.domains || [])].map((value) => String(value).toUpperCase())),
    capabilities: Object.freeze([...(options.capabilities || [])].map(String)),
    latency_p50_ms: Math.max(1, Number(options.latency_p50_ms || 500)),
    latency_p95_ms: Math.max(1, Number(options.latency_p95_ms || 1500)),
    maximum_cost_minor: 0,
    certified: options.certified !== false,

    async search(plan, context = {}) {
      const candidates = [], failures = [], queryResults = [];
      let bytes = 0, requests = 0;
      const queries = Array.isArray(plan.query_set) ? plan.query_set : [];
      for (const query of queries) {
        const queryCandidates = [], queryFailures = [];
        let completedEndpoints = 0;
        const singleQueryPlan = Object.freeze({ ...plan, query_set: Object.freeze([query]) });
        for (const endpoint of endpoints) {
          try {
            const url = applyTemplate(endpoint.url_template, singleQueryPlan);
            const response = await transport(url, {
              allowedHosts: [...allowedHosts], maxBytes: endpoint.max_response_bytes,
              timeoutMs: Math.min(endpoint.timeout_ms, Math.max(100, Number(context.deadline_at || 0) - Date.now() || endpoint.timeout_ms)), signal: context.signal
            });
            requests += 1; bytes += response.body.length;
            if (response.status < 200 || response.status >= 300) {
              const error = new Error(`official source returned HTTP ${response.status}`); error.code = `SOURCE_HTTP_${response.status}`; throw error;
            }
            completedEndpoints += 1;
            const records = parseResponse(response, endpoint, provider).map((record) => ({
              ...record,
              retrieval_trace: { ...(record.retrieval_trace || {}), query_id: query.query_id, query_role: query.role || query.class || null }
            }));
            queryCandidates.push(...records);
          } catch (error) {
            const failure = { query_id: query.query_id, endpoint_id: endpoint.endpoint_id, code: error.code || 'SOURCE_REQUEST_FAILED', message: error.message };
            queryFailures.push(failure); failures.push(failure);
          }
        }
        candidates.push(...queryCandidates);
        const status = completedEndpoints === 0 ? 'RETRIEVAL_FAILED' : queryCandidates.length ? 'FOUND' : 'NOT_FOUND';
        queryResults.push(Object.freeze({
          query_id: String(query.query_id), retrieval_status: status,
          candidate_record_ids: Object.freeze([...new Set(queryCandidates.map(recordIdentity).filter(Boolean))].sort()),
          error_code: status === 'RETRIEVAL_FAILED' ? (queryFailures[0]?.code || 'OFFICIAL_SOURCE_ALL_FAILED') : null,
          endpoint_count: endpoints.length, completed_endpoint_count: completedEndpoints
        }));
      }

      const completeQueries = queryResults.filter((item) => item.retrieval_status !== 'RETRIEVAL_FAILED').length;
      return Object.freeze({
        coverage_state: completeQueries === queryResults.length ? 'COMPLETE_FOR_QUERY_SCOPE' : completeQueries ? 'PARTIAL_FOR_QUERY_SCOPE' : 'UNKNOWN',
        candidates: Object.freeze(candidates),
        query_results: Object.freeze(queryResults),
        current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), coverage_state: completeQueries === queryResults.length ? 'COMPLETE' : completeQueries ? 'PARTIAL' : 'UNKNOWN' }),
        usage: Object.freeze({ requests, results: candidates.length, response_bytes: bytes, query_count: queries.length }),
        failures: Object.freeze(failures)
      });
    }
  });
}

module.exports = { applyTemplate, createFreeOfficialLiveProvider, getPath, mapRecord, parseResponse };
