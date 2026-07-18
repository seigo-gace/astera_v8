'use strict';

const SOURCE_CLASSES = new Set([
  'FREE_PROJECTION',
  'FREE_OFFICIAL_LIVE',
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
  if (
    sourceClass === 'PAID_PROVIDER'
    && certified
    && settlementMode === 'UNVERIFIABLE'
  ) {
    throw new TypeError(`paid provider ${providerId} cannot be certified with UNVERIFIABLE settlement`);
  }

  return Object.freeze({
    provider_id: providerId,
    source_class: sourceClass,
    priority: Number.isInteger(provider.priority) ? provider.priority : 100,
    domains: Object.freeze([...(provider.domains || [])].map((value) => String(value).toUpperCase()).sort()),
    capabilities: Object.freeze([...(provider.capabilities || [])].map(String).sort()),
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
    search: provider.search.bind(provider),
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
    return this.providers.filter((provider) => {
      if (!provider.certified) return false;
      if (allow.size && !allow.has(provider.provider_id)) return false;
      if (deny.has(provider.provider_id)) return false;
      if (provider.domains.length && !provider.domains.includes(plan.domain_lens.id)) return false;
      if (provider.source_class === 'PAID_PROVIDER' && !plan.source_policy.paid_enabled) return false;
      if (provider.source_class === 'FREE_PROJECTION' && !plan.source_policy.free_projection) return false;
      if (provider.source_class === 'FREE_OFFICIAL_LIVE' && !plan.source_policy.free_current) return false;
      if (phase === 'INITIAL' && provider.capabilities.includes('REINFORCEMENT_ONLY')) return false;
      if (phase === 'REINFORCEMENT' && (
        provider.capabilities.includes('NO_REINFORCEMENT')
        || provider.capabilities.includes('INITIAL_ONLY')
      )) return false;
      return true;
    });
  }

  health() {
    return this.providers.map((provider) => ({
      provider_id: provider.provider_id,
      source_class: provider.source_class,
      certified: provider.certified,
      interactive_eligible: provider.interactive_eligible,
      billing_settlement_mode: provider.billing_settlement_mode,
      capabilities: provider.capabilities
    }));
  }
}

module.exports = { ProviderRegistry };
