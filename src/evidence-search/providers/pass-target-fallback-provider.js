'use strict';

const { secureGet } = require('./secure-http-transport');

const SEARCH_NAMES = new Set(['q','query','search','term','keyword','keywords','text','s','searchtext','searchterm']);
const NOISE_TOKENS = new Set(['the','and','for','with','from','into','api','search','official','documentation','database','portal','data','public','reference','tool']);
const TARGET_SEED_OVERRIDES = Object.freeze({
  'Python Official Documentation Search': 'https://docs.python.org/3/genindex-all.html',
  'Linux Kernel Documentation Search': 'https://docs.kernel.org/genindex.html',
  'ECMAScript Language Specification (ECMA-262 / TC39)': 'https://tc39.es/ecma262/multipage/'
});
const MYSQL_ORACLE_ROOT = 'https://docs.oracle.com/cd/E17952_01/mysql-8.0-en/';
const MYSQL_FUNCTION_INDEX = `${MYSQL_ORACLE_ROOT}built-in-function-reference.html`;

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
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function queryTokens(value) {
  return [...new Set(String(value || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}._+#-]{2,}/gu) || [])]
    .filter((token) => !NOISE_TOKENS.has(token));
}

function contentScore(text, query) {
  const haystack = String(text || '').normalize('NFKC').toLowerCase();
  const tokens = queryTokens(query);
  if (!tokens.length) return 0;
  const matched = tokens.filter((token) => haystack.includes(token));
  const identifier = tokens.find((token) => /\d/.test(token) && token.length >= 4);
  if (identifier && haystack.includes(identifier)) return 1000 + matched.length * 10;
  return matched.length * 100 - Math.max(0, tokens.length - matched.length) * 25;
}

function excerptAround(text, query, limit = 12000) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  const lower = normalized.toLowerCase();
  const tokens = queryTokens(query);
  let index = -1;
  for (const token of tokens) {
    index = lower.indexOf(token.toLowerCase());
    if (index >= 0) break;
  }
  if (index < 0) return normalized.slice(0, limit);
  const start = Math.max(0, index - Math.floor(limit / 3));
  return normalized.slice(start, start + limit);
}

function extractTitle(html, fallback) {
  const h1 = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(h1[1]).slice(0, 2048);
  const title = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return (title ? stripHtml(title[1]) : String(fallback || '')).slice(0, 2048);
}

function hostVariants(url) {
  const host = url.hostname.toLowerCase();
  const output = new Set([host]);
  if (host.startsWith('www.')) output.add(host.slice(4));
  else output.add(`www.${host}`);
  return [...output];
}

function parseAttributes(fragment) {
  const attrs = {};
  const regex = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = regex.exec(String(fragment || '')))) attrs[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? match[4] ?? '');
  return attrs;
}

function discoverSearchUrls(html, baseUrl, query, allowedHosts) {
  const output = [];
  const seen = new Set();
  const add = (url) => {
    try {
      const parsed = new URL(url, baseUrl);
      if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname.toLowerCase())) return;
      parsed.hash = '';
      const value = parsed.toString();
      if (!seen.has(value)) { seen.add(value); output.push(value); }
    } catch {}
  };

  const forms = String(html || '').match(/<form\b[^>]*>[\s\S]*?<\/form>/gi) || [];
  for (const form of forms) {
    const openTag = form.match(/^<form\b([^>]*)>/i);
    const attrs = parseAttributes(openTag?.[1] || '');
    if (String(attrs.method || 'get').toLowerCase() !== 'get') continue;
    let action;
    try { action = new URL(attrs.action || baseUrl, baseUrl); } catch { continue; }
    if (action.protocol !== 'https:' || !allowedHosts.has(action.hostname.toLowerCase())) continue;
    const inputs = form.match(/<input\b[^>]*>/gi) || [];
    let searchName = null;
    for (const input of inputs) {
      const inputAttrs = parseAttributes(input);
      const name = String(inputAttrs.name || '').trim();
      if (!name) continue;
      const type = String(inputAttrs.type || 'text').toLowerCase();
      if (SEARCH_NAMES.has(name.toLowerCase()) || (['search','text'].includes(type) && !searchName)) searchName = name;
      else if (type === 'hidden' && inputAttrs.value !== undefined) action.searchParams.set(name, inputAttrs.value);
    }
    if (!searchName) continue;
    action.searchParams.set(searchName, query);
    add(action.toString());
  }

  const base = new URL(baseUrl);
  if (/search|find|lookup|results|query/.test(base.pathname.toLowerCase())) {
    for (const key of ['q','query','search','keyword','term']) {
      const candidate = new URL(base);
      candidate.searchParams.set(key, query);
      add(candidate.toString());
    }
  }
  for (const suffix of [`/search?q=${encodeURIComponent(query)}`, `/search?query=${encodeURIComponent(query)}`, `/search/?q=${encodeURIComponent(query)}`]) add(new URL(suffix, `${base.origin}/`).toString());
  return output.slice(0, 8);
}

function extractLinks(html, baseUrl, query, allowedHosts) {
  const tokens = queryTokens(query);
  const seen = new Set();
  const output = [];
  const regex = /<a\b([^>]*)href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(String(html || '')))) {
    const href = decodeHtml(match[2] || match[3] || match[4] || '');
    let parsed;
    try { parsed = new URL(href, baseUrl); } catch { continue; }
    if (parsed.protocol !== 'https:' || !allowedHosts.has(parsed.hostname.toLowerCase())) continue;
    const fragment = parsed.hash;
    parsed.hash = '';
    const cleanUrl = parsed.toString();
    const identityUrl = fragment ? `${cleanUrl}${fragment}` : cleanUrl;
    if (seen.has(identityUrl) || cleanUrl === baseUrl) continue;
    seen.add(identityUrl);
    const anchor = stripHtml(match[6] || '');
    const text = `${anchor} ${parsed.pathname} ${parsed.search} ${fragment}`.toLowerCase();
    const matches = tokens.filter((token) => text.includes(token)).length;
    const identifier = tokens.some((token) => /\d/.test(token) && token.length >= 4 && text.includes(token));
    let score = matches * 100 + (identifier ? 1000 : 0);
    if (/detail|record|item|document|standard|spec|result|entry|profile|vulnerability|cve|dataset|project|article|publication|law|regulation|notice|match|event|taxon|strain|reaction|index|reference|functions|lifecycle/i.test(identityUrl)) score += 30;
    if (score > 0) output.push({ url: cleanUrl, canonical_url: identityUrl, anchor, score });
  }
  return output.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, 12);
}

function jsonText(value) {
  try { return JSON.stringify(value); } catch { return String(value || ''); }
}

function createCandidate({ target, url, canonicalUrl, title, bodyText, query, providerId }) {
  const excerpt = excerptAround(bodyText, query);
  if (!excerpt || contentScore(excerpt, query) <= 0) return null;
  let actualHost = target.host;
  try { actualHost = new URL(canonicalUrl || url).hostname.toLowerCase(); } catch {}
  return Object.freeze({
    canonical_record_id: canonicalUrl || url,
    canonical_url: canonicalUrl || url,
    title: String(title || target.kb || url).slice(0, 2048),
    excerpt,
    source_id: target.target_id,
    source_family_id: `kb-target:${actualHost}`,
    capability_id: 'public_specialist_kb_direct_record',
    source_role: 'OFFICIAL',
    authority_id: actualHost,
    publisher_id: actualHost,
    publisher_name: target.kb,
    language: 'und',
    retrieval_trace: Object.freeze({ provider_id: providerId, endpoint_id: target.target_id, current_pointer_verified: true, search_page_used_for_discovery_only: (canonicalUrl || url) !== target.official_url }),
    rights: Object.freeze({ access: 'public', reuse: 'source_specific' })
  });
}

async function fetchPage(url, allowedHosts, context, transport) {
  const response = await transport(url, {
    allowedHosts: [...allowedHosts],
    maxBytes: 16 * 1024 * 1024,
    timeoutMs: Math.max(1000, Math.min(12000, Number(context.remaining_ms?.() || 12000))),
    signal: context.signal,
    headers: { Accept: 'text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5' }
  });
  if (response.status < 200 || response.status >= 300) {
    const error = new Error(`official KB returned HTTP ${response.status}`);
    error.code = `SOURCE_HTTP_${response.status}`;
    throw error;
  }
  return response;
}

function resolveSeedUrl(target, query) {
  if (target.kb === 'MySQL Reference Manual Search') {
    const compact = String(query || '').trim();
    if (/^[A-Za-z][A-Za-z0-9_]*(?:\(\))?$/.test(compact)) return MYSQL_FUNCTION_INDEX;
    return `${MYSQL_ORACLE_ROOT}index.html`;
  }
  return TARGET_SEED_OVERRIDES[target.kb] || target.official_url;
}

async function searchOneTarget(target, query, context, transport = secureGet) {
  const seed = new URL(resolveSeedUrl(target, query));
  const allowedHosts = new Set(hostVariants(seed));
  const visited = new Set();
  const fetched = [];
  const fetchUnique = async (url) => {
    if (visited.has(url) || fetched.length >= 10) return null;
    visited.add(url);
    const response = await fetchPage(url, allowedHosts, context, transport);
    fetched.push(response);
    return response;
  };

  const seedResponse = await fetchUnique(seed.toString());
  if (!seedResponse) return { candidates: [], requests: fetched.length };
  const contentType = String(seedResponse.headers['content-type'] || '').toLowerCase();
  if (contentType.includes('json')) {
    const text = seedResponse.body.toString('utf8');
    const candidate = createCandidate({ target, url: seedResponse.url, title: target.kb, bodyText: text, query, providerId: 'public-pass-kb-fallback' });
    return { candidates: candidate ? [candidate] : [], requests: fetched.length };
  }

  const seedHtml = seedResponse.body.toString('utf8');
  const seedScore = contentScore(stripHtml(seedHtml), query);
  const searchUrls = discoverSearchUrls(seedHtml, seedResponse.url, query, allowedHosts);
  let bestSearch = null;
  for (const searchUrl of searchUrls) {
    try {
      const response = await fetchUnique(searchUrl);
      if (!response) continue;
      const html = response.body.toString('utf8');
      const score = contentScore(stripHtml(html), query);
      if (!bestSearch || score > bestSearch.score) bestSearch = { response, html, score };
      if (score >= 1000) break;
    } catch {}
  }

  const useSeed = seedScore > 0 && (!bestSearch || seedScore >= bestSearch.score);
  const discoveryHtml = useSeed ? seedHtml : (bestSearch?.html || seedHtml);
  const discoveryUrl = useSeed ? seedResponse.url : (bestSearch?.response?.url || seedResponse.url);
  const links = extractLinks(discoveryHtml, discoveryUrl, query, allowedHosts);
  const candidates = [];
  for (const link of links.slice(0, 5)) {
    try {
      const response = await fetchUnique(link.url);
      if (!response) continue;
      const type = String(response.headers['content-type'] || '').toLowerCase();
      const raw = response.body.toString('utf8');
      const bodyText = type.includes('json') ? jsonText(JSON.parse(raw)) : stripHtml(raw);
      const candidate = createCandidate({ target, url: response.url, canonicalUrl: link.canonical_url, title: type.includes('html') ? extractTitle(raw, link.anchor || target.kb) : (link.anchor || target.kb), bodyText, query, providerId: 'public-pass-kb-fallback' });
      if (candidate) candidates.push(candidate);
      if (candidates.length >= 3) break;
    } catch {}
  }

  if (!candidates.length && contentScore(stripHtml(discoveryHtml), query) > 0) {
    const candidate = createCandidate({ target, url: discoveryUrl, title: extractTitle(discoveryHtml, target.kb), bodyText: stripHtml(discoveryHtml), query, providerId: 'public-pass-kb-fallback' });
    if (candidate) candidates.push(candidate);
  }
  return { candidates, requests: fetched.length };
}

function selectionPlan(plan) {
  const querySet = Array.isArray(plan?.query_set) ? plan.query_set : [];
  return { domain_lens: plan?.domain_lens || null, primary_query_set: querySet, reinforcement_query_set: [] };
}

function createPassTargetFallbackProvider(options = {}) {
  const registry = options.registry;
  if (!registry || !Array.isArray(registry.targets) || typeof registry.select !== 'function') throw new TypeError('registry is required');
  const ownedTargetIds = new Set((options.target_ids || []).map(String));
  if (!ownedTargetIds.size) throw new TypeError('target_ids must not be empty');
  const ownedTargets = registry.targets.filter((target) => ownedTargetIds.has(String(target.target_id)));
  const domains = [...new Set(ownedTargets.flatMap((target) => target.genres))].sort();
  const providerId = 'public-pass-kb-fallback';
  const transport = options.transport || secureGet;
  const limit = Math.max(1, Math.min(8, Number(options.limit || 4)));
  const selectTargets = (plan) => registry.select(selectionPlan(plan), { limit, target_ids: [...ownedTargetIds], binding_required: true });

  return Object.freeze({
    provider_id: providerId,
    source_class: 'FREE_OFFICIAL_LIVE',
    source_family_id: 'public-specialist-kb-target-fallback',
    priority: 95,
    domains: Object.freeze(domains),
    capabilities: Object.freeze(['NO_REINFORCEMENT']),
    routing_terms: Object.freeze([]),
    latency_p50_ms: 1200,
    latency_p95_ms: 6000,
    maximum_cost_minor: 0,
    certified: true,
    kb_target_binding: Object.freeze({ mode: 'UNBOUND_PASS_TARGET_OFFICIAL_SITE_SEARCH', required: true, automatic_target_count: ownedTargets.length, target_ids: Object.freeze([...ownedTargetIds]), catalog_source_ids: Object.freeze([]) }),
    target_matcher: (plan) => selectTargets(plan),
    async search(plan, context = {}) {
      const allCandidates = [];
      const failures = [];
      const queryResults = [];
      let requests = 0;
      const targets = selectTargets(plan);
      for (const query of Array.isArray(plan.query_set) ? plan.query_set : []) {
        const queryCandidates = [];
        for (const target of targets) {
          try {
            const result = await searchOneTarget(target, String(query.text || ''), context, transport);
            requests += result.requests;
            queryCandidates.push(...result.candidates);
          } catch (error) {
            failures.push(Object.freeze({ query_id: String(query.query_id), target_id: target.target_id, code: error.code || 'PASS_TARGET_SEARCH_FAILED', message: error.message }));
          }
        }
        allCandidates.push(...queryCandidates);
        queryResults.push(Object.freeze({ query_id: String(query.query_id), retrieval_status: queryCandidates.length ? 'FOUND' : (failures.some((item) => item.query_id === String(query.query_id)) ? 'RETRIEVAL_FAILED' : 'NOT_FOUND'), candidate_record_ids: Object.freeze(queryCandidates.map((item) => item.canonical_record_id)), error_code: queryCandidates.length ? null : (failures.find((item) => item.query_id === String(query.query_id))?.code || null), endpoint_count: targets.length, completed_endpoint_count: Math.max(0, targets.length - failures.filter((item) => item.query_id === String(query.query_id)).length) }));
      }
      const complete = queryResults.filter((item) => item.retrieval_status !== 'RETRIEVAL_FAILED').length;
      return Object.freeze({ coverage_state: complete === queryResults.length ? 'COMPLETE_FOR_QUERY_SCOPE' : complete ? 'PARTIAL_FOR_QUERY_SCOPE' : 'UNKNOWN', candidates: Object.freeze(allCandidates), query_results: Object.freeze(queryResults), search_targets: Object.freeze(targets), current_watermark: Object.freeze({ provider_id: providerId, completed_at: new Date().toISOString(), coverage_state: complete === queryResults.length ? 'COMPLETE' : complete ? 'PARTIAL' : 'UNKNOWN' }), usage: Object.freeze({ requests, results: allCandidates.length, query_count: queryResults.length, target_count: targets.length }), failures: Object.freeze(failures) });
    }
  });
}

module.exports = { TARGET_SEED_OVERRIDES, MYSQL_ORACLE_ROOT, MYSQL_FUNCTION_INDEX, createPassTargetFallbackProvider, contentScore, discoverSearchUrls, extractLinks, queryTokens, resolveSeedUrl, searchOneTarget, stripHtml };
