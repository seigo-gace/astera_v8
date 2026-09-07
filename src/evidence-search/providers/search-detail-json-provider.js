'use strict';

const { secureGet } = require('./secure-http-transport');

function getPath(value, dottedPath) {
  if (!dottedPath) return value;
  return String(dottedPath).split('.').filter(Boolean).reduce(
    (current, key) => current == null ? undefined : current[key],
    value
  );
}

function mapField(item, specification) {
  if (typeof specification === 'string') return getPath(item, specification);
  if (!specification || typeof specification !== 'object' || Array.isArray(specification)) return specification;
  if (Object.hasOwn(specification, 'value')) return specification.value;
  if (specification.path) {
    const value = getPath(item, specification.path);
    if (value === undefined) return specification.default;
    return specification.stringify ? JSON.stringify(value) : value;
  }
  return Object.fromEntries(Object.entries(specification).map(([key, value]) => [key, mapField(item, value)]));
}

function applyTemplate(template, replacements) {
  return String(template || '').replace(/\{([a-z_]+)\}/g, (match, name) => {
    if (!Object.hasOwn(replacements, name)) {
      const error = new Error(`unsupported search-detail placeholder: ${name}`);
      error.code = 'SOURCE_TEMPLATE_INVALID';
      throw error;
    }
    return encodeURIComponent(String(replacements[name] ?? ''));
  });
}

function normalizeRecords(parsed, recordsPath) {
  const records = getPath(parsed, recordsPath || '');
  if (records == null) return [];
  return Array.isArray(records) ? records : [records];
}

function mapDetailRecord(item, detail, common, trace) {
  const mapped = Object.fromEntries(Object.entries(detail.field_map || {}).map(([field, spec]) => [field, mapField(item, spec)]));
  const fixed = detail.fixed_fields || {};
  const record = {
    ...fixed,
    ...mapped,
    source_id: common.source_id,
    source_family_id: common.source_family_id,
    capability_id: detail.capability_id || 'search_detail_record',
    source_role: String(mapped.source_role || fixed.source_role || common.source_role).toUpperCase(),
    authority_id: detail.authority_id || common.authority_id,
    publisher_id: detail.publisher_id || detail.authority_id || common.authority_id,
    publisher_name: detail.publisher_name || common.publisher_name,
    retrieval_trace: Object.freeze({
      provider_id: common.provider_id,
      endpoint_id: detail.endpoint_id || `${common.provider_id}-detail`,
      current_pointer_verified: true,
      search_used_for_discovery_only: true,
      ...trace
    }),
    rights: Object.freeze({ access: 'public', ...(fixed.rights || {}) })
  };
  if (record.title != null) record.title = String(record.title).slice(0, 2048);
  if (record.excerpt != null) record.excerpt = String(record.excerpt).slice(0, detail.maximum_excerpt_chars || 32768);
  return record;
}

function recordIdentity(record) {
  return String(record.canonical_record_id || record.record_id || record.id || record.canonical_url || record.url || '').trim();
}

function createSearchDetailJsonProvider(options = {}) {
  const providerId = String(options.provider_id || '').trim();
  if (!providerId) throw new TypeError('provider_id is required');
  const allowedHosts = new Set((options.allowed_hosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) throw new TypeError('allowed_hosts must not be empty');
  const search = options.search && typeof options.search === 'object' ? options.search : {};
  const detail = options.detail && typeof options.detail === 'object' ? options.detail : {};
  if (!search.url_template || !detail.url_template) throw new TypeError('search.url_template and detail.url_template are required');
  for (const template of [search.url_template, detail.url_template]) {
    const probe = new URL(String(template).replace(/\{[a-z_]+\}/g, 'probe'));
    if (probe.protocol !== 'https:' || !allowedHosts.has(probe.hostname.toLowerCase())) throw new TypeError('search/detail URL must use an allowed HTTPS host');
  }
  const maximumRecords = Math.max(1, Math.min(20, Number(search.maximum_records || 5)));
  const timeoutMs = Math.max(1000, Math.min(15000, Number(options.timeout_ms || 12000)));
  const maximumAttempts = Math.max(1, Math.min(3, Number(options.maximum_attempts || 1)));
  const transport = options.transport || secureGet;
  const common = Object.freeze({
    provider_id: providerId,
    source_id: String((options.catalog_source_ids || [])[0] || providerId),
    source_family_id: String(options.source_family_id || providerId),
    authority_id: String(options.authority_id || detail.authority_id || providerId),
    publisher_name: String(options.publisher_name || detail.publisher_name || options.authority_id || providerId),
    source_role: String(options.source_role || 'OFFICIAL').toUpperCase()
  });

  async function requestJson(url, context) {
    let lastError = null;
    for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
      try {
        const remaining = Number(context.deadline_at || 0) - Date.now();
        if (Number(context.deadline_at || 0) > 0 && remaining <= 0) {
          const error = new Error('source deadline exhausted before request');
          error.code = 'SOURCE_DEADLINE_EXCEEDED';
          throw error;
        }
        const response = await transport(url, {
          allowedHosts: [...allowedHosts],
          maxBytes: 6 * 1024 * 1024,
          timeoutMs: Math.min(timeoutMs, remaining > 0 ? Math.max(100, remaining) : timeoutMs),
          headers: { Accept: 'application/json', ...(options.request_headers || {}) },
          signal: context.signal
        });
        if (response.status < 200 || response.status >= 300) {
          const error = new Error(`official source returned HTTP ${response.status}`);
          error.code = `SOURCE_HTTP_${response.status}`;
          throw error;
        }
        return { response, parsed: JSON.parse(response.body.toString('utf8')) };
      } catch (error) {
        lastError = error;
        const code = String(error.code || '');
        const retryable = code === 'SOURCE_TIMEOUT' || /^SOURCE_HTTP_(429|500|502|503|504)$/.test(code);
        if (!retryable || attempt >= maximumAttempts) throw error;
      }
    }
    throw lastError;
  }

  return Object.freeze({
    provider_id: providerId,
    source_class: options.source_class || 'FREE_OFFICIAL_LIVE',
    source_family_id: common.source_family_id,
    priority: Number.isInteger(options.priority) ? options.priority : 100,
    domains: Object.freeze([...(options.domains || [])].map((value) => String(value).toUpperCase())),
    capabilities: Object.freeze([...(options.capabilities || [])].map(String)),
    routing_terms: Object.freeze([...(options.routing_terms || [])].map(String)),
    latency_p50_ms: Math.max(1, Number(options.latency_p50_ms || 900)),
    latency_p95_ms: Math.max(1, Number(options.latency_p95_ms || 2500)),
    maximum_cost_minor: 0,
    certified: options.certified !== false,

    async search(plan, context = {}) {
      const candidates = [], failures = [], queryResults = [];
      let requests = 0, responseBytes = 0;
      for (const query of Array.isArray(plan.query_set) ? plan.query_set : []) {
        const queryCandidates = [], queryFailures = [];
        try {
          const searchUrl = applyTemplate(search.url_template, { query: query.text });
          requests += 1;
          const searchResult = await requestJson(searchUrl, context);
          responseBytes += searchResult.response.body.length;
          const searchRecords = normalizeRecords(searchResult.parsed, search.records_path).slice(0, maximumRecords);
          for (const searchItem of searchRecords) {
            const recordValue = search.record_value_path
              ? getPath(searchItem, search.record_value_path)
              : (searchItem && typeof searchItem === 'object' ? (searchItem.id ?? searchItem.key) : searchItem);
            if (recordValue == null || String(recordValue).trim() === '') continue;
            try {
              const detailUrl = applyTemplate(detail.url_template, { query: query.text, record_value: recordValue });
              requests += 1;
              const detailResult = await requestJson(detailUrl, context);
              responseBytes += detailResult.response.body.length;
              const detailPath = String(detail.records_path || '').replace(/\{record_value\}/g, String(recordValue));
              const detailRecords = normalizeRecords(detailResult.parsed, detailPath);
              for (const detailItem of detailRecords) {
                const record = mapDetailRecord(detailItem, detail, common, {
                  query_id: query.query_id,
                  query_role: query.role || query.class || null,
                  search_record_value: String(recordValue),
                  search_url: searchResult.response.url,
                  detail_url: detailResult.response.url
                });
                const identity = recordIdentity(record);
                if (!identity || !String(record.title || '').trim()) continue;
                queryCandidates.push(Object.freeze(record));
              }
            } catch (error) {
              queryFailures.push({ query_id: query.query_id, endpoint_id: detail.endpoint_id || `${providerId}-detail`, code: error.code || 'SOURCE_DETAIL_FAILED', message: error.message });
            }
          }
        } catch (error) {
          queryFailures.push({ query_id: query.query_id, endpoint_id: search.endpoint_id || `${providerId}-search`, code: error.code || 'SOURCE_SEARCH_FAILED', message: error.message });
        }
        failures.push(...queryFailures);
        candidates.push(...queryCandidates);
        const retrievalStatus = queryCandidates.length ? 'FOUND' : (queryFailures.length ? 'RETRIEVAL_FAILED' : 'NOT_FOUND');
        queryResults.push(Object.freeze({
          query_id: String(query.query_id),
          retrieval_status: retrievalStatus,
          candidate_record_ids: Object.freeze([...new Set(queryCandidates.map(recordIdentity).filter(Boolean))].sort()),
          error_code: retrievalStatus === 'RETRIEVAL_FAILED' ? queryFailures[0]?.code || 'SOURCE_REQUEST_FAILED' : null,
          endpoint_count: 2,
          completed_endpoint_count: queryCandidates.length ? 2 : 0
        }));
      }
      const failedQueries = queryResults.filter((item) => item.retrieval_status === 'RETRIEVAL_FAILED').length;
      return Object.freeze({
        coverage_state: failedQueries === 0 ? 'COMPLETE_FOR_QUERY_SCOPE' : failedQueries < queryResults.length ? 'PARTIAL_FOR_QUERY_SCOPE' : 'UNKNOWN',
        candidates: Object.freeze(candidates),
        query_results: Object.freeze(queryResults),
        current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), coverage_state: failedQueries === 0 ? 'COMPLETE' : failedQueries < queryResults.length ? 'PARTIAL' : 'UNKNOWN' }),
        usage: Object.freeze({ requests, results: candidates.length, response_bytes: responseBytes, query_count: queryResults.length }),
        failures: Object.freeze(failures)
      });
    }
  });
}

module.exports = { applyTemplate, createSearchDetailJsonProvider, getPath, mapField, normalizeRecords };
