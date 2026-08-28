'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const {
  REQUIRED_DOMAINS,
  loadEvidenceSourceCatalog
} = require('../src/evidence-search/providers/source-catalog');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');

const configFile = process.env.ASTERA_EVIDENCE_LIVE_CONFIG
  || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

function providerIdentity(record) {
  return String(
    record?.canonical_record_id
      || record?.record_id
      || record?.id
      || record?.canonical_url
      || record?.url
      || ''
  ).trim();
}

async function main() {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  if (!catalog) throw new Error('public specialist source catalog is required');

  const baselineIds = [...new Set(catalog.policy?.baseline_source_ids || [])];
  if (baselineIds.length < 18) throw new Error(`expected at least 18 baseline public specialist sources, got ${baselineIds.length}`);
  if (catalog.policy?.source_count_limit !== null) throw new Error('public source catalog must not have a fixed count ceiling');

  const providers = loadEvidenceProviders({ configFile });
  if (providers.length < 8) throw new Error(`expected broad public specialist provider coverage, got ${providers.length}`);
  if (providers.every((provider) => /^(github|gitlab)-/.test(provider.provider_id))) {
    throw new Error('public specialist evidence search must not be limited to GitHub/GitLab');
  }

  const registry = new ProviderRegistry(providers);
  const coverage = {};
  for (const domain of REQUIRED_DOMAINS) {
    const selected = registry.select({
      domain_lens: { id: domain },
      source_policy: {
        provider_allowlist: [],
        provider_denylist: [],
        free_projection: true,
        free_current: true
      }
    }, 'INITIAL');
    if (selected.length < 2) throw new Error(`${domain} has insufficient public specialist provider coverage: ${selected.length}`);
    coverage[domain] = selected.map((provider) => provider.provider_id);
  }

  const definitions = new Map(
    parsed.providers
      .filter((provider) => provider && provider.enabled !== false)
      .map((provider) => [provider.provider_id, provider])
  );
  const summaries = [];

  for (const provider of providers) {
    const definition = definitions.get(provider.provider_id);
    if (!definition) throw new Error(`missing provider definition for ${provider.provider_id}`);
    const queryText = String(definition.smoke_query || '').trim();
    if (!queryText) throw new Error(`provider ${provider.provider_id} is missing smoke_query`);
    const domain = String((definition.domains || [])[0] || 'G01').toUpperCase();
    const controller = new AbortController();
    const result = await provider.search({
      schema_version: 'astera.evidence-search.provider-plan.v1',
      phase: 'INITIAL',
      request_id: `live-${provider.provider_id}`,
      query_plan_hash: 'live-public-specialist-smoke-v2',
      effective_as_of: new Date().toISOString(),
      domain_lens: { id: domain },
      conditions: [],
      query_set: [{
        query_id: 'live-q1',
        claim_id: 'live-claim',
        role: 'PRIMARY',
        class: 'PRIMARY',
        text: queryText
      }],
      maximum_results: 20
    }, {
      signal: controller.signal,
      deadline_at: Date.now() + 15_000,
      tenant_id: 'live-smoke',
      request_id: `live-${provider.provider_id}`
    });

    const query = result.query_results?.[0];
    if (query?.retrieval_status !== 'FOUND') {
      const failures = Array.isArray(result.failures) ? result.failures : [];
      const detail = failures.map((failure) => `${failure.endpoint_id}:${failure.code}`).join(',') || query?.error_code || query?.retrieval_status || 'missing result';
      throw new Error(`${provider.provider_id} live retrieval failed: ${detail}`);
    }
    if (!Array.isArray(result.candidates) || result.candidates.length === 0) {
      throw new Error(`${provider.provider_id} returned no live candidates`);
    }
    const identities = result.candidates.map(providerIdentity).filter(Boolean);
    if (!identities.length) throw new Error(`${provider.provider_id} returned candidates without stable identities`);

    summaries.push({
      provider_id: provider.provider_id,
      source_class: provider.source_class,
      catalog_source_ids: definition.catalog_source_ids || [],
      retrieval_status: query.retrieval_status,
      candidate_count: result.candidates.length,
      sample_identity: identities[0]
    });
  }

  const searchableSources = catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE');
  const unresolvedBaseline = catalog.sources
    .filter((source) => source.baseline_registry && source.runtime_state !== 'SEARCHABLE')
    .map((source) => ({ source_id: source.source_id, runtime_state: source.runtime_state, retrieval_strategy: source.retrieval_strategy }));

  console.log(JSON.stringify({
    status: 'LIVE_SEARCH_OK',
    baseline_source_count: baselineIds.length,
    catalog_source_count: catalog.sources.length,
    searchable_source_count: searchableSources.length,
    enabled_provider_count: providers.length,
    all_domain_coverage: coverage,
    providers: summaries,
    unresolved_baseline_sources: unresolvedBaseline
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'LIVE_SEARCH_FAILED',
    code: error.code || null,
    message: error.message
  }, null, 2));
  process.exit(1);
});
