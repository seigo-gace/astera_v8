'use strict';

const { createGeneralWebSearchProvider } = require('../src/evidence-search/providers/general-web-search-provider');
const { normalizeProviderResult } = require('../src/evidence-search/evidence/normalizer');

(async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const provider = createGeneralWebSearchProvider({ resultLimit: 4 });
    const raw = await provider.search({
      query_set: [{ query_id: 'live_general_1', text: 'Node.js official documentation event loop' }],
      maximum_results: 8,
      domain_lens: { id: 'G29', taxonomy_version: '1.0.0' }
    }, { signal: controller.signal });
    const normalized = normalizeProviderResult(raw, provider);
    const candidates = normalized.candidates;
    if (!candidates.length) throw new Error('FREE_GENERAL_WEB live smoke returned no destination-page candidates');
    if (!candidates.some((candidate) => candidate.excerpt && candidate.canonical_locator?.url)) {
      throw new Error('FREE_GENERAL_WEB live smoke did not retrieve actual destination-page content');
    }
    if (candidates.some((candidate) => /duckduckgo\.com/i.test(candidate.canonical_locator?.url || ''))) {
      throw new Error('search-engine result page leaked into evidence candidates');
    }
    if (candidates.some((candidate) => candidate.source_role !== 'SECONDARY')) {
      throw new Error('general web candidates must remain SECONDARY until authority is proven elsewhere');
    }
    console.log(JSON.stringify({
      status: 'FREE_GENERAL_WEB_LIVE_SEARCH_OK',
      provider_id: provider.provider_id,
      candidate_count: candidates.length,
      sample_urls: candidates.slice(0, 3).map((candidate) => candidate.canonical_locator.url),
      search_result_used_as_evidence: false
    }, null, 2));
  } finally {
    clearTimeout(timer);
  }
})().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
