'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');
const { loadEvidenceProviders, readConfig } = require('../src/evidence-search/providers/config-loader');
const { loadEvidenceSourceCatalog } = require('../src/evidence-search/providers/source-catalog');
const { attachKbTargetsToProviders } = require('../src/evidence-search/providers/kb-target-aware-provider');
const { assembleRuntimeProviders, baseTargets, boundTargetIds } = require('../src/evidence-search/providers/runtime-provider-assembly');

const EXPECTED_BASE_KB_TARGET_COUNT = 663;

function generalWebStub() {
  return {
    provider_id: 'free-general-web-search',
    source_class: 'FREE_GENERAL_WEB',
    source_family_id: 'GENERAL_WEB',
    certified: true,
    capabilities: ['GENERAL_WEB_DISCOVERY'],
    routing_terms: [],
    domains: [],
    search: async () => ({ candidates: [], query_results: [] })
  };
}

test('all 663 base KB targets have executable runtime bindings', () => {
  const configFile = path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
  const { absolute, parsed } = readConfig(configFile);
  const sourceCatalog = loadEvidenceSourceCatalog(absolute, parsed.source_catalog);
  const targetRegistry = KbTargetRegistry.load();
  const dedicatedProviders = attachKbTargetsToProviders(loadEvidenceProviders({ configFile: absolute }), targetRegistry, {
    providerDefinitions: parsed.providers,
    sourceCatalog,
    requireBinding: true,
    limit: 32
  });
  const runtime = assembleRuntimeProviders({ registry: targetRegistry, dedicatedProviders, fallbackLimit: 4 });
  const bound = boundTargetIds(runtime.providers);
  const base = baseTargets(targetRegistry);
  const baseIds = base.map((target) => String(target.target_id));

  assert.equal(targetRegistry.base_target_count, EXPECTED_BASE_KB_TARGET_COUNT);
  assert.equal(runtime.baseTargetCount, EXPECTED_BASE_KB_TARGET_COUNT);
  assert.equal(base.length, EXPECTED_BASE_KB_TARGET_COUNT);
  assert.equal(runtime.remainingUnboundBaseTargetIds.length, 0);
  assert.equal(runtime.remainingUnboundTargetIds.length, 0);
  assert.ok(baseIds.every((targetId) => bound.has(targetId)));
  assert.equal(baseIds.filter((targetId) => bound.has(targetId)).length, EXPECTED_BASE_KB_TARGET_COUNT);
  assert.equal(runtime.remainingUnboundAutomaticTargetIds.length, 0);
  assert.equal(runtime.remainingUnboundPassTargetIds.length, 0);
  assert.ok(runtime.fallbackTargetIds.length > 0);
  assert.ok(runtime.providers.some((provider) => provider.provider_id === 'free-general-web-search'));
});

test('explicit base KB runtime binding makes non-automatic targets executable without changing canonical eligibility', () => {
  const authRequiredTarget = Object.freeze({
    target_id: 'auth-required-target',
    kb: 'Auth Required Public KB',
    official_url: 'https://example.org/auth-search',
    host: 'example.org',
    genres: Object.freeze(['G01']),
    recorded_accesses: Object.freeze(['FREE_AUTH']),
    recorded_statuses: Object.freeze(['PARTIAL']),
    target_state: 'AUTH_REQUIRED',
    automatic_search_eligible: false
  });
  const blockedTarget = Object.freeze({
    target_id: 'blocked-target',
    kb: 'Previously Blocked Public KB',
    official_url: 'https://example.net/blocked-search',
    host: 'example.net',
    genres: Object.freeze(['G02']),
    recorded_accesses: Object.freeze(['FREE_NO_AUTH']),
    recorded_statuses: Object.freeze(['BLOCKED', 'PARTIAL']),
    target_state: 'BLOCKED',
    automatic_search_eligible: false
  });
  const registry = new KbTargetRegistry([authRequiredTarget, blockedTarget], {
    source_record_count: 2,
    base_target_count: 2,
    runtime_target_count: 0
  });
  const runtime = assembleRuntimeProviders({
    registry,
    dedicatedProviders: [],
    fallbackLimit: 4,
    generalWebProvider: generalWebStub()
  });

  assert.equal(registry.targets[0].automatic_search_eligible, false);
  assert.equal(registry.targets[1].automatic_search_eligible, false);
  assert.deepEqual(runtime.fallbackTargetIds, ['auth-required-target', 'blocked-target']);
  assert.equal(runtime.remainingUnboundBaseTargetIds.length, 0);
  assert.equal(runtime.remainingUnboundTargetIds.length, 0);
  assert.ok(runtime.fallbackProvider.kb_target_binding.target_ids.includes('auth-required-target'));
  assert.ok(runtime.fallbackProvider.kb_target_binding.target_ids.includes('blocked-target'));

  const authMatched = runtime.fallbackProvider.target_matcher({
    domain_lens: { id: 'G01' },
    primary_query_set: [{ text: 'Auth Required Public KB' }],
    reinforcement_query_set: []
  }, 'INITIAL');
  assert.deepEqual(authMatched.map((target) => target.target_id), ['auth-required-target']);

  const blockedMatched = runtime.fallbackProvider.target_matcher({
    domain_lens: { id: 'G02' },
    primary_query_set: [{ text: 'Previously Blocked Public KB' }],
    reinforcement_query_set: []
  }, 'INITIAL');
  assert.deepEqual(blockedMatched.map((target) => target.target_id), ['blocked-target']);
});
