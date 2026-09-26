'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../quality-completion-evaluator/utils/stable-json');

const SOURCE_CLASSES = new Set([
  'FREE_PROJECTION',
  'FREE_OFFICIAL_LIVE',
  'FREE_GENERAL_WEB',
  'PAID_PROVIDER',
  'PRIVATE_SOURCE'
]);

const SETTLEMENT_MODES = new Set([
  'IMMEDIATE_RECEIPT',
  'DETERMINISTIC_REQUEST_TARIFF',
  'DEFERRED_RECEIPT',
  'UNVERIFIABLE'
]);

function basisPoints(value, field, fallback) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 10_000) {
    throw new TypeError(`${field} must be an integer from 0 to 10000`);
  }
  return number;
}

function nonNegativeSafeInteger(value, field, fallback = 0) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new TypeError(`${field} must be a non-negative safe integer`);
  }
  return number;
}

function normalizeRoutingTerm(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function routingText(plan) {
  return [
    plan?.question,
    ...(plan?.primary_query_set || []).map((query) => query?.text),
    ...(plan?.reinforcement_query_set || []).map((query) => query?.text)
  ].map(normalizeRoutingTerm).filter(Boolean).join(' ');
}

const VALID_DOMAIN_LENS_PATTERN = /^G(?:0[1-9]|[12][0-9]|3[0-8])$/;

function isResolvedDomainLens(domainLens) {
  const domainId = domainLens?.id;
  return VALID_DOMAIN_LENS_PATTERN.test(String(domainId || ''));
}

function routingTermMatches(text, term) {
  if (!term) return false;
  if (/^[a-z0-9.+#-]{1,3}$/i.test(term)) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
  }
  return text.includes(term);
}

function envTtl(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function defaultCacheTtlMs(sourceClass) {
  if (sourceClass === 'FREE_PROJECTION') return envTtl('ASTERA_SEARCH_CACHE_PROJECTION_TTL_MS', 30_000);
  if (sourceClass === 'FREE_OFFICIAL_LIVE') return envTtl('ASTERA_SEARCH_CACHE_OFFICIAL_TTL_MS', 5_000);
  if (sourceClass === 'FREE_GENERAL_WEB') return envTtl('ASTERA_SEARCH_CACHE_GENERAL_TTL_MS', 2_000);
  return 0;
}

function createQueryScopedCache(providerId, sourceClass, rawSearch, configuredTtlMs) {
  const ttlMs = nonNegativeSafeInteger(configuredTtlMs, `${providerId}.cache_ttl_ms`, defaultCacheTtlMs(sourceClass));
  const maxEntries = envTtl('ASTERA_SEARCH_PROVIDER_CACHE_MAX_ENTRIES', 64) || 64;
  const cache = new Map();
  let hits = 0;
  let misses = 0;

  const search = async (plan, context) => {
    if (ttlMs <= 0) return rawSearch(plan, context);
    const parsedEffective = Date.parse(String(plan?.effective_as_of || ''));
    const effectiveMs = Number.isFinite(parsedEffective) ? parsedEffective : Date.now();
    const bucket = Math.floor(effectiveMs / ttlMs);
    const key = crypto.createHash('sha256').update(stableStringify({
      provider_id: providerId,
      source_class: sourceClass,
      phase: plan?.phase || null,
      domain_lens: plan?.domain_lens || null,
      conditions: plan?.conditions || [],
      query_set: plan?.query_set || [],
      maximum_results: plan?.maximum_results || null,
      effective_as_of_bucket: bucket
    })).digest('hex');
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expires_at > now) {
      hits += 1;
      cache.delete(key);
      cache.set(key, cached);
      return cached.value;
    }
    if (cached) cache.delete(key);
    misses += 1;
    const value = await rawSearch(plan, context);
    cache.set(key, { value, expires_at: now + ttlMs });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    return value;
  };

  const health = () => Object.freeze({ ttl_ms: ttlMs, entries: cache.size, hits, misses });
  return { search, health };
}

function normalizeProvider(provider, index) {
  if (!provider || typeof provider !== 'object' || Array.isArray(provider)) {
    throw new TypeError(`providers[${index}] must be an object`);
  }

  const providerId = String(provider.provider_id || provider.id || '').trim();
  if (!providerId) throw new TypeError(`providers[${index}].provider_id is required`);
  if (typeof provider.search !== 'function') {
    throw new TypeError(`provider ${providerId} must implement search(plan, context)`);
  }

  const sourceClass = String(provider.source_class || 'FREE_PROJECTION').toUpperCase();
  if (!SOURCE_CLASSES.has(sourceClass)) {
    throw new TypeError(`provider ${providerId} source_class is invalid`);
  }

  const settlementMode = String(
    provider.billing_settlement_mode
      || (sourceClass === 'PAID_PROVIDER' ? 'IMMEDIATE_RECEIPT' : 'DETERMINISTIC_REQUEST_TARIFF')
  ).toUpperCase();
  if (!SETTLEMENT_MODES.has(settlementMode)) {
    throw new TypeError(`provider ${providerId} billing_settlement_mode is invalid`);
  }

  const certified = provider.certified !== false;
  if (sourceClass === 'PAID_PROVIDER' && certified && settlementMode === 'UNVERIFIABLE') {
    throw new TypeError(`paid provider ${providerId} cannot be certified with UNVERIFIABLE settlement`);
  }

  const rawSearch = provider.search.bind(provider);
  const responseCache = createQueryScopedCache(providerId, sourceClass, rawSearch, provider.cache_ttl_ms);

  return Object.freeze({
    provider_id: providerId,
    source_class: sourceClass,
    priority: Number.isInteger(provider.priority) ? provider.priority : 100,
    domains: Object.freeze([...(provider.domains || [])].map((value) => String(value).toUpperCase()).sort()),
    capabilities: Object.freeze([...(provider.capabilities || [])].map(String).sort()),
    routing_terms: Object.freeze([...new Set((provider.routing_terms || []).map(normalizeRoutingTerm).filter(Boolean))].sort()),
    source_family_id: String(provider.source_family_id || providerId),
    latency_p50_ms: Math.max(1, nonNegativeSafeInteger(provider.latency_p50_ms, `${providerId}.latency_p50_ms`, 250)),
    latency_p95_ms: Math.max(1, nonNegativeSafeInteger(provider.latency_p95_ms, `${providerId}.latency_p95_ms`, 500)),
    maximum_cost_minor: nonNegativeSafeInteger(provider.maximum_cost_minor, `${providerId}.maximum_cost_minor`, 0),
    domain_fit_bp: basisPoints(provider.domain_fit_bp, `${providerId}.domain_fit_bp`, 8000),
    expected_quality_bp: basisPoints(provider.expected_quality_bp, `${providerId}.expected_quality_bp`, 8000),
    coverage_bp: basisPoints(provider.coverage_bp, `${providerId}.coverage_bp`, 7000),
    locator_replayability_bp: basisPoints(provider.locator_replayability_bp, `${providerId}.locator_replayability_bp`, 8000),
    freshness_bp: basisPoints(provider.freshness_bp, `${providerId}.freshness_bp`, 7000),
    reliability_bp: basisPoints(provider.reliability_bp, `${providerId}.reliability_bp`, 8000),
    billing_settlement_mode: settlementMode,
    certified,
    interactive_eligible: provider.interactive_eligible !== false,
    supports_idempotency: provider.supports_idempotency === true,
    supports_operation_status: provider.supports_operation_status === true,
    target_matcher: typeof provider.target_matcher === 'function' ? provider.target_matcher.bind(provider) : null,
    search: responseCache.search,
    cache_health: responseCache.health,
    revalidate: typeof provider.revalidate === 'function' ? provider.revalidate.bind(provider) : null,
    read_operation_status: typeof provider.read_operation_status === 'function'
      ? provider.read_operation_status.bind(provider)
      : null,
    describe: typeof provider.describe === 'function' ? provider.describe.bind(provider) : null
  });
}

class ProviderRegistry {
  constructor(providers = []) {
    const normalized = providers.map(normalizeProvider);
    const seen = new Set();
    for (const provider of normalized) {
      if (seen.has(provider.provider_id)) throw new Error(`duplicate provider_id: ${provider.provider_id}`);
      seen.add(provider.provider_id);
    }
    this.providers = Object.freeze(
      normalized.sort((left, right) => left.priority - right.priority || left.provider_id.localeCompare(right.provider_id))
    );
  }

  select(plan, phase = 'INITIAL') {
    const allow = new Set(plan.source_policy.provider_allowlist);
    const deny = new Set(plan.source_policy.provider_denylist);
    const queryText = routingText(plan);
    const resolvedDomain = isResolvedDomainLens(plan.domain_lens);
    const domainId = resolvedDomain ? String(plan.domain_lens.id).toUpperCase() : null;
    const selected = this.providers.filter((provider) => {
      if (!provider.certified) return false;
      if (provider.source_class === 'PAID_PROVIDER') return false;
      if (allow.size && !allow.has(provider.provider_id)) return false;
      if (deny.has(provider.provider_id)) return false;
      if (provider.source_class === 'FREE_PROJECTION' && !plan.source_policy.free_projection) return false;
      if (provider.source_class === 'FREE_OFFICIAL_LIVE' && !plan.source_policy.free_current) return false;
      if (provider.source_class === 'FREE_GENERAL_WEB' && !plan.source_policy.free_general_web) return false;
      if (phase === 'INITIAL' && provider.capabilities.includes('REINFORCEMENT_ONLY')) return false;
      if (phase === 'REINFORCEMENT' && (
        provider.capabilities.includes('NO_REINFORCEMENT')
        || provider.capabilities.includes('INITIAL_ONLY')
      )) return false;

      if (provider.target_matcher) {
        const targets = provider.target_matcher(plan, phase);
        if (!Array.isArray(targets) || targets.length === 0) return false;
      }

      if (provider.source_class === 'FREE_GENERAL_WEB') return true;

      if (resolvedDomain) {
        if (provider.domains.length && !provider.domains.includes(domainId)) return false;
        if (!allow.size && provider.routing_terms.length) {
          if (!queryText) return false;
          if (!provider.routing_terms.some((term) => routingTermMatches(queryText, term))) return false;
        }
        return true;
      }

      if (allow.size) return true;
      if (!provider.routing_terms.length) return false;
      if (!queryText) return false;
      return provider.routing_terms.some((term) => routingTermMatches(queryText, term));
    });
    if (phase === 'INITIAL' && selected.length === 0) {
      const error = new Error('Evidence Search has no active provider for the canonical search plan');
      error.code = 'EVIDENCE_SEARCH_NO_ACTIVE_PROVIDER';
      error.status = 503;
      throw error;
    }
    return selected;
  }

  health() {
    return this.providers.map((provider) => ({
      provider_id: provider.provider_id,
      source_class: provider.source_class,
      active_search_eligible: provider.certified && provider.source_class !== 'PAID_PROVIDER',
      kb_target_binding_enforced: Boolean(provider.target_matcher),
      certified: provider.certified,
      capabilities: provider.capabilities,
      routing_terms: provider.routing_terms,
      cache: provider.cache_health ? provider.cache_health() : null
    }));
  }
}

module.exports = { ProviderRegistry, normalizeRoutingTerm, routingTermMatches, defaultCacheTtlMs };
