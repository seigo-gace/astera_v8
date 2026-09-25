'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { stableStringify } = require('../../utils/stable-json');
const { evaluateGeneric } = require('../../generic/evaluator-engine');
const { buildEvidenceRegistry } = require('../../../evidence-search/evidence/registry');

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function candidate() {
  return Object.freeze({
    schema_version: 'astera.evidence-candidate.v1',
    candidate_id: 'evc_bridge_1',
    provider_id: 'provider.bridge',
    source_class: 'FREE_OFFICIAL',
    source_family_id: 'family.bridge',
    source_id: 'source.bridge',
    capability_id: 'search',
    canonical_locator: Object.freeze({ url: 'https://official.example/bridge/1', locator_type: 'URL', replayable: true }),
    canonical_record_id: 'bridge-record-1',
    publisher: Object.freeze({ id: 'authority.bridge', name: 'Bridge Authority' }),
    authority_id: 'authority.bridge',
    source_role: 'OFFICIAL',
    title: 'Bridge evidence',
    excerpt: 'Deterministic evidence for the generic evaluator bridge',
    language: 'en',
    jurisdiction: 'US',
    published_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-09-25T00:00:00Z',
    version: '1',
    content_hash: sha256('Deterministic evidence for the generic evaluator bridge'),
    revision_id: 'rev-bridge-1',
    retrieval_trace: Object.freeze({ endpoint: '/bridge/1' }),
    fields: Object.freeze({}),
    lineage_fingerprint: Object.freeze({ authority_id: 'authority.bridge', origin_record_id: 'bridge-record-1' })
  });
}

function measurement(evidenceId) {
  const base = {
    measurement_id: 'measurement-bridge-1',
    metric_id: 'generic.score',
    value: 100,
    unit: null,
    evidence_refs: [evidenceId],
    provenance: { collector_id: 'deterministic-bridge-runner', collected_at: '2026-09-25T00:00:00.000Z', run_id: 'bridge-run-1' }
  };
  return Object.freeze({ ...base, measurement_hash: sha256(base) });
}

test('Evidence Search Registry/Bindings feed generic evaluator v2 without translation loss', async () => {
  const evidence = candidate();
  const index = buildEvidenceRegistry({
    candidates: [evidence],
    queryExecution: {
      initial: [{
        query_id: 'bridge-query-1',
        claim_id: 'bridge-claim-1',
        role: 'PRIMARY',
        status: 'FOUND',
        provider_records: [{ provider_id: 'provider.bridge', status: 'FOUND', candidate_record_ids: ['bridge-record-1'] }]
      }],
      reinforcement: []
    },
    requestId: 'bridge-request-1',
    queryPlanHash: 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    executionTime: '2026-09-25T00:00:00.000Z',
    effectiveAsOf: '2026-09-25'
  });

  const result = await evaluateGeneric({
    schema_version: 'astera.evaluation.request.v2',
    evaluation_id: 'bridge-evaluation-1',
    evaluation_time: '2026-09-25T00:00:00.000Z',
    run_id: 'bridge-run-1',
    subject: { subject_id: 'bridge-subject-1', subject_type: 'integration_contract' },
    profile_id: 'generic.measurement.v1',
    measurements: [measurement(evidence.candidate_id)],
    evidence_registry: index.registry,
    evidence_bindings: index.bindings
  });

  assert.equal(result.status, 'PASSED');
  assert.equal(result.ai_used, false);
  assert.equal(result.evidence.valid, true);
  assert.equal(result.evidence.counts.evidence, 1);
  assert.equal(result.evidence.counts.bindings, 1);
  assert.equal(result.dimensions[0].metrics[0].evidence_refs[0], evidence.candidate_id);
  assert.match(result.result_hash, /^[a-f0-9]{64}$/);
});
