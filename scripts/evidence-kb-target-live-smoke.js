'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');
const {
  BINDING_MODE,
  attachKbTargetsToProviders
} = require('../src/evidence-search/providers/kb-target-aware-provider');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');

const configFile = process.env.ASTERA_EVIDENCE_LIVE_CONFIG
  || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
const reportFile = process.env.ASTERA_EVIDENCE_BINDING_REPORT
  || path.join(__dirname, '..', 'artifacts', 'evidence-kb-target-binding-report.json');

const REQUIRED_BOUND_TARGET_NAMES = Object.freeze([
  'NASA Earthdata CMR Search',
  'IETF Datatracker',
  'JPL Horizons API',
  'Red Hat CVE Database',
  'RCSB Protein Data Bank Search API',
  'USGS FDSN Event',
  'Hugging Face Hub Search',
  'PubChem PUG REST'
]);

const LIVE_CASES = Object.freeze([
  Object.freeze({ provider_id: 'nasa-cmr-collection-search', target_name: 'NASA Earthdata CMR Search', domain: 'G21', query: 'climate' }),
  Object.freeze({ provider_id: 'ietf-datatracker-document-search', target_name: 'IETF Datatracker', domain: 'G36', query: 'RFC 8446' }),
  Object.freeze({ provider_id: 'jpl-horizons-target-search', target_name: 'JPL Horizons API', domain: 'G19', query: 'Mars' }),
  Object.freeze({ provider_id: 'redhat-cve-record-search', target_name: 'Red Hat CVE Database', domain: 'G31', query: 'CVE-2024-3094' }),
  Object.freeze({ provider_id: 'rcsb-pdb-entry-search', target_name: 'RCSB Protein Data Bank Search API', domain: 'G20', query: '4HHB' }),
  Object.freeze({ provider_id: 'usgs-fdsn-event-record-search', target_name: 'USGS FDSN Event', domain: 'G21', query: 'usp000hvnu' }),
  Object.freeze({ provider_id: 'huggingface-hub-model-search', target_name: 'Hugging Face Hub Search', domain: 'G30', query: 'bert' }),
  Object.freeze({ provider_id: 'pubchem-pug-rest-compound-search', target_name: 'PubChem PUG REST', domain: 'G20', query: 'aspirin' })
]);

function recordIdentity(record) {
  return String(record?.canonical_record_id || record?.record_id || record?.id || record?.canonical_url || record?.url || '').trim();
}

function writeBindingReport({ targetRegistry, providers }) {
  const bindings = providers
    .map((provider) => ({
      provider_id: provider.provider_id,
      source_class: provider.source_class,
      binding_mode: provider?.kb_target_binding?.mode || null,
      catalog_source_ids: [...(provider?.kb_target_binding?.catalog_source_ids || [])],
      target_ids: [...(provider?.kb_target_binding?.target_ids || [])]
    }))
    .filter((provider) => provider.target_ids.length > 0)
    .sort((a, b) => a.provider_id.localeCompare(b.provider_id));
  const boundTargetIds = new Set(bindings.flatMap((provider) => provider.target_ids));
  const boundTargets = targetRegistry.targets
    .filter((target) => boundTargetIds.has(String(target.target_id)))
    .map((target) => ({
      target_id: target.target_id,
      kb: target.kb,
      official_url: target.official_url,
      genres: [...target.genres],
      target_state: target.target_state
    }));
  const unboundAutomaticTargets = targetRegistry.targets
    .filter((target) => target.automatic_search_eligible && !boundTargetIds.has(String(target.target_id)))
    .map((target) => ({
      target_id: target.target_id,
      kb: target.kb,
      official_url: target.official_url,
      genres: [...target.genres],
      recorded_statuses: [...target.recorded_statuses]
    }));
  const report = {
    schema_version: 'astera.evidence-search.kb-target-binding-report.v1',
    generated_at: new Date().toISOString(),
    binding_mode: BINDING_MODE,
    source_record_count: targetRegistry.source_record_count,
    kb_target_count: targetRegistry.target_count,
    automatic_kb_target_count: targetRegistry.automatic_target_count,
    bound_provider_count: bindings.length,
    bound_target_count: boundTargetIds.size,
    unbound_automatic_target_count: unboundAutomaticTargets.length,
    provider_bindings: bindings,
    bound_targets: boundTargets,
    unbound_automatic_targets: unboundAutomaticTargets
  };
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

async function runLiveCase(providerRegistry, liveCase) {
  const canonicalPlan = {
    question: liveCase.query,
    domain_lens: { id: liveCase.domain },
    source_policy: {
      provider_allowlist: [liveCase.provider_id],
      provider_denylist: [],
      free_projection: true,
      free_current: true
    },
    primary_query_set: [{
      query_id: `${liveCase.provider_id}-q1`,
      claim_id: `${liveCase.provider_id}-claim`,
      role: 'PRIMARY',
      class: 'PRIMARY',
      text: liveCase.query
    }],
    reinforcement_query_set: []
  };

  const selected = providerRegistry.select(canonicalPlan, 'INITIAL');
  if (selected.length !== 1 || selected[0].provider_id !== liveCase.provider_id) {
    throw new Error(`expected ${liveCase.provider_id}, got ${selected.map((item) => item.provider_id).join(',')}`);
  }

  const selectedTargets = selected[0].target_matcher(canonicalPlan, 'INITIAL');
  const target = selectedTargets.find((item) => item.kb === liveCase.target_name);
  if (!target) {
    throw new Error(`${liveCase.target_name} KB target was not bound to ${liveCase.provider_id}`);
  }

  const result = await selected[0].search({
    schema_version: 'astera.evidence-search.provider-plan.v1',
    phase: 'INITIAL',
    request_id: `kb-target-live-smoke-${liveCase.provider_id}`,
    query_plan_hash: `kb-target-live-smoke-${liveCase.provider_id}`,
    effective_as_of: new Date().toISOString(),
    domain_lens: { id: liveCase.domain },
    conditions: [],
    query_set: canonicalPlan.primary_query_set,
    maximum_results: 10
  }, {
    signal: new AbortController().signal,
    deadline_at: Date.now() + 25_000,
    tenant_id: 'kb-target-live-smoke',
    request_id: `kb-target-live-smoke-${liveCase.provider_id}`
  });

  const query = result.query_results?.[0];
  const identities = (result.candidates || []).map(recordIdentity).filter(Boolean);
  if (query?.retrieval_status !== 'FOUND' || identities.length === 0) {
    throw new Error(`${liveCase.provider_id} live search failed: ${query?.retrieval_status || 'NO_QUERY_RESULT'}`);
  }
  if (!Array.isArray(result.search_targets) || !result.search_targets.some((item) => item.target_id === target.target_id)) {
    throw new Error(`${liveCase.provider_id} result did not retain KB target binding`);
  }

  return Object.freeze({
    provider_id: liveCase.provider_id,
    target_name: liveCase.target_name,
    retrieval_status: query.retrieval_status,
    candidate_count: result.candidates.length,
    sample_record_id: identities[0]
  });
}

async function main() {
  const { absolute, parsed } = readConfig(configFile);
  const sourceCatalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  if (!sourceCatalog) throw new Error('public evidence source catalog is required');
  const targetRegistry = KbTargetRegistry.load();
  const providers = attachKbTargetsToProviders(
    loadEvidenceProviders({ configFile: absolute }),
    targetRegistry,
    {
      providerDefinitions: parsed.providers,
      sourceCatalog,
      requireBinding: true,
      limit: 32
    }
  );

  const bindingReport = writeBindingReport({ targetRegistry, providers });
  if (bindingReport.bound_target_count < 36) {
    throw new Error(`KB-target implementation wave did not reach 36 bound targets: ${bindingReport.bound_target_count}`);
  }
  const boundNames = new Set(bindingReport.bound_targets.map((target) => target.kb));
  const missingTargets = REQUIRED_BOUND_TARGET_NAMES.filter((name) => !boundNames.has(name));
  if (missingTargets.length) {
    throw new Error(`required KB target bindings missing: ${missingTargets.join(', ')}`);
  }

  const providerRegistry = new ProviderRegistry(providers);
  const liveResults = [];
  for (const liveCase of LIVE_CASES) {
    liveResults.push(await runLiveCase(providerRegistry, liveCase));
  }

  console.log(JSON.stringify({
    status: 'KB_TARGET_LIVE_SEARCH_OK',
    kb_target_count: targetRegistry.target_count,
    automatic_kb_target_count: targetRegistry.automatic_target_count,
    bound_provider_count: bindingReport.bound_provider_count,
    bound_target_count: bindingReport.bound_target_count,
    unbound_automatic_target_count: bindingReport.unbound_automatic_target_count,
    required_bound_target_count: REQUIRED_BOUND_TARGET_NAMES.length,
    live_provider_count: liveResults.length,
    binding_mode: BINDING_MODE,
    binding_report: path.relative(path.join(__dirname, '..'), reportFile),
    live_results: liveResults
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'KB_TARGET_LIVE_SEARCH_FAILED',
    code: error.code || null,
    message: error.message
  }, null, 2));
  process.exit(1);
});
