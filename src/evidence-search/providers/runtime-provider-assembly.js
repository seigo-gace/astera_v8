'use strict';

const { KbTargetRegistry } = require('../core/kb-target-registry');
const { createPassTargetFallbackProvider } = require('./pass-target-fallback-provider');
const { createGeneralWebSearchProvider } = require('./general-web-search-provider');

function boundTargetIds(providers) {
  return new Set((providers || []).flatMap((provider) => [...(provider?.kb_target_binding?.target_ids || [])].map(String)));
}

function baseTargets(registry) {
  const count = Math.max(0, Math.min(Number(registry?.base_target_count || 0), registry?.targets?.length || 0));
  return (registry?.targets || []).slice(0, count);
}

function automaticTargets(registry) {
  return registry.targets.filter((target) => target.automatic_search_eligible === true);
}

function automaticPassTargets(registry) {
  return automaticTargets(registry).filter((target) => target.recorded_statuses.includes('PASS'));
}

function requiredRuntimeTargets(registry) {
  const base = baseTargets(registry);
  const baseIds = new Set(base.map((target) => String(target.target_id)));
  const supplementalAutomatic = automaticTargets(registry).filter((target) => !baseIds.has(String(target.target_id)));
  return Object.freeze([...base, ...supplementalAutomatic]);
}

function unboundTargetIds(targets, providers) {
  const bound = boundTargetIds(providers);
  return targets
    .filter((target) => !bound.has(String(target.target_id)))
    .map((target) => String(target.target_id));
}

function unboundBaseTargetIds(registry, providers) {
  return unboundTargetIds(baseTargets(registry), providers);
}

function unboundAutomaticTargetIds(registry, providers) {
  return unboundTargetIds(automaticTargets(registry), providers);
}

function unboundAutomaticPassTargetIds(registry, providers) {
  return unboundTargetIds(automaticPassTargets(registry), providers);
}

function unboundRequiredRuntimeTargetIds(registry, providers) {
  return unboundTargetIds(requiredRuntimeTargets(registry), providers);
}

function createFallbackExecutionRegistry(registry, targetIds) {
  const executableIds = new Set((targetIds || []).map(String));
  const targets = registry.targets.map((target) => {
    if (!executableIds.has(String(target.target_id)) || target.automatic_search_eligible === true) return target;
    return Object.freeze({ ...target, automatic_search_eligible: true });
  });
  return new KbTargetRegistry(targets, {
    source_record_count: registry.source_record_count,
    base_target_count: registry.base_target_count,
    runtime_target_count: registry.runtime_target_count
  });
}

function assembleRuntimeProviders(options = {}) {
  const registry = options.registry;
  const dedicatedProviders = Array.isArray(options.dedicatedProviders) ? options.dedicatedProviders : [];
  if (!registry || !Array.isArray(registry.targets)) throw new TypeError('registry is required');

  const fallbackTargetIds = unboundRequiredRuntimeTargetIds(registry, dedicatedProviders);
  const fallbackExecutionRegistry = fallbackTargetIds.length
    ? createFallbackExecutionRegistry(registry, fallbackTargetIds)
    : null;
  const fallbackProvider = fallbackTargetIds.length
    ? createPassTargetFallbackProvider({ registry: fallbackExecutionRegistry, target_ids: fallbackTargetIds, limit: options.fallbackLimit || 4 })
    : null;
  const generalWebProvider = options.generalWebProvider || createGeneralWebSearchProvider(options.generalWebOptions || {});
  const providers = Object.freeze([
    ...dedicatedProviders,
    ...(fallbackProvider ? [fallbackProvider] : []),
    generalWebProvider
  ]);

  return Object.freeze({
    providers,
    fallbackProvider,
    generalWebProvider,
    fallbackTargetIds: Object.freeze([...fallbackTargetIds]),
    baseTargetCount: baseTargets(registry).length,
    requiredRuntimeTargetCount: requiredRuntimeTargets(registry).length,
    automaticTargetCount: automaticTargets(registry).length,
    automaticPassTargetCount: automaticPassTargets(registry).length,
    remainingUnboundBaseTargetIds: Object.freeze(unboundBaseTargetIds(registry, providers)),
    remainingUnboundTargetIds: Object.freeze(unboundRequiredRuntimeTargetIds(registry, providers)),
    remainingUnboundAutomaticTargetIds: Object.freeze(unboundAutomaticTargetIds(registry, providers)),
    remainingUnboundPassTargetIds: Object.freeze(unboundAutomaticPassTargetIds(registry, providers))
  });
}

module.exports = {
  assembleRuntimeProviders,
  automaticPassTargets,
  automaticTargets,
  baseTargets,
  boundTargetIds,
  createFallbackExecutionRegistry,
  requiredRuntimeTargets,
  unboundAutomaticPassTargetIds,
  unboundAutomaticTargetIds,
  unboundBaseTargetIds,
  unboundRequiredRuntimeTargetIds
};
