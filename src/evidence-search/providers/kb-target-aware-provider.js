'use strict';

const {
  KbTargetRegistry,
  normalizeBindingName,
  normalizeBindingUrl
} = require('../core/kb-target-registry');

function resolveProviderCatalogSources(providerId, providerDefinitions = [], sourceCatalog = null) {
  if (!sourceCatalog || !Array.isArray(sourceCatalog.sources)) return Object.freeze([]);
  const definition = (providerDefinitions || []).find(
    (item) => item && item.enabled !== false && String(item.provider_id || '') === String(providerId)
  );
  if (!definition) return Object.freeze([]);
  const sourceIds = new Set((definition.catalog_source_ids || []).map(String));
  return Object.freeze(sourceCatalog.sources.filter((source) => sourceIds.has(String(source.source_id))));
}

function targetMatchesCatalogSource(target, source) {
  if (!target || !source) return false;
  const targetUrl = normalizeBindingUrl(target.official_url);
  const sourceUrl = normalizeBindingUrl(source.official_url);
  if (targetUrl && sourceUrl && targetUrl === sourceUrl) return true;
  const targetName = normalizeBindingName(target.kb);
  const sourceName = normalizeBindingName(source.name);
  return Boolean(targetName && sourceName && targetName === sourceName);
}

function selectionPlan(plan, phase = 'INITIAL') {
  if (Array.isArray(plan?.query_set)) {
    return {
      domain_lens: plan.domain_lens || null,
      primary_query_set: phase === 'REINFORCEMENT' ? [] : plan.query_set,
      reinforcement_query_set: phase === 'REINFORCEMENT' ? plan.query_set : []
    };
  }
  return {
    domain_lens: plan?.domain_lens || null,
    primary_query_set: phase === 'REINFORCEMENT' ? [] : (plan?.primary_query_set || []),
    reinforcement_query_set: phase === 'REINFORCEMENT'
      ? (plan?.reinforcement_query_set || [])
      : []
  };
}

function attachKbTargets(provider, registry, options = {}) {
  if (!provider || typeof provider !== 'object' || typeof provider.search !== 'function') {
    throw new TypeError('provider must implement search(plan, context)');
  }
  if (!(registry instanceof KbTargetRegistry)) {
    throw new TypeError('registry must be a KbTargetRegistry');
  }
  const limit = Math.max(1, Math.min(128, Number(options.limit || 32)));
  const requireBinding = options.requireBinding === true;
  const catalogSources = Object.freeze([...(options.catalogSources || options.catalog_sources || [])]);
  const officialUrls = Object.freeze(catalogSources.map((source) => source?.official_url).filter(Boolean));
  const kbNames = Object.freeze(catalogSources.map((source) => source?.name).filter(Boolean));
  const allAutomaticBoundTargets = Object.freeze(registry.targets.filter(
    (target) => target.automatic_search_eligible
      && catalogSources.some((source) => targetMatchesCatalogSource(target, source))
  ));
  const originalSearch = provider.search.bind(provider);

  const selectBoundTargets = (plan, phase = 'INITIAL') => registry.select(
    selectionPlan(plan, phase),
    {
      limit,
      official_urls: officialUrls,
      kb_names: kbNames,
      binding_required: requireBinding
    }
  );

  return Object.freeze({
    ...provider,
    kb_target_binding: Object.freeze({
      mode: 'EXACT_CATALOG_URL_OR_NAME',
      required: requireBinding,
      catalog_source_ids: Object.freeze(catalogSources.map((source) => String(source.source_id || '')).filter(Boolean)),
      automatic_target_count: allAutomaticBoundTargets.length,
      target_ids: Object.freeze(allAutomaticBoundTargets.map((target) => target.target_id))
    }),
    target_matcher: (plan, phase = 'INITIAL') => selectBoundTargets(plan, phase),
    search: async (plan, context = {}) => {
      const phase = String(plan?.phase || 'INITIAL').toUpperCase();
      const searchTargets = selectBoundTargets(plan, phase);
      if (requireBinding && searchTargets.length === 0) {
        const error = new Error(`provider ${provider.provider_id} has no exact KB target binding for this search plan`);
        error.code = 'EVIDENCE_KB_TARGET_PROVIDER_UNBOUND';
        error.status = 503;
        throw error;
      }
      const targetAwarePlan = Object.freeze({
        ...plan,
        search_targets: searchTargets
      });
      const result = await originalSearch(targetAwarePlan, context);
      if (!result || typeof result !== 'object' || Array.isArray(result)) return result;
      return Object.freeze({
        ...result,
        search_targets: searchTargets
      });
    }
  });
}

function attachKbTargetsToProviders(providers, registry, options = {}) {
  if (!Array.isArray(providers)) throw new TypeError('providers must be an array');
  const providerDefinitions = Array.isArray(options.providerDefinitions) ? options.providerDefinitions : [];
  const sourceCatalog = options.sourceCatalog || null;
  return Object.freeze(providers.map((provider) => attachKbTargets(provider, registry, {
    ...options,
    catalogSources: resolveProviderCatalogSources(
      provider.provider_id,
      providerDefinitions,
      sourceCatalog
    )
  })));
}

module.exports = {
  attachKbTargets,
  attachKbTargetsToProviders,
  resolveProviderCatalogSources,
  targetMatchesCatalogSource
};
