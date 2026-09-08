'use strict';

const {
  KbTargetRegistry,
  normalizeBindingName,
  normalizeBindingUrl
} = require('../core/kb-target-registry');

const BINDING_MODE = 'EXACT_OR_CANONICAL_NAME_SAME_AUTHORITY_UNIQUE';
const NAME_NOISE_TOKENS = new Set([
  'api', 'rest', 'json', 'yaml', 'xml', 'html',
  'search', 'official', 'documentation', 'docs', 'doc',
  'web', 'service', 'services', 'database', 'db', 'portal',
  'reference', 'references', 'tool', 'tools', 'public',
  'online', 'data', 'dataset', 'datasets', 'metadata',
  'v1', 'v2', 'v3', 'v4', 'version'
]);

function resolveProviderCatalogSources(providerId, providerDefinitions = [], sourceCatalog = null) {
  if (!sourceCatalog || !Array.isArray(sourceCatalog.sources)) return Object.freeze([]);
  const definition = (providerDefinitions || []).find(
    (item) => item && item.enabled !== false && String(item.provider_id || '') === String(providerId)
  );
  if (!definition) return Object.freeze([]);
  const sourceIds = new Set((definition.catalog_source_ids || []).map(String));
  return Object.freeze(sourceCatalog.sources.filter(
    (source) => sourceIds.has(String(source.source_id))
      && String(source.runtime_state || '') === 'SEARCHABLE'
      && String(source.provider_id || '') === String(providerId)
  ));
}

function bindingHost(value) {
  try {
    return new URL(String(value || '').trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

function relatedAuthorityHost(leftUrl, rightUrl) {
  const left = bindingHost(leftUrl);
  const right = bindingHost(rightUrl);
  if (!left || !right) return false;
  return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`);
}

function normalizeBindingCoreName(value) {
  const normalized = normalizeBindingName(value)
    .replace(/&/g, ' and ')
    .replace(/[|｜/\\()[\]{}:;,._+@#?!'"`~-]+/g, ' ');
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !NAME_NOISE_TOKENS.has(token))
    .filter((token) => !/^v?\d+(?:\.\d+)*$/.test(token));
  return tokens.join(' ');
}

function targetMatchesCatalogSource(target, source) {
  if (!target || !source) return false;
  const targetUrl = normalizeBindingUrl(target.official_url);
  const sourceUrl = normalizeBindingUrl(source.official_url);
  if (targetUrl && sourceUrl && targetUrl === sourceUrl) return true;

  const targetName = normalizeBindingName(target.kb);
  const sourceName = normalizeBindingName(source.name);
  if (targetName && sourceName && targetName === sourceName) return true;

  const targetCoreName = normalizeBindingCoreName(target.kb);
  const sourceCoreName = normalizeBindingCoreName(source.name);
  if (!targetCoreName || !sourceCoreName || targetCoreName !== sourceCoreName) return false;

  return relatedAuthorityHost(target.official_url, source.official_url);
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
  const allowedTargetIds = options.allowedTargetIds
    ? new Set([...options.allowedTargetIds].map(String))
    : null;
  const allAutomaticBoundTargets = Object.freeze(registry.targets.filter(
    (target) => target.automatic_search_eligible
      && (!allowedTargetIds || allowedTargetIds.has(String(target.target_id)))
      && catalogSources.some((source) => targetMatchesCatalogSource(target, source))
  ));
  const boundTargetIds = Object.freeze(allAutomaticBoundTargets.map((target) => String(target.target_id)));
  const originalSearch = provider.search.bind(provider);

  const selectBoundTargets = (plan, phase = 'INITIAL') => registry.select(
    selectionPlan(plan, phase),
    {
      limit,
      target_ids: boundTargetIds,
      binding_required: requireBinding
    }
  );

  return Object.freeze({
    ...provider,
    kb_target_binding: Object.freeze({
      mode: BINDING_MODE,
      required: requireBinding,
      catalog_source_ids: Object.freeze(catalogSources.map((source) => String(source.source_id || '')).filter(Boolean)),
      automatic_target_count: allAutomaticBoundTargets.length,
      target_ids: boundTargetIds
    }),
    target_matcher: (plan, phase = 'INITIAL') => selectBoundTargets(plan, phase),
    search: async (plan, context = {}) => {
      const phase = String(plan?.phase || 'INITIAL').toUpperCase();
      const searchTargets = selectBoundTargets(plan, phase);
      if (requireBinding && searchTargets.length === 0) {
        const error = new Error(`provider ${provider.provider_id} has no unique executable KB target binding for this search plan`);
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
  if (!(registry instanceof KbTargetRegistry)) throw new TypeError('registry must be a KbTargetRegistry');
  const providerDefinitions = Array.isArray(options.providerDefinitions) ? options.providerDefinitions : [];
  const sourceCatalog = options.sourceCatalog || null;

  const catalogSourcesByProvider = new Map();
  const candidateTargetIdsByProvider = new Map();
  const ownersByTargetId = new Map();

  for (const provider of providers) {
    const providerId = String(provider.provider_id || '');
    const catalogSources = resolveProviderCatalogSources(providerId, providerDefinitions, sourceCatalog);
    catalogSourcesByProvider.set(providerId, catalogSources);
    const candidateTargetIds = new Set(
      registry.targets
        .filter(
          (target) => target.automatic_search_eligible
            && catalogSources.some((source) => targetMatchesCatalogSource(target, source))
        )
        .map((target) => String(target.target_id))
    );
    candidateTargetIdsByProvider.set(providerId, candidateTargetIds);
    for (const targetId of candidateTargetIds) {
      if (!ownersByTargetId.has(targetId)) ownersByTargetId.set(targetId, new Set());
      ownersByTargetId.get(targetId).add(providerId);
    }
  }

  return Object.freeze(providers.map((provider) => {
    const providerId = String(provider.provider_id || '');
    const uniqueTargetIds = [...(candidateTargetIdsByProvider.get(providerId) || [])].filter(
      (targetId) => ownersByTargetId.get(targetId)?.size === 1
    );
    return attachKbTargets(provider, registry, {
      ...options,
      catalogSources: catalogSourcesByProvider.get(providerId) || [],
      allowedTargetIds: uniqueTargetIds
    });
  }));
}

module.exports = {
  BINDING_MODE,
  attachKbTargets,
  attachKbTargetsToProviders,
  resolveProviderCatalogSources,
  targetMatchesCatalogSource,
  normalizeBindingCoreName,
  relatedAuthorityHost
};
