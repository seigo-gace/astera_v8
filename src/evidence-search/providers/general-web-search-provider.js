'use strict';

const crypto = require('node:crypto');
const https = require('node:https');
const { secureGet, resolvePublicAddress, createPinnedLookup } = require('./secure-http-transport');

const SEARCH_ROUTES = Object.freeze([
  Object.freeze({
    engine: 'DUCKDUCKGO_HTML',
    host: 'html.duckduckgo.com',
    buildUrl: (query) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  }),
  Object.freeze({
    engine: 'DUCKDUCKGO_LITE',
    host: 'lite.duckduckgo.com',
    buildUrl: (query) => `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`
  })
]);

const SEARCH_HOSTS = new Set(['duckduckgo.com', 'www.duckduckgo.com', 'html.duckduckgo.com', 'lite.duckduckgo.com']);
const MAX_SEARCH_BYTES = 900 * 1024;
const MAX_PAGE_BYTES = 900 * 1024;
const MAX_PAGE_REDIRECTS = 2;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function decodeHtml(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ndash: '–', mdash: '—', hellip: '…'
  };
  return String(value || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (key.startsWith('#x')) {
      const code = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (key.startsWith('#')) {
      const code = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return Object.hasOwn(named, key) ? named[key] : match;
  });
}

function stripHtml(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function attributeValue(attributes, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = String(attributes || '').match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  if (quoted) return decodeHtml(quoted[2]);
  const bare = String(attributes || '').match(new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, 'i'));
  return bare ? decodeHtml(bare[1]) : '';
}

function normalizeResultUrl(rawHref) {
  let href = decodeHtml(rawHref).trim();
  if (!href) return null;
  if (href.startsWith('//')) href = `https:${href}`;
  if (href.startsWith('/')) href = `https://duckduckgo.com${href}`;
  let parsed;
  try { parsed = new URL(href); } catch { return null; }
  const host = parsed.hostname.toLowerCase();
  if (SEARCH_HOSTS.has(host)) {
    const uddg = parsed.searchParams.get('uddg');
    if (!uddg) return null;
    try { parsed = new URL(uddg); } catch { return null; }
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  if (SEARCH_HOSTS.has(parsed.hostname.toLowerCase())) return null;
  parsed.hash = '';
  return parsed.toString();
}

function parseDuckDuckGoResults(html, engine) {
  const results = [];
  const seen = new Set();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || ''))) !== null) {
    const attrs = match[1] || '';
    const className = attributeValue(attrs, 'class').toLowerCase();
    if (!className.includes('result__a') && !className.includes('result-link')) continue;
    const url = normalizeResultUrl(attributeValue(attrs, 'href'));
    if (!url || seen.has(url)) continue;
    const title = stripHtml(match[2]).slice(0, 600);
    if (!title) continue;
    seen.add(url);
    results.push(Object.freeze({ engine, url, title, rank: results.length + 1 }));
    if (results.length >= 12) break;
  }
  return Object.freeze(results);
}

function validateGeneralPageUrl(rawUrl) {
  const url = new URL(String(rawUrl || ''));
  if (url.protocol !== 'https:') {
    const error = new Error('general web evidence page must use HTTPS');
    error.code = 'GENERAL_WEB_PROTOCOL_FORBIDDEN';
    throw error;
  }
  if (url.username || url.password) {
    const error = new Error('general web URL credentials are forbidden');
    error.code = 'GENERAL_WEB_URL_CREDENTIALS_FORBIDDEN';
    throw error;
  }
  if (SEARCH_HOSTS.has(url.hostname.toLowerCase())) {
    const error = new Error('search-engine result pages cannot be used as evidence');
    error.code = 'GENERAL_WEB_SEARCH_ENGINE_RESULT_FORBIDDEN';
    throw error;
  }
  return url;
}

function requestPublicPageOnce(url, address, options) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: 'https:',
      hostname: url.hostname,
      port: url.port || 443,
      method: 'GET',
      path: `${url.pathname}${url.search}`,
      servername: url.hostname,
      lookup: createPinnedLookup(address),
      headers: options.headers
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > options.maxBytes) {
          const error = new Error('general web page exceeds maximum bytes');
          error.code = 'GENERAL_WEB_RESPONSE_TOO_LARGE';
          response.destroy(error);
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: Number(response.statusCode || 0),
        headers: response.headers,
        body: Buffer.concat(chunks, size)
      }));
      response.on('error', reject);
    });
    request.setTimeout(options.timeoutMs, () => {
      const error = new Error(`general web page timed out after ${options.timeoutMs}ms`);
      error.code = 'GENERAL_WEB_TIMEOUT';
      request.destroy(error);
    });
    if (options.signal) {
      const abort = () => {
        const error = new Error('general web page request cancelled');
        error.code = 'SEARCH_CANCELLED';
        request.destroy(error);
      };
      if (options.signal.aborted) abort();
      else options.signal.addEventListener('abort', abort, { once: true });
      request.once('close', () => options.signal.removeEventListener('abort', abort));
    }
    request.on('error', reject);
    request.end();
  });
}

async function publicPageGet(rawUrl, options = {}) {
  const maximumRedirects = Math.max(0, Number(options.maximumRedirects ?? MAX_PAGE_REDIRECTS));
  const maxBytes = Math.max(1, Number(options.maxBytes || MAX_PAGE_BYTES));
  const timeoutMs = Math.max(100, Number(options.timeoutMs || 1100));
  const headers = {
    Accept: 'text/html, application/xhtml+xml, text/plain;q=0.8',
    'Accept-Encoding': 'identity',
    'User-Agent': 'ASTERA-GeneralWebSearch/1.0',
    ...(options.headers || {})
  };
  let current = String(rawUrl);
  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    const url = validateGeneralPageUrl(current);
    const address = await resolvePublicAddress(url.hostname, options.lookup);
    const response = await (options.request || requestPublicPageOnce)(url, address, {
      headers, maxBytes, timeoutMs, signal: options.signal
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.location;
      if (!location || redirects >= maximumRedirects) {
        const error = new Error('general web redirect is invalid or exceeds limit');
        error.code = 'GENERAL_WEB_REDIRECT_INVALID';
        throw error;
      }
      current = new URL(location, url).toString();
      continue;
    }
    return Object.freeze({
      url: url.toString(),
      status: response.status,
      headers: Object.freeze({ ...response.headers }),
      body: response.body
    });
  }
  throw new Error('unreachable general web redirect state');
}

function extractPageRecord(response) {
  if (!response || response.status < 200 || response.status >= 300) return null;
  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml') && !contentType.includes('text/plain')) return null;
  const raw = Buffer.isBuffer(response.body) ? response.body.toString('utf8') : String(response.body || '');
  const titleMatch = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = stripHtml(titleMatch?.[1] || '').slice(0, 600);
  const text = stripHtml(raw).slice(0, 12_000);
  if (text.length < 80) return null;
  return Object.freeze({ title: title || response.url, text, content_type: contentType });
}

async function discover(query, context, searchGet) {
  let lastError = null;
  for (const route of SEARCH_ROUTES) {
    try {
      const response = await searchGet(route.buildUrl(query), {
        allowedHosts: [...SEARCH_HOSTS],
        timeoutMs: 1200,
        maxBytes: MAX_SEARCH_BYTES,
        maximumRedirects: 1,
        signal: context.signal,
        headers: {
          Accept: 'text/html, application/xhtml+xml;q=0.9, text/plain;q=0.7',
          'Accept-Encoding': 'identity',
          'User-Agent': 'ASTERA-GeneralWebSearch/1.0'
        }
      });
      if (response.status < 200 || response.status >= 300) {
        lastError = Object.assign(new Error(`general search route returned HTTP ${response.status}`), { code: 'GENERAL_WEB_SEARCH_HTTP_ERROR' });
        continue;
      }
      const results = parseDuckDuckGoResults(response.body.toString('utf8'), route.engine);
      if (results.length) return results;
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  return Object.freeze([]);
}

function createGeneralWebSearchProvider(options = {}) {
  const searchGet = options.searchGet || secureGet;
  const pageGet = options.pageGet || publicPageGet;
  const resultLimit = Math.max(1, Math.min(8, Number(options.resultLimit || 4)));
  return Object.freeze({
    provider_id: 'free-general-web-search',
    source_class: 'FREE_GENERAL_WEB',
    source_family_id: 'GENERAL_WEB',
    priority: 900,
    domains: Object.freeze([]),
    capabilities: Object.freeze(['GENERAL_WEB_DISCOVERY']),
    routing_terms: Object.freeze([]),
    latency_p50_ms: 800,
    latency_p95_ms: 1500,
    maximum_cost_minor: 0,
    certified: true,
    async search(plan, context = {}) {
      const querySet = Array.isArray(plan?.query_set) ? plan.query_set : [];
      const candidates = [];
      const queryResults = [];
      for (const query of querySet.slice(0, 4)) {
        const text = String(query?.text || '').trim();
        if (!text) {
          queryResults.push({ query_id: String(query?.query_id || ''), retrieval_status: 'RETRIEVAL_FAILED', candidate_record_ids: [], error_code: 'GENERAL_WEB_QUERY_EMPTY' });
          continue;
        }
        try {
          const discovered = await discover(text, context, searchGet);
          if (!discovered.length) {
            queryResults.push({ query_id: String(query.query_id), retrieval_status: 'NOT_FOUND', candidate_record_ids: [] });
            continue;
          }
          const selected = discovered.slice(0, resultLimit);
          const fetched = await Promise.allSettled(selected.map(async (item) => {
            const response = await pageGet(item.url, {
              timeoutMs: 1100,
              maxBytes: MAX_PAGE_BYTES,
              maximumRedirects: MAX_PAGE_REDIRECTS,
              signal: context.signal
            });
            const record = extractPageRecord(response);
            if (!record) return null;
            const host = new URL(response.url).hostname.toLowerCase();
            return Object.freeze({
              id: `general-web:${sha256(response.url).slice(0, 24)}`,
              canonical_record_id: response.url,
              canonical_url: response.url,
              title: record.title,
              excerpt: record.text,
              source_family_id: host,
              source_id: `GENERAL_WEB:${host}`,
              capability_id: 'general-web-page-retrieval',
              source_role: 'SECONDARY',
              authority_id: host,
              publisher_id: host,
              publisher_name: host,
              locator_replayable: true,
              retrieval_trace: Object.freeze({
                discovered_via: item.engine,
                search_rank: item.rank,
                fetched_actual_page: true,
                search_result_used_as_evidence: false
              }),
              fields: Object.freeze({
                domain_id: plan.domain_lens?.id || null,
                general_web_discovery: true,
                search_engine: item.engine,
                search_rank: item.rank,
                content_type: record.content_type
              })
            });
          }));
          const records = fetched.filter((entry) => entry.status === 'fulfilled' && entry.value).map((entry) => entry.value);
          candidates.push(...records);
          queryResults.push({
            query_id: String(query.query_id),
            retrieval_status: records.length ? 'FOUND' : 'RETRIEVAL_FAILED',
            candidate_record_ids: records.map((record) => record.canonical_record_id),
            error_code: records.length ? null : 'GENERAL_WEB_PAGE_FETCH_FAILED'
          });
        } catch (error) {
          queryResults.push({
            query_id: String(query.query_id),
            retrieval_status: 'RETRIEVAL_FAILED',
            candidate_record_ids: [],
            error_code: String(error?.code || 'GENERAL_WEB_SEARCH_FAILED')
          });
        }
      }
      for (const query of querySet.slice(4)) {
        queryResults.push({ query_id: String(query?.query_id || ''), retrieval_status: 'RETRIEVAL_FAILED', candidate_record_ids: [], error_code: 'GENERAL_WEB_QUERY_LIMIT' });
      }
      return Object.freeze({
        coverage_state: 'PARTIAL_FOR_QUERY_SCOPE',
        current_watermark: new Date().toISOString(),
        candidates: Object.freeze(candidates),
        query_results: Object.freeze(queryResults),
        usage: Object.freeze({ cost_minor: 0, paid: false, search_route: 'DUCKDUCKGO_NON_JS' })
      });
    }
  });
}

module.exports = {
  SEARCH_ROUTES,
  createGeneralWebSearchProvider,
  decodeHtml,
  extractPageRecord,
  normalizeResultUrl,
  parseDuckDuckGoResults,
  publicPageGet,
  stripHtml,
  validateGeneralPageUrl
};
