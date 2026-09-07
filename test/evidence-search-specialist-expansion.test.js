'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN } = require('../src/evidence-search/providers/public-specialist-provider-definitions-all-domain');
const { createFreeOfficialLiveProvider } = require('../src/evidence-search/providers/free-official-live-provider');
const { BLOCKED_PUBLIC_PROVIDER_IDS, REPLACED_SPECIALIST_PROVIDER_IDS, loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { REQUIRED_DOMAINS, loadEvidenceSourceCatalog, validateCatalogProviderCoverage } = require('../src/evidence-search/providers/source-catalog');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

test('world KB expansion binds verified structured providers without fixed source-count shortcuts', () => {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  assert.ok(catalog.sources.length >= 89);
  const searchable = catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE');
  assert.ok(searchable.length >= 75);
  assert.deepEqual(REQUIRED_DOMAINS.filter((domain) => !searchable.some((source) => source.domains.includes(domain))), []);

  const expected = new Map([
    ['WIKIDATA', 'wikidata-entity-search'],
    ['WIKIPEDIA', 'wikipedia-search'],
    ['MUSICBRAINZ', 'musicbrainz-artist-search'],
    ['ARTIC', 'artic-artworks-search'],
    ['ZENODO', 'zenodo-records-search'],
    ['INTERNET_ARCHIVE', 'internet-archive-search'],
    ['OPENFDA_DEVICE_RECALL', 'openfda-device-recall-search'],
    ['WHO_GHO', 'who-gho-indicator-search'],
    ['ROR', 'ror-organization-search'],
    ['UN_DIGITAL_LIBRARY', 'un-digital-library-search'],
    ['GO_PACKAGES', 'go-packages-search'],
    ['METACPAN', 'metacpan-search'],
    ['NOMINATIM', 'nominatim-search']
  ]);
  for (const [sourceId, providerId] of expected) {
    const source = catalog.sources.find((item) => item.source_id === sourceId);
    assert.ok(source, sourceId);
    assert.equal(source.runtime_state, 'SEARCHABLE', sourceId);
    assert.equal(source.provider_id, providerId, sourceId);
  }
  assert.equal(Object.keys(validateCatalogProviderCoverage(catalog, parsed.providers)).length, 38);
});

test('replacement providers are defined once and repeatedly blocked routes stay excluded', () => {
  const { parsed } = readConfig(configFile);
  const providerIds = parsed.providers.map((provider) => provider.provider_id);
  assert.equal(providerIds.length, new Set(providerIds).size);

  const loaded = loadEvidenceProviders({ configFile });
  const loadedIds = new Set(loaded.map((provider) => provider.provider_id));
  for (const providerId of BLOCKED_PUBLIC_PROVIDER_IDS) assert.equal(loadedIds.has(providerId), false, providerId);
  for (const providerId of REPLACED_SPECIALIST_PROVIDER_IDS) assert.equal(loadedIds.has(providerId), true, providerId);

  const structuredReplacementIds = ['un-digital-library-search', 'go-packages-search', 'nominatim-search', 'metacpan-search', 'who-gho-indicator-search', 'ror-organization-search', 'zenodo-records-search'];
  for (const providerId of structuredReplacementIds) {
    const definition = parsed.providers.find((provider) => provider.provider_id === providerId);
    assert.ok(definition, providerId);
    assert.ok(definition.endpoints.every((endpoint) => endpoint.response_format === 'JSON'), providerId);
    assert.ok(String(definition.smoke_query || '').trim(), providerId);
  }
});

test('every declared specialist subarea and code language/ecosystem still requires at least two independent searchable bindings', () => {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  const policy = catalog.specialist_coverage;
  const byId = new Map(catalog.sources.map((source) => [source.source_id, source]));
  for (const [domain, subareas] of Object.entries(policy.required_subareas)) {
    for (const [subarea, sourceIds] of Object.entries(subareas)) {
      assert.ok(sourceIds.length >= 2, `${domain}/${subarea}`);
      const providers = new Set();
      for (const sourceId of sourceIds) {
        const source = byId.get(sourceId);
        assert.ok(source, sourceId);
        assert.equal(source.runtime_state, 'SEARCHABLE', `${domain}/${subarea}:${sourceId}`);
        assert.ok(source.domains.includes(domain), `${domain}/${subarea}:${sourceId}`);
        providers.add(source.provider_id);
      }
      assert.ok(providers.size >= 2, `${domain}/${subarea} provider diversity`);
    }
  }

  for (const language of policy.required_code_languages) {
    const sourceIds = policy.code_languages[language];
    assert.ok(sourceIds.length >= 2, language);
    const providers = new Set();
    for (const sourceId of sourceIds) {
      const source = byId.get(sourceId);
      assert.ok(source, sourceId);
      assert.equal(source.runtime_state, 'SEARCHABLE', `${language}:${sourceId}`);
      assert.ok(source.domains.includes('G29'), `${language}:${sourceId}`);
      providers.add(source.provider_id);
    }
    assert.ok(providers.size >= 2, `${language} provider diversity`);
  }
});

test('generic live provider expands object-valued record maps without weakening fixed endpoint mapping', async () => {
  const definition = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN.find((provider) => provider.provider_id === 'world-bank-documents');
  assert.ok(definition);
  const requested = [];
  const provider = createFreeOfficialLiveProvider({
    ...definition,
    source_class: 'FREE_OFFICIAL_LIVE',
    transport: async (url) => {
      requested.push(url);
      return {
        url,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({
          documents: {
            '1001': { id:'1001', display_title:'Climate development report', abstracts:'Current public World Bank document.', docdt:'2026-01-01', url:'https://documents.worldbank.org/example/1001', count:'World', docty:'Report' },
            '1002': { id:'1002', display_title:'Climate policy note', abstracts:'Second current public World Bank document.', docdt:'2026-01-02', url:'https://documents.worldbank.org/example/1002', count:'World', docty:'Policy Note' }
          }
        }))
      };
    }
  });
  const result = await provider.search({
    request_id:'specialist-expansion-object-map',
    effective_as_of:'2026-08-28T00:00:00.000Z',
    domain_lens:{ id:'G09' },
    query_set:[{ query_id:'q1', role:'PRIMARY', class:'PRIMARY', text:'climate' }]
  }, { deadline_at:Date.now()+5000, signal:new AbortController().signal });
  assert.equal(requested.length,1);
  assert.match(requested[0],/qterm=climate/);
  assert.equal(result.query_results[0].retrieval_status,'FOUND');
  assert.deepEqual(result.candidates.map((item)=>item.canonical_record_id),['1001','1002']);
});
