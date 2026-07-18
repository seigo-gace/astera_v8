'use strict';

function normalizeProvider(provider, index) {
  if (!provider || typeof provider !== 'object') throw new TypeError(`providers[${index}] must be an object`);
  const providerId = String(provider.provider_id || provider.id || '').trim();
  if (!providerId) throw new TypeError(`providers[${index}].provider_id is required`);
  if (typeof provider.search !== 'function') throw new TypeError(`provider ${providerId} must implement search(plan, context)`);
  const sourceClass = String(provider.source_class || 'FREE_PROJECTION').toUpperCase();
  const valid = new Set(['FREE_PROJECTION', 'FREE_OFFICIAL_LIVE', 'PAID_PROVIDER', 'PRIVATE_SOURCE']);
  if (!valid.has(sourceClass)) throw new TypeError(`provider ${providerId} source_class is invalid`);
  return Object.freeze({
    provider_id: providerId,
    source_class: sourceClass,
    priority: Number.isInteger(provider.priority) ? provider.priority : 100,
    domains: Object.freeze([...(provider.domains || [])].map((v) => String(v).toUpperCase()).sort()),
    capabilities: Object.freeze([...(provider.capabilities || [])].map(String).sort()),
    source_family_id: String(provider.source_family_id || providerId),
    latency_p95_ms: Math.max(1, Number(provider.latency_p95_ms || 500)),
    maximum_cost_minor: Math.max(0, Number(provider.maximum_cost_minor || 0)),
    certified: provider.certified !== false,
    supports_idempotency: provider.supports_idempotency === true,
    search: provider.search.bind(provider),
    revalidate: typeof provider.revalidate === 'function' ? provider.revalidate.bind(provider) : null,
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
    this.providers = Object.freeze(normalized.sort((a, b) => a.priority - b.priority || a.provider_id.localeCompare(b.provider_id)));
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
      if (phase === 'REINFORCEMENT' && (provider.capabilities.includes('NO_REINFORCEMENT') || provider.capabilities.includes('INITIAL_ONLY'))) return false;
      return true;
    });
  }

  health() {
    return this.providers.map((provider) => ({ provider_id: provider.provider_id, source_class: provider.source_class, certified: provider.certified, capabilities: provider.capabilities }));
  }
}

module.exports = { ProviderRegistry };
