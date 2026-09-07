'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createSearchDetailJsonProvider } = require('../src/evidence-search/providers/search-detail-json-provider');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3 } = require('../src/evidence-search/providers/public-specialist-provider-definitions-preverified-wave3');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

function definition(providerId) {
  const value = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_PREVERIFIED_WAVE3.find((provider) => provider.provider_id === providerId);
  assert.ok(value, providerId);
  return value;
}

test('preverified wave replaces four legacy routes without duplicate provider ids', () => {
  const { parsed } = readConfig(configFile);
  const ids = parsed.providers.map((provider) => provider.provider_id);
  assert.equal(ids.length, new Set(ids).size);
  for (const providerId of ['data-gov-datasets', 'open-library-search', 'met-museum-search', 'pubmed-search']) {
    assert.equal(ids.filter((id) => id === providerId).length, 1, providerId);
  }
  const dataGov = parsed.providers.find((provider) => provider.provider_id === 'data-gov-datasets');
  const openLibrary = parsed.providers.find((provider) => provider.provider_id === 'open-library-search');
  assert.equal(dataGov.endpoints[0].response_format, 'JSON');
  assert.match(dataGov.endpoints[0].url_template, /api\/3\/action\/package_search/);
  assert.equal(openLibrary.endpoints[0].response_format, 'JSON');
  assert.match(openLibrary.endpoints[0].url_template, /fields=key,title,author_name,first_publish_year/);
  const loadedIds = new Set(loadEvidenceProviders({ configFile }).map((provider) => provider.provider_id));
  for (const providerId of ['data-gov-datasets', 'open-library-search', 'met-museum-search', 'pubmed-search']) assert.ok(loadedIds.has(providerId), providerId);
});

test('Met adapter uses search only for discovery and emits fetched object details', async () => {
  const raw = definition('met-museum-search');
  const requested = [];
  const provider = createSearchDetailJsonProvider({
    ...raw,
    source_class: 'FREE_OFFICIAL_LIVE',
    transport: async (url) => {
      requested.push(url);
      if (url.includes('/search?')) return { url, status: 200, body: Buffer.from(JSON.stringify({ total: 1, objectIDs: [436535] })) };
      return { url, status: 200, body: Buffer.from(JSON.stringify({ objectID: 436535, objectURL: 'https://www.metmuseum.org/art/collection/search/436535', title: 'Wheat Field with Cypresses', artistDisplayName: 'Vincent van Gogh', objectName: 'Painting', objectDate: '1889', department: 'European Paintings', medium: 'Oil on canvas' })) };
    }
  });
  const result = await provider.search({ request_id: 'met-wave3', domain_lens: { id: 'G16' }, query_set: [{ query_id: 'q1', role: 'PRIMARY', text: 'van gogh' }] }, { deadline_at: Date.now() + 5000, signal: new AbortController().signal });
  assert.equal(requested.length, 2);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, '436535');
  assert.equal(result.candidates[0].title, 'Wheat Field with Cypresses');
  assert.equal(result.candidates[0].retrieval_trace.search_used_for_discovery_only, true);
  assert.match(result.candidates[0].retrieval_trace.detail_url, /objects\/436535/);
});

test('PubMed adapter follows ESearch UID into ESummary metadata before evidence emission', async () => {
  const raw = definition('pubmed-search');
  const requested = [];
  const provider = createSearchDetailJsonProvider({
    ...raw,
    source_class: 'FREE_OFFICIAL_LIVE',
    transport: async (url) => {
      requested.push(url);
      if (url.includes('/esearch.fcgi')) return { url, status: 200, body: Buffer.from(JSON.stringify({ esearchresult: { idlist: ['12345'] } })) };
      return { url, status: 200, body: Buffer.from(JSON.stringify({ result: { uids: ['12345'], '12345': { uid: '12345', title: 'Evidence-based medicine', source: 'Example Journal', pubdate: '2026', authors: [{ name: 'A Author' }], fulljournalname: 'Example Journal', sortfirstauthor: 'Author', articleids: [{ idtype: 'pubmed', value: '12345' }] } } })) };
    }
  });
  const result = await provider.search({ request_id: 'pubmed-wave3', domain_lens: { id: 'G23' }, query_set: [{ query_id: 'q1', role: 'PRIMARY', text: 'cancer' }] }, { deadline_at: Date.now() + 5000, signal: new AbortController().signal });
  assert.equal(requested.length, 2);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.equal(result.candidates[0].canonical_record_id, '12345');
  assert.equal(result.candidates[0].title, 'Evidence-based medicine');
  assert.match(result.candidates[0].retrieval_trace.detail_url, /esummary\.fcgi/);
});
