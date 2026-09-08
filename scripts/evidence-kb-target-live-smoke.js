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

const REQUIRED_BOUND_TARGET_URLS = Object.freeze([
  'https://www.eionet.europa.eu/gemet/en/search/',
  'https://registry.terraform.io/',
  'https://ntrs.nasa.gov/search',
  'https://conan.io/center',
  'https://pypi.org/',
  'https://pkg.go.dev/',
  'https://www.fao.org/faolex/en/',
  'https://musicbrainz.org/doc/MusicBrainz_API/Search',
  'https://developers.zenodo.org/',
  'https://www.ncbi.nlm.nih.gov/books/NBK25499/',
  'https://www.who.int/data/gho',
  'https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html'
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
  if (!bindingReport.bound_provider_count || !bindingReport.bound_target_count) {
    throw new Error('no unique executable KB-target bindings were materialized');
  }
  if (bindingReport.bound_target_count <= 28) {
    throw new Error(`KB-target binding expansion did not exceed the previous 28-target baseline: ${bindingReport.bound_target_count}`);
  }
  const boundUrls = new Set(bindingReport.bound_targets.map((target) => target.official_url));
  const missingTargets = REQUIRED_BOUND_TARGET_URLS.filter((url) => !boundUrls.has(url));
  if (missingTargets.length) {
    throw new Error(`required KB target bindings missing: ${missingTargets.join(', ')}`);
  }

  const providerRegistry = new ProviderRegistry(providers);
  const queryText = 'climate';
  const canonicalPlan = {
    question: queryText,
    domain_lens: { id: 'G21' },
    source_policy: {
      provider_allowlist: ['nasa-cmr-collection-search'],
      provider_denylist: [],
      free_projection: true,
      free_current: true
    },
    primary_query_set: [{ query_id: 'cmr-q1', claim_id: 'cmr-claim', role: 'PRIMARY', class: 'PRIMARY', text: queryText }],
    reinforcement_query_set: []
  };

  const selected = providerRegistry.select(canonicalPlan, 'INITIAL');
  if (selected.length !== 1 || selected[0].provider_id !== 'nasa-cmr-collection-search') {
    throw new Error(`expected nasa-cmr-collection-search target-bound provider, got ${selected.map((item) => item.provider_id).join(',')}`);
  }
  const selectedTargets = selected[0].target_matcher(canonicalPlan, 'INITIAL');
  const cmrTarget = selectedTargets.find(
    (target) => target.official_url === 'https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html'
  );
  if (!cmrTarget) throw new Error('NASA Earthdata CMR KB target was not bound to nasa-cmr-collection-search');

  const result = await selected[0].search({
    schema_version: 'astera.evidence-search.provider-plan.v1',
    phase: 'INITIAL',
    request_id: 'kb-target-live-smoke-cmr',
    query_plan_hash: 'kb-target-live-smoke-cmr',
    effective_as_of: new Date().toISOString(),
    domain_lens: { id: 'G21' },
    conditions: [],
    query_set: canonicalPlan.primary_query_set,
    maximum_results: 10
  }, {
    signal: new AbortController().signal,
    deadline_at: Date.now() + 20_000,
    tenant_id: 'kb-target-live-smoke',
    request_id: 'kb-target-live-smoke-cmr'
  });

  const query = result.query_results?.[0];
  const identities = (result.candidates || []).map(recordIdentity).filter(Boolean);
  if (query?.retrieval_status !== 'FOUND' || identities.length === 0) {
    throw new Error(`NASA CMR target-bound live search failed: ${query?.retrieval_status || 'NO_QUERY_RESULT'}`);
  }
  if (!Array.isArray(result.search_targets) || !result.search_targets.some((target) => target.target_id === cmrTarget.target_id)) {
    throw new Error('NASA CMR live provider result did not retain the selected KB target binding');
  }

  console.log(JSON.stringify({
    status: 'KB_TARGET_LIVE_SEARCH_OK',
    kb_target_count: targetRegistry.target_count,
    automatic_kb_target_count: targetRegistry.automatic_target_count,
    bound_provider_count: bindingReport.bound_provider_count,
    bound_target_count: bindingReport.bound_target_count,
    unbound_automatic_target_count: bindingReport.unbound_automatic_target_count,
    required_bound_target_count: REQUIRED_BOUND_TARGET_URLS.length,
    binding_mode: BINDING_MODE,
    binding_report: path.relative(path.join(__dirname, '..'), reportFile),
    provider_id: selected[0].provider_id,
    target: {
      target_id: cmrTarget.target_id,
      kb: cmrTarget.kb,
      official_url: cmrTarget.official_url
    },
    retrieval_status: query.retrieval_status,
    candidate_count: result.candidates.length,
    sample_record_id: identities[0]
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
