'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildEvidenceRegistry,
  emptyEvidenceRegistry,
  emptyEvidenceBindings
} = require('../src/evidence-search/evidence/registry');

function candidate() {
  return Object.freeze({
    schema_version: 'astera.evidence-candidate.v1',
    candidate_id: 'evc_test_1',
    provider_id: 'provider.test',
    source_class: 'FREE_OFFICIAL',
    source_family_id: 'family.test',
    source_id: 'source.test',
    capability_id: 'search',
    canonical_locator: Object.freeze({ url: 'https://official.example/record/1', locator_type: 'URL', replayable: true }),
    canonical_record_id: 'record-1',
    publisher: Object.freeze({ id: 'authority.test', name: 'Official Authority' }),
    authority_id: 'authority.test',
    source_role: 'OFFICIAL',
    title: 'Official record',
    excerpt: 'Verified content',
    language: 'en',
    jurisdiction: 'US',
    published_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    version: '1',
    content_hash: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    revision_id: 'rev-1',
    retrieval_trace: Object.freeze({ endpoint: '/record/1' }),
    fields: Object.freeze({}),
    lineage_fingerprint: Object.freeze({ authority_id: 'authority.test', origin_record_id: 'record-1' })
  });
}

test('Evidence Registry and Binding are deterministic, traceable, and non-AI', () => {
  const input = {
    candidates: [candidate()],
    queryExecution: {
      initial: [{
        query_id: 'query-1',
        claim_id: 'claim-1',
        role: 'PRIMARY',
        status: 'FOUND',
        provider_records: [{ provider_id: 'provider.test', status: 'FOUND', candidate_record_ids: ['record-1'] }]
      }],
      reinforcement: []
    },
    requestId: 'request-1',
    queryPlanHash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    executionTime: '2026-09-25T14:00:00.000Z',
    effectiveAsOf: '2026-09-25'
  };

  const first = buildEvidenceRegistry(input);
  const second = buildEvidenceRegistry(input);
  assert.deepEqual(first, second);
  assert.equal(first.registry.schema_version, 'astera.evidence-registry.v1');
  assert.equal(first.registry.entries.length, 1);
  assert.equal(first.registry.entries[0].evidence_id, 'evc_test_1');
  assert.equal(first.registry.entries[0].source.authority_id, 'authority.test');
  assert.deepEqual(first.registry.entries[0].provenance.query_ids, ['query-1']);
  assert.deepEqual(first.registry.entries[0].provenance.claim_ids, ['claim-1']);
  assert.match(first.registry.entries[0].integrity.entry_hash, /^[a-f0-9]{64}$/);
  assert.match(first.registry.registry_hash, /^[a-f0-9]{64}$/);

  assert.equal(first.bindings.schema_version, 'astera.evidence-bindings.v1');
  assert.equal(first.bindings.bindings.length, 1);
  const binding = first.bindings.bindings[0];
  assert.equal(binding.claim_id, 'claim-1');
  assert.equal(binding.query_id, 'query-1');
  assert.equal(binding.evidence_id, 'evc_test_1');
  assert.equal(binding.source_role, 'OFFICIAL');
  assert.equal(binding.authority_id, 'authority.test');
  assert.equal(binding.relation, 'SUPPORTS_QUERY');
  assert.match(binding.binding_id, /^evb_[a-f0-9]{24}$/);
  assert.match(binding.binding_hash, /^[a-f0-9]{64}$/);
});

test('empty Evidence Registry and Binding sets are deterministic fail-closed values', () => {
  const registryA = emptyEvidenceRegistry();
  const registryB = emptyEvidenceRegistry();
  const bindingsA = emptyEvidenceBindings();
  const bindingsB = emptyEvidenceBindings();
  assert.deepEqual(registryA, registryB);
  assert.deepEqual(bindingsA, bindingsB);
  assert.deepEqual(registryA.entries, []);
  assert.deepEqual(bindingsA.bindings, []);
  assert.match(registryA.registry_hash, /^[a-f0-9]{64}$/);
  assert.match(bindingsA.bindings_hash, /^[a-f0-9]{64}$/);
});
