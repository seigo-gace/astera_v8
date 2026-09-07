'use strict';

const { secureGet } = require('./secure-http-transport');

function compileTemplate(template, queryText) {
  return String(template || '').replace(/\{query\}/g, encodeURIComponent(String(queryText || '')));
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitle(html) {
  const h1 = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(h1[1]).slice(0, 2048);
  const title = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return title ? stripHtml(title[1]).slice(0, 2048) : '';
}

function extractExcerpt(html, maximumChars) {
  const main = String(html || '').match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  const body = String(html || '').match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return stripHtml(main?.[1] || body?.[1] || html).slice(0, maximumChars);
}

function extractDetailUrls(html, baseUrl, hrefRegex, allowedHosts, maximumRecords) {
  const regex = new RegExp(hrefRegex, 'gi');
  const output = [];
  const seen = new Set();
  let match;
  while ((match = regex.exec(String(html || ''))) && output.length < maximumRecords) {
    const href = match[1] || match[0];
    let url;
    try { url = new URL(decodeHtml(href), baseUrl); } catch { continue; }
    if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname.toLowerCase())) continue;
    url.hash = '';
    const canonical = url.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    output.push(canonical);
  }
  return output;
}

function createSearchDetailHtmlProvider(options = {}) {
  const providerId = String(options.provider_id || '').trim();
  if (!providerId) throw new TypeError('provider_id is required');
  const allowedHosts = new Set((options.allowed_hosts || []).map((host) => String(host).toLowerCase()));
  if (!allowedHosts.size) throw new TypeError('allowed_hosts must not be empty');
  const search = options.search && typeof options.search === 'object' ? options.search : {};
  const urlTemplate = String(search.url_template || '').trim();
  const hrefRegex = String(search.href_regex || '').trim();
  if (!urlTemplate || !hrefRegex) throw new TypeError('search.url_template and search.href_regex are required');
  const probe = new URL(urlTemplate.replace(/\{query\}/g, 'probe'));
  if (probe.protocol !== 'https:' || !allowedHosts.has(probe.hostname.toLowerCase())) throw new TypeError('search URL must use an allowed HTTPS host');
  const maximumRecords = Math.max(1, Math.min(20, Number(search.maximum_records || 5)));
  const timeoutMs = Math.max(1000, Math.min(15000, Number(search.timeout_ms || 12000)));
  const maximumExcerptChars = Math.max(512, Math.min(32768, Number(search.maximum_excerpt_chars || 12000)));
  const sourceId = String((options.catalog_source_ids || [])[0] || providerId);
  const sourceFamilyId = String(options.source_family_id || providerId);
  const authorityId = String(options.authority_id || providerId);
  const publisherName = String(options.publisher_name || authorityId);
  const transport = options.transport || secureGet;

  return Object.freeze({
    provider_id: providerId,
    source_class: 'FREE_OFFICIAL_LIVE',
    source_family_id: sourceFamilyId,
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
        const queryCandidates = [];
        try {
          const searchUrl = compileTemplate(urlTemplate, query.text);
          requests += 1;
          const searchResponse = await transport(searchUrl, { allowedHosts: [...allowedHosts], maxBytes: 4 * 1024 * 1024, timeoutMs, signal: context.signal });
          responseBytes += searchResponse.body.length;
          if (searchResponse.status < 200 || searchResponse.status >= 300) {
            const error = new Error(`search source returned HTTP ${searchResponse.status}`);
            error.code = `SOURCE_HTTP_${searchResponse.status}`;
            throw error;
          }
          const detailUrls = extractDetailUrls(searchResponse.body.toString('utf8'), searchResponse.url, hrefRegex, allowedHosts, maximumRecords);
          for (const detailUrl of detailUrls) {
            try {
              requests += 1;
              const detailResponse = await transport(detailUrl, { allowedHosts: [...allowedHosts], maxBytes: 6 * 1024 * 1024, timeoutMs, signal: context.signal });
              responseBytes += detailResponse.body.length;
              if (detailResponse.status < 200 || detailResponse.status >= 300) continue;
              const html = detailResponse.body.toString('utf8');
              const title = extractTitle(html);
              const excerpt = extractExcerpt(html, maximumExcerptChars);
              if (!title || !excerpt) continue;
              queryCandidates.push(Object.freeze({
                canonical_record_id: detailResponse.url,
                canonical_url: detailResponse.url,
                title,
                excerpt,
                source_id: sourceId,
                source_family_id: sourceFamilyId,
                capability_id: 'search_detail_record',
                source_role: 'OFFICIAL',
                authority_id: authorityId,
                publisher_id: authorityId,
                publisher_name: publisherName,
                language: 'und',
                retrieval_trace: Object.freeze({ provider_id: providerId, endpoint_id: `${providerId}-detail`, query_id: query.query_id, query_role: query.role || query.class || null, current_pointer_verified: true, search_page_used_for_discovery_only: true }),
                rights: Object.freeze({ access: 'public', reuse: 'source_specific' })
              }));
            } catch (error) {
              failures.push({ query_id: query.query_id, endpoint_id: `${providerId}-detail`, code: error.code || 'SOURCE_DETAIL_FAILED', message: error.message });
            }
          }
        } catch (error) {
          failures.push({ query_id: query.query_id, endpoint_id: `${providerId}-search`, code: error.code || 'SOURCE_SEARCH_FAILED', message: error.message });
        }
        candidates.push(...queryCandidates);
        queryResults.push(Object.freeze({ query_id: String(query.query_id), retrieval_status: queryCandidates.length ? 'FOUND' : (failures.some((item) => item.query_id === query.query_id) ? 'RETRIEVAL_FAILED' : 'NOT_FOUND'), candidate_record_ids: Object.freeze(queryCandidates.map((item) => item.canonical_record_id)), error_code: queryCandidates.length ? null : (failures.find((item) => item.query_id === query.query_id)?.code || null), endpoint_count: 1, completed_endpoint_count: queryCandidates.length ? 1 : 0 }));
      }
      const complete = queryResults.filter((item) => item.retrieval_status !== 'RETRIEVAL_FAILED').length;
      return Object.freeze({ coverage_state: complete === queryResults.length ? 'COMPLETE_FOR_QUERY_SCOPE' : complete ? 'PARTIAL_FOR_QUERY_SCOPE' : 'UNKNOWN', candidates: Object.freeze(candidates), query_results: Object.freeze(queryResults), current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), coverage_state: complete === queryResults.length ? 'COMPLETE' : complete ? 'PARTIAL' : 'UNKNOWN' }), usage: Object.freeze({ requests, results: candidates.length, response_bytes: responseBytes, query_count: queryResults.length }), failures: Object.freeze(failures) });
    }
  });
}

module.exports = { compileTemplate, createSearchDetailHtmlProvider, extractDetailUrls, extractExcerpt, extractTitle, stripHtml };
