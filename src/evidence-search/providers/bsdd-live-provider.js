'use strict';

const { secureGet } = require('./secure-http-transport');

function recordIdentity(record) {
  return String(record.canonical_record_id || record.canonical_url || record.uri || '').trim();
}

function normalizeDictionary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const uri = String(raw.uri || '').trim();
  if (!uri) return null;
  return Object.freeze({
    uri,
    code: String(raw.code || ''),
    name: String(raw.name || ''),
    organization: String(raw.organizationNameOwner || ''),
    is_latest: raw.isLatestVersion === true,
    is_verified: raw.isVerified === true,
    is_private: raw.isPrivate === true,
    status: String(raw.status || ''),
    version: String(raw.version || '')
  });
}

function dictionaryScore(dictionary, preferredCodes) {
  let score = 0;
  const haystack = `${dictionary.code} ${dictionary.name} ${dictionary.organization}`.toLowerCase();
  if (dictionary.is_verified) score += 100;
  if (/buildingsmart/.test(haystack)) score += 40;
  for (let index = 0; index < preferredCodes.length; index += 1) {
    if (haystack.includes(preferredCodes[index].toLowerCase())) score += 1000 - index;
  }
  return score;
}

function selectDictionaries(rawDictionaries, options) {
  const preferredCodes = (options.preferred_dictionary_codes || ['IFC']).map(String).filter(Boolean);
  const maxScan = Math.max(1, Math.min(500, Number(options.max_dictionary_scan || 80)));
  return rawDictionaries
    .map(normalizeDictionary)
    .filter(Boolean)
    .filter((dictionary) => !dictionary.is_private)
    .filter((dictionary) => dictionary.is_latest)
    .filter((dictionary) => !/^(inactive|deprecated|withdrawn)$/i.test(dictionary.status))
    .sort((left, right) => {
      const scoreDifference = dictionaryScore(right, preferredCodes) - dictionaryScore(left, preferredCodes);
      if (scoreDifference) return scoreDifference;
      return left.uri.localeCompare(right.uri);
    })
    .slice(0, maxScan);
}

function buildClassSearchUrl(baseUrl, query, dictionaries, limit) {
  const url = new URL(baseUrl);
  url.searchParams.set('SearchText', String(query));
  url.searchParams.set('Offset', '0');
  url.searchParams.set('Limit', String(limit));
  for (const dictionary of dictionaries) url.searchParams.append('DictionaryUris', dictionary.uri);
  return url.toString();
}

function mapClass(raw, providerId) {
  const uri = String(raw?.uri || '').trim();
  if (!uri) return null;
  return Object.freeze({
    source_id: 'bsdd-class-search',
    source_family_id: 'buildingsmart-bsdd',
    capability_id: 'built_environment_dictionary_search',
    source_role: 'OFFICIAL',
    authority_id: 'buildingsmart-international',
    publisher_id: 'buildingsmart-international',
    publisher_name: 'buildingSMART International',
    canonical_record_id: uri,
    canonical_url: uri,
    title: String(raw.name || raw.referenceCode || uri).slice(0, 2048),
    excerpt: String(raw.description || '').slice(0, 32768),
    language: 'und',
    rights: { access: 'public', reuse: 'source_specific' },
    fields: {
      dictionary_uri: raw.dictionaryUri || null,
      dictionary_name: raw.dictionaryName || null,
      reference_code: raw.referenceCode || null,
      class_type: raw.classType || null,
      parent_class_name: raw.parentClassName || null,
      related_ifc_entities: Array.isArray(raw.relatedIfcEntityNames) ? raw.relatedIfcEntityNames : []
    },
    retrieval_trace: {
      provider_id: providerId,
      endpoint_id: 'bsdd-class-search',
      current_pointer_verified: true
    }
  });
}

function createBsddLiveProvider(options = {}) {
  const providerId = String(options.provider_id || 'bsdd-search');
  const allowedHosts = new Set((options.allowed_hosts || ['api.bsdd.buildingsmart.org']).map((host) => String(host).toLowerCase()));
  const dictionaryUrl = String(options.dictionary_url || 'https://api.bsdd.buildingsmart.org/api/Dictionary/v1?Offset=0&Limit=500');
  const classSearchUrl = String(options.class_search_url || 'https://api.bsdd.buildingsmart.org/api/Class/Search/v1');
  const batchSize = Math.max(1, Math.min(25, Number(options.dictionary_batch_size || 10)));
  const resultLimit = Math.max(1, Math.min(100, Number(options.result_limit || 20)));
  const timeoutMs = Math.max(500, Math.min(15000, Number(options.timeout_ms || 12000)));
  const maxBytes = Math.max(1024, Math.min(16 * 1024 * 1024, Number(options.max_response_bytes || 4 * 1024 * 1024)));
  const transport = options.transport || secureGet;
  let cache = null;

  async function getDictionaries(context) {
    const now = Date.now();
    if (cache && cache.expires_at > now) return cache.dictionaries;
    const response = await transport(dictionaryUrl, {
      allowedHosts: [...allowedHosts],
      maxBytes,
      timeoutMs,
      signal: context.signal,
      headers: { Accept: 'application/json' }
    });
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(`bSDD dictionary list returned HTTP ${response.status}`);
      error.code = `SOURCE_HTTP_${response.status}`;
      throw error;
    }
    const parsed = JSON.parse(response.body.toString('utf8'));
    const selected = selectDictionaries(Array.isArray(parsed.dictionaries) ? parsed.dictionaries : [], options);
    if (!selected.length) {
      const error = new Error('bSDD returned no eligible public latest dictionaries');
      error.code = 'BSDD_DICTIONARY_SET_EMPTY';
      throw error;
    }
    cache = { dictionaries: Object.freeze(selected), expires_at: now + Math.max(60000, Number(options.dictionary_cache_ttl_ms || 300000)) };
    return cache.dictionaries;
  }

  return Object.freeze({
    provider_id: providerId,
    source_class: 'FREE_OFFICIAL_LIVE',
    source_family_id: 'buildingsmart-bsdd',
    priority: Number.isInteger(options.priority) ? options.priority : 10,
    domains: Object.freeze([...(options.domains || ['G25', 'G26', 'G28', 'G32'])].map((value) => String(value).toUpperCase())),
    capabilities: Object.freeze([...(options.capabilities || [])].map(String)),
    latency_p50_ms: 1000,
    latency_p95_ms: 5000,
    maximum_cost_minor: 0,
    certified: options.certified !== false,

    async search(plan, context = {}) {
      const queries = Array.isArray(plan.query_set) ? plan.query_set : [];
      const candidates = [];
      const failures = [];
      const queryResults = [];
      let requests = 0;
      let responseBytes = 0;
      let dictionaries;
      try {
        dictionaries = await getDictionaries(context);
        requests += 1;
      } catch (error) {
        const failure = { endpoint_id: 'bsdd-dictionary-list', code: error.code || 'SOURCE_REQUEST_FAILED', message: error.message };
        failures.push(failure);
        for (const query of queries) {
          queryResults.push(Object.freeze({ query_id: String(query.query_id), retrieval_status: 'RETRIEVAL_FAILED', candidate_record_ids: Object.freeze([]), error_code: failure.code }));
        }
        return Object.freeze({ coverage_state: 'UNKNOWN', candidates: Object.freeze([]), query_results: Object.freeze(queryResults), failures: Object.freeze(failures), usage: Object.freeze({ requests, results: 0, response_bytes: responseBytes, query_count: queries.length }) });
      }

      for (const query of queries) {
        const queryCandidates = [];
        const queryFailures = [];
        let scanned = 0;
        for (let offset = 0; offset < dictionaries.length; offset += batchSize) {
          const batch = dictionaries.slice(offset, offset + batchSize);
          const remaining = Math.max(1, resultLimit - queryCandidates.length);
          const url = buildClassSearchUrl(classSearchUrl, query.text, batch, remaining);
          try {
            const response = await transport(url, {
              allowedHosts: [...allowedHosts], maxBytes, timeoutMs,
              signal: context.signal, headers: { Accept: 'application/json' }
            });
            requests += 1;
            responseBytes += response.body.length;
            if (response.status < 200 || response.status >= 300) {
              const error = new Error(`bSDD class search returned HTTP ${response.status}`);
              error.code = `SOURCE_HTTP_${response.status}`;
              throw error;
            }
            scanned += batch.length;
            const parsed = JSON.parse(response.body.toString('utf8'));
            for (const raw of Array.isArray(parsed.classes) ? parsed.classes : []) {
              const mapped = mapClass(raw, providerId);
              if (mapped) queryCandidates.push(mapped);
            }
          } catch (error) {
            const failure = { query_id: query.query_id, endpoint_id: 'bsdd-class-search', code: error.code || 'SOURCE_REQUEST_FAILED', message: error.message, dictionary_count: batch.length };
            queryFailures.push(failure);
            failures.push(failure);
          }
          if (queryCandidates.length >= resultLimit) break;
        }
        const unique = [...new Map(queryCandidates.map((record) => [recordIdentity(record), record])).values()].slice(0, resultLimit);
        candidates.push(...unique);
        const status = unique.length ? 'FOUND' : scanned > 0 ? 'NOT_FOUND' : 'RETRIEVAL_FAILED';
        queryResults.push(Object.freeze({
          query_id: String(query.query_id),
          retrieval_status: status,
          candidate_record_ids: Object.freeze(unique.map(recordIdentity)),
          error_code: status === 'RETRIEVAL_FAILED' ? (queryFailures[0]?.code || 'BSDD_ALL_BATCHES_FAILED') : null,
          dictionary_count_available: dictionaries.length,
          dictionary_count_scanned: scanned,
          scan_complete: scanned >= dictionaries.length
        }));
      }

      const completeQueries = queryResults.filter((item) => item.retrieval_status !== 'RETRIEVAL_FAILED').length;
      return Object.freeze({
        coverage_state: completeQueries === queryResults.length ? 'COMPLETE_FOR_QUERY_SCOPE' : completeQueries ? 'PARTIAL_FOR_QUERY_SCOPE' : 'UNKNOWN',
        candidates: Object.freeze(candidates),
        query_results: Object.freeze(queryResults),
        failures: Object.freeze(failures),
        current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), dictionary_count: dictionaries.length }),
        usage: Object.freeze({ requests, results: candidates.length, response_bytes: responseBytes, query_count: queries.length })
      });
    }
  });
}

module.exports = {
  buildClassSearchUrl,
  createBsddLiveProvider,
  normalizeDictionary,
  selectDictionaries
};
