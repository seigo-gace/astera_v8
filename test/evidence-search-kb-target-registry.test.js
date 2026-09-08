'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');
const { ProviderRegistry } = require('../src/evidence-search/providers/provider-registry');
const {
  BINDING_MODE,
  attachKbTargets,
  attachKbTargetsToProviders,
  targetMatchesCatalogSource
} = require('../src/evidence-search/providers/kb-target-aware-provider');

function byUrl(registry, url) {
  return registry.targets.find((target) => target.official_url === url);
}

function syntheticTarget(targetId, kb, officialUrl, genres = ['G01']) {
  return Object.freeze({
    target_id: targetId,
    kb,
    official_url: officialUrl,
    host: new URL(officialUrl).hostname.toLowerCase(),
    genres: Object.freeze([...genres]),
    recorded_accesses: Object.freeze(['FREE_NO_AUTH']),
    recorded_statuses: Object.freeze(['PASS']),
    target_state: 'PUBLIC_NO_AUTH',
    automatic_search_eligible: true
  });
}

function syntheticProvider(providerId, domains = ['G01']) {
  return {
    provider_id: providerId,
    source_class: 'FREE_OFFICIAL_LIVE',
    certified: true,
    domains,
    routing_terms: [],
    search: async () => ({
      schema_version: 'astera.evidence-search.provider-result.v1',
      provider_id: providerId,
      candidates: [],
      query_results: []
    })
  };
}

test('recorded KB target registry loads the deduplicated 714-row source as 663 runtime targets', () => {
  const registry = KbTargetRegistry.load();
  assert.equal(registry.source_record_count, 714);
  assert.equal(registry.target_count, 663);
  assert.equal(new Set(registry.targets.map((target) => target.official_url.toLowerCase())).size, 663);

  const blocked = byUrl(registry, 'https://central.sonatype.org/search/rest-api-guide/');
  assert.ok(blocked);
  assert.equal(blocked.target_state, 'BLOCKED');
  assert.equal(blocked.automatic_search_eligible, false);

  const authenticated = byUrl(registry, 'https://icd.who.int/icdapi');
  assert.ok(authenticated);
  assert.equal(authenticated.target_state, 'AUTH_REQUIRED');
  assert.equal(authenticated.automatic_search_eligible, false);
});

test('query and genre select matching free no-auth KB targets', () => {
  const registry = KbTargetRegistry.load();
  const selected = registry.select({
    domain_lens: { id: 'G31' },
    primary_query_set: [{ text: 'MITRE ATT&CK threat technique' }],
    reinforcement_query_set: []
  }, { limit: 32 });
  assert.ok(selected.some((target) => target.kb === 'MITRE ATT&CK TAXII/STIX'));
  assert.ok(selected.every((target) => target.automatic_search_eligible === true));
});

test('KB target binding gates provider selection and the bound target reaches the real provider call', async () => {
  const registry = KbTargetRegistry.load();
  let receivedPlan = null;
  const baseProvider = {
    provider_id: 'capture-provider',
    source_class: 'FREE_OFFICIAL_LIVE',
    certified: true,
    domains: ['G31'],
    routing_terms: ['mitre', 'attack'],
    search: async (plan) => {
      receivedPlan = plan;
      return {
        schema_version: 'astera.evidence-search.provider-result.v1',
        provider_id: 'capture-provider',
        candidates: [],
        query_results: []
      };
    }
  };
  const provider = attachKbTargets(baseProvider, registry, {
    requireBinding: true,
    limit: 16,
    catalogSources: [{
      source_id: 'MITRE_ATTACK',
      name: 'MITRE ATT&CK',
      official_url: 'https://attack.mitre.org/resources/attack-data-and-tools/'
    }]
  });
  const unboundProvider = attachKbTargets({
    ...baseProvider,
    provider_id: 'unbound-provider',
    search: async () => ({ candidates: [], query_results: [] })
  }, registry, {
    requireBinding: true,
    limit: 16,
    catalogSources: [{
      source_id: 'NO_MATCH',
      name: 'No matching runtime KB',
      official_url: 'https://no-match.invalid/'
    }]
  });

  const providerRegistry = new ProviderRegistry([provider, unboundProvider]);
  const canonicalPlan = {
    question: 'MITRE ATT&CK threat technique',
    domain_lens: { id: 'G31' },
    source_policy: {
      provider_allowlist: [],
      provider_denylist: [],
      free_projection: true,
      free_current: true
    },
    primary_query_set: [{ query_id: 'q1', text: 'MITRE ATT&CK threat technique' }],
    reinforcement_query_set: []
  };
  const selected = providerRegistry.select(canonicalPlan, 'INITIAL');
  assert.deepEqual(selected.map((item) => item.provider_id), ['capture-provider']);

  const result = await selected[0].search({
    schema_version: 'astera.evidence-search.provider-plan.v1',
    phase: 'INITIAL',
    request_id: 'kb-target-test',
    query_plan_hash: '0'.repeat(64),
    effective_as_of: '2026-09-08T00:00:00.000Z',
    domain_lens: { id: 'G31' },
    conditions: [],
    query_set: [{ query_id: 'q1', text: 'MITRE ATT&CK threat technique' }],
    maximum_results: 10
  }, {});

  assert.ok(receivedPlan);
  assert.ok(Array.isArray(receivedPlan.search_targets));
  assert.equal(receivedPlan.search_targets.length, 1);
  assert.equal(receivedPlan.search_targets[0].kb, 'MITRE ATT&CK TAXII/STIX');
  assert.equal(result.search_targets[0].official_url, 'https://attack.mitre.org/resources/attack-data-and-tools/');
  assert.deepEqual(result.candidates, []);
});

test('canonical-name binding requires the same authority host and unique provider ownership', () => {
  const registry = new KbTargetRegistry([
    syntheticTarget('target-loc', 'Library of Congress API', 'https://www.loc.gov/apis/json-and-yaml/', ['G15']),
    syntheticTarget('target-gbif', 'GBIF Occurrence API', 'https://techdocs.gbif.org/en/openapi/', ['G22']),
    syntheticTarget('target-alpha', 'Alpha API Search', 'https://example.org/search', ['G01'])
  ], { source_record_count: 3 });

  assert.equal(targetMatchesCatalogSource(
    registry.targets[0],
    { name: 'Library of Congress JSON/YAML Search', official_url: 'https://www.loc.gov/apis/' }
  ), true);
  assert.equal(targetMatchesCatalogSource(
    registry.targets[1],
    { name: 'GBIF Species API', official_url: 'https://techdocs.gbif.org/en/openapi/species' }
  ), false);

  const providers = attachKbTargetsToProviders([
    syntheticProvider('loc-provider', ['G15']),
    syntheticProvider('gbif-provider', ['G22']),
    syntheticProvider('alpha-provider-a'),
    syntheticProvider('alpha-provider-b')
  ], registry, {
    requireBinding: true,
    providerDefinitions: [
      { provider_id: 'loc-provider', enabled: true, catalog_source_ids: ['LOC'] },
      { provider_id: 'gbif-provider', enabled: true, catalog_source_ids: ['GBIF'] },
      { provider_id: 'alpha-provider-a', enabled: true, catalog_source_ids: ['ALPHA_A'] },
      { provider_id: 'alpha-provider-b', enabled: true, catalog_source_ids: ['ALPHA_B'] }
    ],
    sourceCatalog: {
      sources: [
        { source_id: 'LOC', name: 'Library of Congress JSON/YAML Search', official_url: 'https://www.loc.gov/apis/', runtime_state: 'SEARCHABLE', provider_id: 'loc-provider' },
        { source_id: 'GBIF', name: 'GBIF Species API', official_url: 'https://techdocs.gbif.org/en/openapi/species', runtime_state: 'SEARCHABLE', provider_id: 'gbif-provider' },
        { source_id: 'ALPHA_A', name: 'Alpha REST API', official_url: 'https://example.org/api/a', runtime_state: 'SEARCHABLE', provider_id: 'alpha-provider-a' },
        { source_id: 'ALPHA_B', name: 'Alpha REST API', official_url: 'https://example.org/api/b', runtime_state: 'SEARCHABLE', provider_id: 'alpha-provider-b' }
      ]
    }
  });

  const byId = new Map(providers.map((provider) => [provider.provider_id, provider]));
  assert.equal(byId.get('loc-provider').kb_target_binding.mode, BINDING_MODE);
  assert.deepEqual(byId.get('loc-provider').kb_target_binding.target_ids, ['target-loc']);
  assert.equal(byId.get('gbif-provider').kb_target_binding.automatic_target_count, 0);
  assert.equal(byId.get('alpha-provider-a').kb_target_binding.automatic_target_count, 0);
  assert.equal(byId.get('alpha-provider-b').kb_target_binding.automatic_target_count, 0);

  const selectedLocTargets = byId.get('loc-provider').target_matcher({
    domain_lens: { id: 'G15' },
    primary_query_set: [{ text: 'Library of Congress books' }],
    reinforcement_query_set: []
  }, 'INITIAL');
  assert.deepEqual(selectedLocTargets.map((target) => target.target_id), ['target-loc']);
});
