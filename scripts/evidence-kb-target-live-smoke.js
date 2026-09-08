'use strict';

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

function recordIdentity(record) {
  return String(record?.canonical_record_id || record?.record_id || record?.id || record?.canonical_url || record?.url || '').trim();
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

  const boundProviders = providers.filter(
    (provider) => Number(provider?.kb_target_binding?.automatic_target_count || 0) > 0
  );
  const boundTargetIds = new Set(
    boundProviders.flatMap((provider) => provider.kb_target_binding.target_ids || [])
  );
  if (!boundProviders.length || !boundTargetIds.size) {
    throw new Error('no unique executable KB-target bindings were materialized');
  }
  if (boundTargetIds.size <= 14) {
    throw new Error(`KB-target binding expansion did not exceed the previous 14-target baseline: ${boundTargetIds.size}`);
  }

  const providerRegistry = new ProviderRegistry(providers);
  const queryText = 'DataCite climate change';
  const canonicalPlan = {
    question: queryText,
    domain_lens: { id: 'G37' },
    source_policy: {
      provider_allowlist: ['datacite-dois'],
      provider_denylist: [],
      free_projection: true,
      free_current: true
    },
    primary_query_set: [{ query_id: 'live-q1', claim_id: 'live-claim', role: 'PRIMARY', class: 'PRIMARY', text: queryText }],
    reinforcement_query_set: []
  };

  const selected = providerRegistry.select(canonicalPlan, 'INITIAL');
  if (selected.length !== 1 || selected[0].provider_id !== 'datacite-dois') {
    throw new Error(`expected datacite-dois target-bound provider, got ${selected.map((item) => item.provider_id).join(',')}`);
  }
  const selectedTargets = selected[0].target_matcher(canonicalPlan, 'INITIAL');
  const dataCiteTarget = selectedTargets.find(
    (target) => target.official_url === 'https://api.datacite.org/'
  );
  if (!dataCiteTarget) throw new Error('DataCite KB target was not bound to datacite-dois');

  const result = await selected[0].search({
    schema_version: 'astera.evidence-search.provider-plan.v1',
    phase: 'INITIAL',
    request_id: 'kb-target-live-smoke',
    query_plan_hash: 'kb-target-live-smoke',
    effective_as_of: new Date().toISOString(),
    domain_lens: { id: 'G37' },
    conditions: [],
    query_set: canonicalPlan.primary_query_set,
    maximum_results: 20
  }, {
    signal: new AbortController().signal,
    deadline_at: Date.now() + 20_000,
    tenant_id: 'kb-target-live-smoke',
    request_id: 'kb-target-live-smoke'
  });

  const query = result.query_results?.[0];
  const identities = (result.candidates || []).map(recordIdentity).filter(Boolean);
  if (query?.retrieval_status !== 'FOUND' || identities.length === 0) {
    throw new Error(`target-bound live search failed: ${query?.retrieval_status || 'NO_QUERY_RESULT'}`);
  }
  if (!Array.isArray(result.search_targets) || !result.search_targets.some((target) => target.target_id === dataCiteTarget.target_id)) {
    throw new Error('live provider result did not retain the selected KB target binding');
  }

  console.log(JSON.stringify({
    status: 'KB_TARGET_LIVE_SEARCH_OK',
    kb_target_count: targetRegistry.target_count,
    automatic_kb_target_count: targetRegistry.automatic_target_count,
    bound_provider_count: boundProviders.length,
    bound_target_count: boundTargetIds.size,
    unbound_automatic_target_count: targetRegistry.automatic_target_count - boundTargetIds.size,
    binding_mode: BINDING_MODE,
    provider_id: selected[0].provider_id,
    target: {
      target_id: dataCiteTarget.target_id,
      kb: dataCiteTarget.kb,
      official_url: dataCiteTarget.official_url
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
