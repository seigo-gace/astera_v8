'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileQueryPlan } = require('../src/evidence-search/core/query-plan-compiler');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');
const { normalizeProviderResult } = require('../src/evidence-search/evidence/normalizer');
const {
  createGeneralWebSearchProvider,
  normalizeResultUrl,
  parseDuckDuckGoResults
} = require('../src/evidence-search/providers/general-web-search-provider');

test('DuckDuckGo non-JS result links are decoded into destination URLs', () => {
  const target = 'https://example.org/reference?q=alpha';
  const href = `//duckduckgo.com/l/?uddg=${encodeURIComponent(target)}&rut=deadbeef`;
  assert.equal(normalizeResultUrl(href), target);
  const html = `<a class="result__a" href="${href}">Example Reference</a>`;
  const records = parseDuckDuckGoResults(html, 'DUCKDUCKGO_HTML');
  assert.equal(records.length, 1);
  assert.equal(records[0].url, target);
  assert.equal(records[0].title, 'Example Reference');
});

test('free general web search fetches the destination page and never uses the search result page as evidence', async () => {
  const destination = 'https://example.org/reference';
  const searchHtml = `<html><body>
    <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(destination)}">Search Result Title</a>
    <div class="result__snippet">SEARCH_ENGINE_SNIPPET_ONLY</div>
  </body></html>`;
  const provider = createGeneralWebSearchProvider({
    resultLimit: 2,
    searchGet: async () => ({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(searchHtml) }),
    pageGet: async (url) => ({
      url,
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: Buffer.from('<html><head><title>Actual Source Page</title></head><body>This is the actual source page content retrieved from the destination URL. It is long enough to qualify as evidence material and is not a search-engine snippet.</body></html>')
    })
  });
  const raw = await provider.search({
    query_set: [{ query_id: 'q1', text: 'example reference' }],
    maximum_results: 8,
    domain_lens: null
  }, {});
  assert.equal(raw.query_results[0].retrieval_status, 'FOUND');
  assert.equal(raw.candidates.length, 1);
  assert.equal(raw.candidates[0].canonical_url, destination);
  assert.equal(raw.candidates[0].source_role, 'SECONDARY');
  assert.equal(raw.candidates[0].retrieval_trace.fetched_actual_page, true);
  assert.equal(raw.candidates[0].retrieval_trace.search_result_used_as_evidence, false);
  assert.match(raw.candidates[0].excerpt, /actual source page content/i);
  assert.doesNotMatch(raw.candidates[0].excerpt, /SEARCH_ENGINE_SNIPPET_ONLY/);

  const normalized = normalizeProviderResult(raw, provider);
  assert.equal(normalized.candidates[0].source_class, 'FREE_GENERAL_WEB');
  assert.equal(normalized.candidates[0].canonical_locator.url, destination);
});

test('free general web provider is selected by default even when no domain lens or KB routing term exists', () => {
  const provider = createGeneralWebSearchProvider({
    searchGet: async () => ({ status: 200, headers: {}, body: Buffer.from('') }),
    pageGet: async () => null
  });
  const registry = new ProviderRegistry([provider]);
  const plan = compileQueryPlan({ question: '通常検索で無料の候補を探す' });
  assert.equal(plan.source_policy.free_general_web, true);
  const selected = registry.select(plan, 'INITIAL');
  assert.deepEqual(selected.map((item) => item.provider_id), ['free-general-web-search']);
});
