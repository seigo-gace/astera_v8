'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');
const { attachKbTargetsToProviders } = require('../src/evidence-search/providers/kb-target-aware-provider');
const { assembleRuntimeProviders, baseTargets, boundTargetIds } = require('../src/evidence-search/providers/runtime-provider-assembly');

const EXPECTED_BASE_KB_TARGET_COUNT = 663;
const configFile = process.env.ASTERA_EVIDENCE_LIVE_CONFIG || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
const reportFile = process.env.ASTERA_EVIDENCE_BINDING_REPORT || path.join(__dirname, '..', 'artifacts', 'evidence-kb-target-binding-report.json');

function countBound(targets, boundIds, predicate = () => true) {
  return targets.filter((target) => predicate(target) && boundIds.has(String(target.target_id))).length;
}

function main() {
  const { absolute, parsed } = readConfig(configFile);
  const sourceCatalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  if (!sourceCatalog) throw new Error('public evidence source catalog is required');
  const targetRegistry = KbTargetRegistry.load();
  const dedicatedProviders = attachKbTargetsToProviders(loadEvidenceProviders({ configFile: absolute }), targetRegistry, {
    providerDefinitions: parsed.providers,
    sourceCatalog,
    requireBinding: true,
    limit: 32
  });
  const runtime = assembleRuntimeProviders({ registry: targetRegistry, dedicatedProviders, fallbackLimit: 4 });
  const boundIds = boundTargetIds(runtime.providers);
  const base = baseTargets(targetRegistry);
  const boundBase = countBound(base, boundIds);
  const boundAutomatic = countBound(targetRegistry.targets, boundIds, (target) => target.automatic_search_eligible);
  const boundAutomaticPass = countBound(targetRegistry.targets, boundIds, (target) => target.automatic_search_eligible && target.recorded_statuses.includes('PASS'));

  if (targetRegistry.base_target_count !== EXPECTED_BASE_KB_TARGET_COUNT) {
    throw new Error(`base KB target count changed: ${targetRegistry.base_target_count}/${EXPECTED_BASE_KB_TARGET_COUNT}`);
  }
  if (runtime.remainingUnboundBaseTargetIds.length !== 0) {
    throw new Error(`base KB targets remain unbound: ${runtime.remainingUnboundBaseTargetIds.length}`);
  }
  if (boundBase !== EXPECTED_BASE_KB_TARGET_COUNT) {
    throw new Error(`base KB binding incomplete: ${boundBase}/${EXPECTED_BASE_KB_TARGET_COUNT}`);
  }
  if (runtime.remainingUnboundTargetIds.length !== 0) {
    throw new Error(`required runtime KB targets remain unbound: ${runtime.remainingUnboundTargetIds.length}`);
  }
  if (boundAutomatic !== targetRegistry.automatic_target_count) {
    throw new Error(`automatic KB binding incomplete: ${boundAutomatic}/${targetRegistry.automatic_target_count}`);
  }
  if (!runtime.providers.some((provider) => provider.provider_id === 'free-general-web-search' && provider.source_class === 'FREE_GENERAL_WEB')) {
    throw new Error('free general web search provider is missing from runtime assembly');
  }

  const providerBindings = runtime.providers
    .map((provider) => ({
      provider_id: provider.provider_id,
      source_class: provider.source_class,
      binding_mode: provider?.kb_target_binding?.mode || null,
      automatic_target_count: Number(provider?.kb_target_binding?.automatic_target_count || 0),
      target_count: (provider?.kb_target_binding?.target_ids || []).length,
      target_ids: [...(provider?.kb_target_binding?.target_ids || [])]
    }))
    .filter((provider) => provider.target_ids.length)
    .sort((a, b) => a.provider_id.localeCompare(b.provider_id));

  const report = {
    schema_version: 'astera.evidence-search.runtime-completion-report.v2',
    generated_at: new Date().toISOString(),
    source_record_count: targetRegistry.source_record_count,
    base_target_count: targetRegistry.base_target_count,
    runtime_target_count: targetRegistry.runtime_target_count,
    kb_target_count: targetRegistry.target_count,
    required_runtime_target_count: runtime.requiredRuntimeTargetCount,
    automatic_kb_target_count: targetRegistry.automatic_target_count,
    automatic_pass_target_count: runtime.automaticPassTargetCount,
    bound_base_target_count: boundBase,
    unbound_base_target_count: runtime.remainingUnboundBaseTargetIds.length,
    bound_automatic_target_count: boundAutomatic,
    bound_automatic_pass_target_count: boundAutomaticPass,
    unbound_automatic_target_count: runtime.remainingUnboundAutomaticTargetIds.length,
    unbound_automatic_pass_target_count: runtime.remainingUnboundPassTargetIds.length,
    unbound_required_runtime_target_count: runtime.remainingUnboundTargetIds.length,
    fallback_target_count: runtime.fallbackTargetIds.length,
    bound_provider_count: providerBindings.length,
    bound_target_count: boundIds.size,
    general_web_provider_id: runtime.generalWebProvider.provider_id,
    completion_gate: {
      expected_base_target_count: EXPECTED_BASE_KB_TARGET_COUNT,
      base_target_count_matches: targetRegistry.base_target_count === EXPECTED_BASE_KB_TARGET_COUNT,
      all_base_targets_bound: boundBase === EXPECTED_BASE_KB_TARGET_COUNT && runtime.remainingUnboundBaseTargetIds.length === 0,
      all_required_runtime_targets_bound: runtime.remainingUnboundTargetIds.length === 0
    },
    provider_bindings: providerBindings
  };
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'EVIDENCE_KB_RUNTIME_COMPLETION_OK', ...report }, null, 2));
}

try { main(); } catch (error) {
  console.error(JSON.stringify({ status: 'EVIDENCE_KB_RUNTIME_COMPLETION_FAILED', code: error.code || null, message: error.message, stack: error.stack }, null, 2));
  process.exit(1);
}
