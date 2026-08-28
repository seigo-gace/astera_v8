'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN
} = require('../src/evidence-search/providers/public-specialist-provider-definitions-all-domain');
const {
  createFreeOfficialLiveProvider
} = require('../src/evidence-search/providers/free-official-live-provider');
const {
  loadEvidenceProviders,
  readConfig
} = require('../src/evidence-search/providers/config-loader');
const {
  REQUIRED_DOMAINS,
  loadEvidenceSourceCatalog
} = require('../src/evidence-search/providers/source-catalog');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

test('second specialist expansion exposes 48 catalog sources, 36 searchable sources, and all G01-G38 domains', () => {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  assert.equal(catalog.sources.length, 48);
  assert.equal(catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE').length, 36);

  const searchable = catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE');
  const uncovered = REQUIRED_DOMAINS.filter(
    (domain) => !searchable.some((source) => source.domains.includes(domain))
  );
  assert.deepEqual(uncovered, []);

  const expected = new Map([
    ['MESH', 'mesh-descriptor-search'],
    ['GEMET', 'gemet-search'],
    ['WORLD_BANK_DOCS', 'world-bank-documents'],
    ['TERRAFORM_REGISTRY', 'terraform-registry-search'],
    ['NUGET', 'nuget-search'],
    ['CRATES_IO', 'crates-io-search'],
    ['RXNORM', 'rxnorm-search'],
    ['DAILYMED', 'dailymed-search'],
    ['OEIS', 'oeis-search'],
    ['WORMS', 'worms-search'],
    ['FEDERAL_REGISTER', 'federal-register-search']
  ]);
  for (const [sourceId, providerId] of expected) {
    const source = catalog.sources.find((item) => item.source_id === sourceId);
    assert.ok(source, sourceId);
    assert.equal(source.runtime_state, 'SEARCHABLE', sourceId);
    assert.equal(source.provider_id, providerId, sourceId);
  }
});

test('all-domain specialist definitions add exactly 11 enabled providers and loader resolves 36 providers', () => {
  assert.equal(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN.length, 11);
  const providerIds = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN.map((provider) => provider.provider_id);
  assert.equal(new Set(providerIds).size, 11);
  for (const definition of PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN) {
    assert.equal(definition.enabled, true, definition.provider_id);
    assert.equal(definition.certified, true, definition.provider_id);
    assert.ok(Array.isArray(definition.catalog_source_ids) && definition.catalog_source_ids.length > 0, definition.provider_id);
    assert.ok(Array.isArray(definition.allowed_hosts) && definition.allowed_hosts.length > 0, definition.provider_id);
    assert.ok(Array.isArray(definition.endpoints) && definition.endpoints.length > 0, definition.provider_id);
    assert.ok(String(definition.smoke_query || '').trim(), definition.provider_id);
  }

  const loaded = loadEvidenceProviders({ configFile });
  assert.equal(loaded.length, 36);
  const loadedIds = new Set(loaded.map((provider) => provider.provider_id));
  for (const providerId of providerIds) assert.ok(loadedIds.has(providerId), providerId);
});

test('generic live provider expands object-valued record maps without weakening fixed endpoint mapping', async () => {
  const definition = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN.find(
    (provider) => provider.provider_id === 'world-bank-documents'
  );
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
            '1001': {
              id: '1001',
              display_title: 'Climate development report',
              abstracts: 'Current public World Bank document.',
              docdt: '2026-01-01',
              url: 'https://documents.worldbank.org/example/1001',
              count: 'World',
              docty: 'Report'
            },
            '1002': {
              id: '1002',
              display_title: 'Climate policy note',
              abstracts: 'Second current public World Bank document.',
              docdt: '2026-01-02',
              url: 'https://documents.worldbank.org/example/1002',
              count: 'World',
              docty: 'Policy Note'
            }
          }
        }))
      };
    }
  });

  const result = await provider.search({
    request_id: 'specialist-expansion-object-map',
    effective_as_of: '2026-08-28T00:00:00.000Z',
    domain_lens: { id: 'G09' },
    query_set: [{ query_id: 'q1', role: 'PRIMARY', class: 'PRIMARY', text: 'climate' }]
  }, {
    deadline_at: Date.now() + 5000,
    signal: new AbortController().signal
  });

  assert.equal(requested.length, 1);
  assert.match(requested[0], /qterm=climate/);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.deepEqual(result.candidates.map((item) => item.canonical_record_id), ['1001', '1002']);
  assert.deepEqual(result.candidates.map((item) => item.title), ['Climate development report', 'Climate policy note']);
});
