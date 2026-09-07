'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');
const { attachKbTargets } = require('../src/evidence-search/providers/kb-target-aware-provider');

function byUrl(registry, url) {
  return registry.targets.find((target) => target.official_url === url);
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

test('provider search receives selected KB targets without turning the directory into evidence', async () => {
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
  const provider = attachKbTargets(baseProvider, registry, { limit: 16 });
  const result = await provider.search({
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
  assert.ok(receivedPlan.search_targets.some((target) => target.kb === 'MITRE ATT&CK TAXII/STIX'));
  assert.deepEqual(result.candidates, []);
});
