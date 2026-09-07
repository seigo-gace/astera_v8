'use strict';

const path = require('node:path');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { REQUIRED_DOMAINS, loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');

const configFile = process.env.ASTERA_EVIDENCE_LIVE_CONFIG
  || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

function providerIdentity(record) {
  return String(record?.canonical_record_id || record?.record_id || record?.id || record?.canonical_url || record?.url || '').trim();
}

async function runProvider(provider, definition) {
  const queryText = String(definition.smoke_query || '').trim();
  if (!queryText) return { provider_id: provider.provider_id, ok: false, error: 'MISSING_SMOKE_QUERY' };
  const domain = String((definition.domains || [])[0] || 'G01').toUpperCase();
  try {
    const result = await provider.search({
      schema_version: 'astera.evidence-search.provider-plan.v1',
      phase: 'INITIAL',
      request_id: `live-${provider.provider_id}`,
      query_plan_hash: 'live-public-specialist-smoke-v4',
      effective_as_of: new Date().toISOString(),
      domain_lens: { id: domain },
      conditions: [],
      query_set: [{ query_id: 'live-q1', claim_id: 'live-claim', role: 'PRIMARY', class: 'PRIMARY', text: queryText }],
      maximum_results: 20
    }, {
      signal: new AbortController().signal,
      deadline_at: Date.now() + 20_000,
      tenant_id: 'live-smoke',
      request_id: `live-${provider.provider_id}`
    });
    const query = result.query_results?.[0];
    const identities = (result.candidates || []).map(providerIdentity).filter(Boolean);
    const failures = Array.isArray(result.failures) ? result.failures : [];
    const ok = query?.retrieval_status === 'FOUND' && identities.length > 0;
    return {
      provider_id: provider.provider_id,
      ok,
      retrieval_status: query?.retrieval_status || null,
      candidate_count: Array.isArray(result.candidates) ? result.candidates.length : 0,
      sample_identity: identities[0] || null,
      failures: failures.map((failure) => ({ endpoint_id: failure.endpoint_id, code: failure.code, message: failure.message }))
    };
  } catch (error) {
    return { provider_id: provider.provider_id, ok: false, error: error.code || 'UNCAUGHT_PROVIDER_ERROR', message: error.message };
  }
}

function assertCatalogProviderTruth(catalog, parsed) {
  const catalogById = new Map(catalog.sources.map((source) => [source.source_id, source]));
  const enabledDefinitions = (parsed.providers || []).filter((provider) => provider && provider.enabled !== false);
  const definitionsById = new Map(enabledDefinitions.map((provider) => [String(provider.provider_id || ''), provider]));

  for (const definition of enabledDefinitions) {
    const providerId = String(definition.provider_id || '');
    const sourceIds = Array.isArray(definition.catalog_source_ids)
      ? definition.catalog_source_ids.map(String)
      : [];
    if (!sourceIds.length) throw new Error(`enabled provider ${providerId} has no catalog_source_ids`);
    for (const sourceId of sourceIds) {
      const source = catalogById.get(sourceId);
      if (!source) throw new Error(`enabled provider ${providerId} references missing catalog source ${sourceId}`);
      if (source.runtime_state !== 'SEARCHABLE') {
        throw new Error(`catalog source ${sourceId} is bound to enabled provider ${providerId} but runtime_state=${source.runtime_state}`);
      }
      if (source.provider_id !== providerId) {
        throw new Error(`catalog source ${sourceId} provider_id=${source.provider_id || 'null'} does not match enabled provider ${providerId}`);
      }
    }
  }

  for (const source of catalog.sources) {
    if (source.runtime_state !== 'SEARCHABLE') continue;
    if (!source.provider_id) throw new Error(`SEARCHABLE catalog source ${source.source_id} has no provider_id`);
    const definition = definitionsById.get(source.provider_id);
    if (!definition) throw new Error(`SEARCHABLE catalog source ${source.source_id} points to disabled or missing provider ${source.provider_id}`);
    const sourceIds = Array.isArray(definition.catalog_source_ids)
      ? definition.catalog_source_ids.map(String)
      : [];
    if (!sourceIds.includes(source.source_id)) {
      throw new Error(`SEARCHABLE catalog source ${source.source_id} is not reverse-bound by provider ${source.provider_id}`);
    }
  }

  return {
    enabled_provider_count: enabledDefinitions.length,
    searchable_source_count: catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE').length,
    searchable_baseline_source_count: catalog.sources.filter(
      (source) => source.baseline_registry === true && source.runtime_state === 'SEARCHABLE'
    ).length
  };
}

async function main() {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  if (!catalog) throw new Error('public specialist source catalog is required');
  const baselineIds = [...new Set(catalog.policy?.baseline_source_ids || [])];
  if (baselineIds.length < 18) throw new Error(`expected at least 18 baseline public specialist sources, got ${baselineIds.length}`);
  if (catalog.policy?.source_count_limit !== null) throw new Error('public source catalog must not have a fixed count ceiling');

  const truth = assertCatalogProviderTruth(catalog, parsed);
  const providers = loadEvidenceProviders({ configFile });
  if (providers.length < 10) throw new Error(`expected broad public specialist provider coverage, got ${providers.length}`);
  if (providers.length !== truth.enabled_provider_count) {
    throw new Error(`provider loader mismatch: definitions=${truth.enabled_provider_count}, loaded=${providers.length}`);
  }
  if (providers.every((provider) => /^(github|gitlab)-/.test(provider.provider_id))) {
    throw new Error('public specialist evidence search must not be limited to GitHub/GitLab');
  }

  const registry = new ProviderRegistry(providers);
  const coverage = {};
  for (const domain of REQUIRED_DOMAINS) {
    const selected = registry.select({
      domain_lens: { id: domain },
      source_policy: { provider_allowlist: [], provider_denylist: [], free_projection: true, free_current: true }
    }, 'INITIAL');
    if (selected.length < 2) throw new Error(`${domain} has insufficient public specialist provider coverage: ${selected.length}`);
    coverage[domain] = selected.map((provider) => provider.provider_id);
  }

  const definitions = new Map(parsed.providers.filter((provider) => provider && provider.enabled !== false).map((provider) => [provider.provider_id, provider]));
  const results = [];
  for (const provider of providers) {
    const definition = definitions.get(provider.provider_id);
    if (!definition) {
      results.push({ provider_id: provider.provider_id, ok: false, error: 'MISSING_PROVIDER_DEFINITION' });
      continue;
    }
    results.push(await runProvider(provider, definition));
  }

  const failed = results.filter((item) => !item.ok);
  const output = {
    status: failed.length ? 'LIVE_SEARCH_FAILED' : 'LIVE_SEARCH_OK',
    baseline_source_count: baselineIds.length,
    catalog_source_count: catalog.sources.length,
    searchable_source_count: truth.searchable_source_count,
    searchable_baseline_source_count: truth.searchable_baseline_source_count,
    enabled_provider_count: providers.length,
    catalog_provider_truth: 'CONSISTENT',
    all_domain_coverage: coverage,
    providers: results,
    failed_provider_count: failed.length,
    failed_providers: failed
  };
  console.log(JSON.stringify(output, null, 2));
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'LIVE_SEARCH_FAILED', code: error.code || null, message: error.message }, null, 2));
  process.exit(1);
});
