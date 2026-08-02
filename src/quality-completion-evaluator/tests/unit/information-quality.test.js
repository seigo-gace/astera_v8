'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluateInformationQuality,
  loadInformationQualityProfiles,
  evaluate
} = require('../..');
const { baseDesignRequest } = require('../fixtures/factory');

function candidate(id, authority, role) {
  return {
    candidate_id: id,
    canonical_record_id: id,
    canonical_locator: { replayable: true },
    authority_id: authority,
    publisher: { id: authority, name: authority },
    source_role: role,
    title: 'verified title',
    excerpt: 'verified content',
    language: 'en',
    content_hash: `${id}-hash`,
    revision_id: `${id}-revision`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public' }
  };
}

function request({ phase = 'INITIAL', scoreMode = 'complete', newCount = 0, reinforcementCount = 0 } = {}) {
  const candidates = scoreMode === 'none'
    ? []
    : [candidate('record-a', 'authority-a', 'PRIMARY'), candidate('record-b', 'authority-b', 'OFFICIAL')];
  return {
    schema_version: 'astera.information-quality-request.v1',
    phase,
    domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
    overlays: [],
    jurisdictions: [],
    conditions: [{ condition_id: 'core', class: 'CORE', field: 'claim', required: true }],
    candidates,
    measurements: {
      conditions: [{ condition_id: 'core', class: 'CORE', status: scoreMode === 'contradicted' ? 'CONTRADICTED' : 'CONFIRMED' }],
      lineage: { independent_origin_count: phase === 'FINAL' ? 3 : 2, origin_count: phase === 'FINAL' ? 3 : 2, distinct_official_record_count: 2 },
      conflict: { highest_severity: scoreMode === 'critical' ? 'CRITICAL' : 'NONE', conflicts: [] },
      freshness: { overall_state: 'IDEAL', current_required: true },
      coverage: { registry_coverage_state: 'COMPLETE_FOR_ACTIVE_REGISTRY', discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE' }
    },
    reinforcement_attempt_count: reinforcementCount,
    new_corroboration_count: newCount
  };
}

test('information quality profile covers all 38 domains and totals 10000 bp', () => {
  const profiles = loadInformationQualityProfiles();
  assert.equal(Object.keys(profiles.domain_profile_map).length, 38);
  assert.equal(Object.values(profiles.criterion_weights).reduce((a, b) => a + b, 0), 10000);
  assert.match(profiles.profile_hash, /^[a-f0-9]{64}$/);
});

test('initial quality at or above 8000 always requires reinforcement', () => {
  const result = evaluateInformationQuality(request());
  assert.equal(result.status, 'REINFORCEMENT_REQUIRED');
  assert.ok(result.score_bp >= 8000);
});

test('final quality requires exactly one reinforcement and new corroboration', () => {
  const noAttempt = evaluateInformationQuality(request({ phase: 'FINAL', newCount: 1, reinforcementCount: 0 }));
  assert.equal(noAttempt.status, 'REJECTED_REINFORCEMENT_COUNT');

  const noNew = evaluateInformationQuality(request({ phase: 'FINAL', newCount: 0, reinforcementCount: 1 }));
  assert.equal(noNew.status, 'REJECTED_NO_ADDITIONAL_EVIDENCE');

  const valid = evaluateInformationQuality(request({ phase: 'FINAL', newCount: 1, reinforcementCount: 1 }));
  assert.equal(valid.status, 'FINAL_VALID');
  assert.ok(valid.score_bp >= 9500);
});

test('core contradiction and critical conflict are blocking', () => {
  const contradicted = evaluateInformationQuality(request({ scoreMode: 'contradicted' }));
  assert.equal(contradicted.status, 'REJECTED_BLOCKING');
  assert.ok(contradicted.blocking_reasons.includes('CORE_CONDITION_CONTRADICTED'));

  const critical = evaluateInformationQuality(request({ scoreMode: 'critical' }));
  assert.equal(critical.status, 'REJECTED_BLOCKING');
  assert.ok(critical.blocking_reasons.includes('CRITICAL_CONFLICT_UNRESOLVED'));
});

test('existing artifact evaluate entrypoint remains callable', () => {
  const existing = evaluate(baseDesignRequest());
  assert.ok(existing);
  assert.equal(typeof existing, 'object');
});
