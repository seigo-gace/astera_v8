'use strict';

const { KbTargetRegistry } = require('../core/kb-target-registry');

function attachKbTargets(provider, registry, options = {}) {
  if (!provider || typeof provider !== 'object' || typeof provider.search !== 'function') {
    throw new TypeError('provider must implement search(plan, context)');
  }
  if (!(registry instanceof KbTargetRegistry)) {
    throw new TypeError('registry must be a KbTargetRegistry');
  }
  const limit = Math.max(1, Math.min(128, Number(options.limit || 32)));
  const originalSearch = provider.search.bind(provider);
  return Object.freeze({
    ...provider,
    search: async (plan, context = {}) => {
      const searchTargets = registry.select({
        domain_lens: plan?.domain_lens || null,
        primary_query_set: Array.isArray(plan?.query_set) ? plan.query_set : [],
        reinforcement_query_set: []
      }, { limit });
      const targetAwarePlan = Object.freeze({
        ...plan,
        search_targets: searchTargets
      });
      return originalSearch(targetAwarePlan, context);
    }
  });
}

function attachKbTargetsToProviders(providers, registry, options = {}) {
  if (!Array.isArray(providers)) throw new TypeError('providers must be an array');
  return Object.freeze(providers.map((provider) => attachKbTargets(provider, registry, options)));
}

module.exports = { attachKbTargets, attachKbTargetsToProviders };
