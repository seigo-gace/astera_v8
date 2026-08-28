'use strict';

const path = require('node:path');
const { loadEvidenceProviders } = require('../src/evidence-search/providers/config-loader');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');

const configFile = process.env.ASTERA_EVIDENCE_LIVE_CONFIG
  || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
const queryText = process.env.ASTERA_EVIDENCE_LIVE_QUERY || 'nodejs api server';

async function main() {
  const providers = loadEvidenceProviders({ configFile });
  if (providers.length < 2) throw new Error(`expected at least 2 public specialist providers, got ${providers.length}`);
  if (providers.some((provider) => provider.source_class !== 'FREE_PROJECTION')) {
    throw new Error('public specialist live providers must stay on the FREE_PROJECTION branch');
  }

  const registry = new ProviderRegistry(providers);
  const selected = registry.select({
    domain_lens: { id: 'G29' },
    source_policy: {
      provider_allowlist: [], provider_denylist: [],
      free_projection: true, free_current: false
    }
  }, 'INITIAL');
  if (selected.length !== providers.length) throw new Error('public specialist providers were not selected by free_projection');

  const summaries = [];
  for (const provider of selected) {
    const controller = new AbortController();
    const result = await provider.search({
      schema_version: 'astera.evidence-search.provider-plan.v1',
      phase: 'INITIAL',
      request_id: `live-${provider.provider_id}`,
      query_plan_hash: 'live-public-specialist-smoke',
      effective_as_of: new Date().toISOString(),
      domain_lens: { id: 'G29' },
      conditions: [],
      query_set: [{ query_id: 'live-q1', claim_id: 'live-claim', role: 'PRIMARY', text: queryText }],
      maximum_results: 10
    }, {
      signal: controller.signal,
      deadline_at: Date.now() + 12_000,
      tenant_id: 'live-smoke',
      request_id: `live-${provider.provider_id}`
    });
    const query = result.query_results?.[0];
    if (query?.retrieval_status !== 'FOUND') {
      throw new Error(`${provider.provider_id} live retrieval failed: ${query?.error_code || query?.retrieval_status || 'missing result'}`);
    }
    if (!Array.isArray(result.candidates) || result.candidates.length === 0) {
      throw new Error(`${provider.provider_id} returned no live candidates`);
    }
    const first = result.candidates[0];
    const locator = String(first.canonical_url || first.url || '');
    if (!/^https:\/\//.test(locator)) throw new Error(`${provider.provider_id} candidate has no HTTPS locator`);
    summaries.push({
      provider_id: provider.provider_id,
      source_class: provider.source_class,
      retrieval_status: query.retrieval_status,
      candidate_count: result.candidates.length,
      first_locator: locator
    });
  }

  console.log(JSON.stringify({ status: 'LIVE_SEARCH_OK', query: queryText, providers: summaries }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'LIVE_SEARCH_FAILED', code: error.code || null, message: error.message }, null, 2));
  process.exit(1);
});
