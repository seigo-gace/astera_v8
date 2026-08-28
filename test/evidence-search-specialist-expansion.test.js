'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN } = require('../src/evidence-search/providers/public-specialist-provider-definitions-all-domain');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION } = require('../src/evidence-search/providers/public-specialist-provider-definitions-specialist-expansion');
const { PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_WORLD_KB } = require('../src/evidence-search/providers/public-specialist-provider-definitions-world-kb');
const { createFreeOfficialLiveProvider } = require('../src/evidence-search/providers/free-official-live-provider');
const { BLOCKED_PUBLIC_PROVIDER_IDS, loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { REQUIRED_DOMAINS, loadEvidenceSourceCatalog, validateCatalogProviderCoverage } = require('../src/evidence-search/providers/source-catalog');
const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');

test('world KB expansion exposes 87 catalog sources, 73 searchable sources, and explicit G01-G38 coverage', () => {
  const { absolute, parsed } = readConfig(configFile); const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  assert.equal(catalog.sources.length, 87); assert.equal(catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE').length, 73);
  const searchable = catalog.sources.filter((source) => source.runtime_state === 'SEARCHABLE');
  assert.deepEqual(REQUIRED_DOMAINS.filter((domain) => !searchable.some((source) => source.domains.includes(domain))), []);
  const policy = catalog.specialist_coverage; assert.ok(policy); assert.equal(policy.minimum_per_domain, 2); assert.equal(policy.minimum_per_subarea, 2); assert.equal(policy.minimum_per_code_language, 2); assert.equal(policy.minimum_per_jurisdictional_subarea, 2);
  assert.deepEqual(Object.keys(policy.domains).sort(), [...REQUIRED_DOMAINS].sort());
  for (const domain of REQUIRED_DOMAINS) { assert.ok(policy.domains[domain].length >= 2, domain); assert.ok(policy.required_subareas[domain] && Object.keys(policy.required_subareas[domain]).length > 0, `${domain} subareas`); }
  for (const sourceId of ['CPSC_RECALLS', 'SWIFT_PACKAGE_INDEX']) { const source = catalog.sources.find((item) => item.source_id === sourceId); assert.equal(source.runtime_state, 'BLOCKED_ROUTE'); assert.equal(source.provider_id, null); }
  const worldExpected = new Map([['WIKIDATA','wikidata-entity-search'],['WIKIPEDIA','wikipedia-search'],['FAOLEX','faolex-search'],['ECOLEX','ecolex-search'],['MUSICBRAINZ','musicbrainz-artist-search'],['ARTIC','artic-artworks-search'],['ZENODO','zenodo-records-search'],['INTERNET_ARCHIVE','internet-archive-search'],['SWIFT_PACKAGE_REGISTRY','swift-package-registry-search'],['OPENFDA_DEVICE_RECALL','openfda-device-recall-search'],['PUBMED','pubmed-search']]);
  for (const [sourceId, providerId] of worldExpected) { const source = catalog.sources.find((item) => item.source_id === sourceId); assert.ok(source, sourceId); assert.equal(source.runtime_state, 'SEARCHABLE', sourceId); assert.equal(source.provider_id, providerId, sourceId); }
  assert.equal(Object.keys(validateCatalogProviderCoverage(catalog, parsed.providers)).length, 38);
});

test('loader resolves 73 live providers and excludes repeatedly blocked routes', () => {
  assert.equal(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN.length, 11); assert.equal(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_SPECIALIST_EXPANSION.length, 28); assert.equal(PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_WORLD_KB.length, 11);
  const loaded = loadEvidenceProviders({ configFile }); assert.equal(loaded.length, 73); const loadedIds = new Set(loaded.map((provider) => provider.provider_id));
  for (const providerId of BLOCKED_PUBLIC_PROVIDER_IDS) assert.equal(loadedIds.has(providerId), false, providerId);
  for (const definition of PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_WORLD_KB) { assert.ok(loadedIds.has(definition.provider_id), definition.provider_id); assert.equal(definition.enabled, true); assert.equal(definition.certified, true); assert.ok(definition.catalog_source_ids.length === 1); assert.ok(definition.allowed_hosts.length > 0); assert.ok(definition.endpoints.length > 0); assert.ok(String(definition.smoke_query || '').trim()); }
});

test('every specialist subarea and code language/ecosystem has at least two independent searchable KBs', () => {
  const { absolute, parsed } = readConfig(configFile); const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog); const policy = catalog.specialist_coverage; const byId = new Map(catalog.sources.map((source) => [source.source_id, source]));
  for (const [domain, subareas] of Object.entries(policy.required_subareas)) for (const [subarea, sourceIds] of Object.entries(subareas)) { assert.ok(sourceIds.length >= 2, `${domain}/${subarea}`); const providers = new Set(); for (const sourceId of sourceIds) { const source = byId.get(sourceId); assert.ok(source); assert.equal(source.runtime_state, 'SEARCHABLE'); assert.ok(source.domains.includes(domain), `${domain}/${subarea}:${sourceId}`); providers.add(source.provider_id); } assert.ok(providers.size >= 2, `${domain}/${subarea} provider diversity`); }
  const expected = ['javascript_typescript','nodejs','python','go','java','kotlin','csharp_dotnet','rust','php','ruby','dart_flutter','swift','c_cpp','elixir_erlang','perl']; assert.deepEqual(policy.required_code_languages, expected);
  for (const language of expected) { const sourceIds = policy.code_languages[language]; assert.ok(sourceIds.length >= 2, language); const providers = new Set(); for (const sourceId of sourceIds) { const source = byId.get(sourceId); assert.ok(source); assert.equal(source.runtime_state, 'SEARCHABLE'); assert.ok(source.domains.includes('G29'), `${language}:${sourceId}`); providers.add(source.provider_id); } assert.ok(providers.size >= 2, `${language} provider diversity`); }
});

test('jurisdiction-sensitive world KB lanes require two country-filterable cross-country KBs', () => {
  const { absolute, parsed } = readConfig(configFile); const catalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog); const policy = catalog.specialist_coverage; const byId = new Map(catalog.sources.map((source) => [source.source_id, source]));
  for (const [domain, subareas] of Object.entries(policy.jurisdictional_subareas)) for (const [subarea, sourceIds] of Object.entries(subareas)) { assert.ok(sourceIds.length >= 2); const providers = new Set(); for (const sourceId of sourceIds) { const source = byId.get(sourceId); assert.equal(source.runtime_state, 'SEARCHABLE'); assert.equal(source.supports_jurisdiction_filter, true); assert.equal(source.jurisdiction_scope, 'GLOBAL_CROSS_COUNTRY'); providers.add(source.provider_id); } assert.ok(providers.size >= 2, `${domain}/${subarea}`); }
});

test('generic live provider expands object-valued record maps without weakening fixed endpoint mapping', async () => {
  const definition = PUBLIC_SPECIALIST_PROVIDER_DEFINITIONS_ALL_DOMAIN.find((provider) => provider.provider_id === 'world-bank-documents'); assert.ok(definition); const requested = [];
  const provider = createFreeOfficialLiveProvider({ ...definition, source_class: 'FREE_OFFICIAL_LIVE', transport: async (url) => { requested.push(url); return { url, status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ documents: { '1001': { id:'1001', display_title:'Climate development report', abstracts:'Current public World Bank document.', docdt:'2026-01-01', url:'https://documents.worldbank.org/example/1001', count:'World', docty:'Report' }, '1002': { id:'1002', display_title:'Climate policy note', abstracts:'Second current public World Bank document.', docdt:'2026-01-02', url:'https://documents.worldbank.org/example/1002', count:'World', docty:'Policy Note' } } })) }; } });
  const result = await provider.search({ request_id:'specialist-expansion-object-map', effective_as_of:'2026-08-28T00:00:00.000Z', domain_lens:{ id:'G09' }, query_set:[{ query_id:'q1', role:'PRIMARY', class:'PRIMARY', text:'climate' }] }, { deadline_at:Date.now()+5000, signal:new AbortController().signal });
  assert.equal(requested.length,1); assert.match(requested[0],/qterm=climate/); assert.equal(result.query_results[0].retrieval_status,'FOUND'); assert.deepEqual(result.candidates.map((item)=>item.canonical_record_id),['1001','1002']); assert.deepEqual(result.candidates.map((item)=>item.title),['Climate development report','Climate policy note']);
});
