'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN } = require('../src/evidence-search/providers/public-specialist-provider-definitions-all-domain');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION } = require('../src/evidence-search/providers/public-specialist-provider-definitions-specialist-expansion');
const { createFreeOfficialLiveProvider } = require('../src/evidence-search/providers/free-official-live-provider');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { REQUIRED_DOMAINS, loadEvidenceSourceCatalog, validateCatalogProviderCoverage } = require('../src/evidence-search/providers/source-catalog');

const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

test('specialist expansion exposes 76 catalog sources, 64 searchable sources, and explicit G01-G38 specialist coverage', () => {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  assert.equal(catalog.sources.length, 76);
  assert.equal(catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE').length, 64);
  const searchable = catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE');
  const uncovered = REQUIRED_DOMAINS.filter((domain) => !searchable.some((source) => source.domains.includes(domain)));
  assert.deepEqual(uncovered, []);

  const specialistCoverage = catalog.specialist_coverage;
  assert.ok(specialistCoverage);
  assert.equal(specialistCoverage.minimum_per_domain, 2);
  assert.deepEqual(Object.keys(specialistCoverage.domains).sort(), [...REQUIRED_DOMAINS].sort());
  for (const domain of REQUIRED_DOMAINS) {
    assert.ok(Array.isArray(specialistCoverage.domains[domain]) && specialistCoverage.domains[domain].length >= 2, `${domain} must explicitly name at least two specialist sources`);
  }

  const expectedNew = new Map([
    ['SEP', 'sep-search'], ['LOC_NEWSPAPERS', 'loc-newspapers-search'], ['NOMINATIM', 'nominatim-search'], ['RELIEFWEB', 'reliefweb-search'],
    ['WIKTIONARY', 'wiktionary-search'], ['MET_MUSEUM', 'met-museum-search'], ['THESPORTSDB', 'sportsdb-search'], ['WIKIVOYAGE', 'wikivoyage-search'],
    ['STEAM_STORE', 'steam-store-search'], ['ZBMATH', 'zbmath-search'], ['NASA_NTRS', 'nasa-ntrs-search'], ['NIST_WEBBOOK', 'nist-webbook-search'],
    ['CPSC_RECALLS', 'cpsc-recalls-search'], ['OPENFDA_DEVICE', 'openfda-device-search'], ['IANA_SEARCH', 'iana-search'], ['UN_DIGITAL_LIBRARY', 'un-digital-library-search'],
    ['SBA_SEARCH', 'sba-search'], ['IRS_SEARCH', 'irs-search'], ['NAIC_SEARCH', 'naic-search'], ['GOOGLE_PATENTS', 'google-patents-search'],
    ['PYPI', 'pypi-search'], ['GO_PACKAGES', 'go-packages-search'], ['DART_PUB', 'dart-pub-search'], ['SWIFT_PACKAGE_INDEX', 'swift-package-index-search'],
    ['CONAN_CENTER', 'conan-center-search'], ['HEX_PACKAGES', 'hex-packages-search'], ['METACPAN', 'metacpan-search'], ['MAVEN_KOTLIN', 'maven-kotlin-search']
  ]);
  for (const [sourceId, providerId] of expectedNew) {
    const source = catalog.sources.find((item) => item.source_id === sourceId);
    assert.ok(source, sourceId);
    assert.equal(source.runtime_state, 'SEARCHABLE', sourceId);
    assert.equal(source.provider_id, providerId, sourceId);
  }

  const validated = validateCatalogProviderCoverage(catalog, parsed.providers);
  assert.equal(Object.keys(validated).length, 38);
});

test('specialist depth definitions add 28 live providers and loader resolves 64 providers', () => {
  assert.equal(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN.length, 11);
  assert.equal(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION.length, 28);
  const newProviderIds = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION.map((provider) => provider.provider_id);
  assert.equal(new Set(newProviderIds).size, 28);
  for (const definition of PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION) {
    assert.equal(definition.enabled, true, definition.provider_id);
    assert.equal(definition.certified, true, definition.provider_id);
    assert.ok(Array.isArray(definition.catalog_source_ids) && definition.catalog_source_ids.length === 1, definition.provider_id);
    assert.ok(Array.isArray(definition.allowed_hosts) && definition.allowed_hosts.length > 0, definition.provider_id);
    assert.ok(Array.isArray(definition.endpoints) && definition.endpoints.length > 0, definition.provider_id);
    assert.ok(String(definition.smoke_query || '').trim(), definition.provider_id);
  }
  const loaded = loadEvidenceProviders({ configFile });
  assert.equal(loaded.length, 64);
  const loadedIds = new Set(loaded.map((provider) => provider.provider_id));
  for (const providerId of newProviderIds) assert.ok(loadedIds.has(providerId), providerId);
});

test('G29 code search coverage is split by programming language and ecosystem', () => {
  const { absolute, parsed } = readConfig(configFile);
  const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  const policy = catalog.specialist_coverage;
  const expectedLanguages = ['javascript_typescript', 'python', 'go', 'java', 'kotlin', 'csharp_dotnet', 'rust', 'php', 'ruby', 'dart_flutter', 'swift', 'c_cpp', 'elixir_erlang', 'perl'];
  assert.deepEqual(policy.required_code_languages, expectedLanguages);
  const catalogById = new Map(catalog.sources.map((source) => [source.source_id, source]));
  for (const language of expectedLanguages) {
    const sourceIds = policy.code_languages[language];
    assert.ok(Array.isArray(sourceIds) && sourceIds.length > 0, language);
    for (const sourceId of sourceIds) {
      const source = catalogById.get(sourceId);
      assert.ok(source, `${language}:${sourceId}`);
      assert.equal(source.runtime_state, 'SEARCHABLE', `${language}:${sourceId}`);
      assert.ok(source.domains.includes('G29'), `${language}:${sourceId}`);
    }
  }
  assert.deepEqual(Object.keys(policy.required_subareas.G17).sort(), ['games', 'sports', 'tourism']);
  assert.deepEqual(Object.keys(policy.required_subareas.G23).sort(), ['biomedical_literature', 'clinical_trials', 'device_recalls', 'drug_concepts', 'drug_labels', 'medical_subjects']);
  assert.ok(policy.required_subareas.G32.patents.includes('GOOGLE_PATENTS'));
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
      return { url, status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ documents: {
        '1001': { id: '1001', display_title: 'Climate development report', abstracts: 'Current public World Bank document.', docdt: '2026-01-01', url: 'https://documents.worldbank.org/example/1001', count: 'World', docty: 'Report' },
        '1002': { id: '1002', display_title: 'Climate policy note', abstracts: 'Second current public World Bank document.', docdt: '2026-01-02', url: 'https://documents.worldbank.org/example/1002', count: 'World', docty: 'Policy Note' }
      } })) };
    }
  });
  const result = await provider.search({ request_id: 'specialist-expansion-object-map', effective_as_of: '2026-08-28T00:00:00.000Z', domain_lens: { id: 'G09' }, query_set: [{ query_id: 'q1', role: 'PRIMARY', class: 'PRIMARY', text: 'climate' }] }, { deadline_at: Date.now() + 5000, signal: new AbortController().signal });
  assert.equal(requested.length, 1);
  assert.match(requested[0], /qterm=climate/);
  assert.equal(result.query_results[0].retrieval_status, 'FOUND');
  assert.deepEqual(result.candidates.map((item) => item.canonical_record_id), ['1001', '1002']);
  assert.deepEqual(result.candidates.map((item) => item.title), ['Climate development report', 'Climate policy note']);
});