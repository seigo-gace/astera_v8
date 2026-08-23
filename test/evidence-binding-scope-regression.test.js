'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ClaimOrigin, Modality, Polarity } = require('../src/v4-canonical/core');
const { CandidateRelation, bindExternalCandidate } = require('../src/v4-canonical/evidence-binding');
const { policyForClaim } = require('../src/v4-canonical/policy-registry');

function claim(overrides = {}) {
  return {
    claim_id: 'C1',
    fragment_id: 'F1',
    canonical_source_position: '0:20',
    raw_text: 'API is compatible',
    subject: 'API',
    predicate: 'HAS_STATE',
    object_or_value: 'compatible',
    polarity: Polarity.AFFIRMATIVE,
    modality: Modality.OBSERVED,
    time_scope: 'UNKNOWN',
    jurisdiction: 'UNKNOWN',
    version_scope: 'UNKNOWN',
    claim_origin: ClaimOrigin.DIRECT_ASSERTION,
    condition: null,
    verification_line: { passed: true },
    ...overrides
  };
}

function candidate(overrides = {}) {
  return {
    candidate_id: 'E1',
    canonical_record_id: 'R1',
    canonical_locator: { url: 'https://example.test/r1', replayable: true },
    source_role: 'OFFICIAL',
    source_family_id: 'official-family',
    authority_id: 'official-authority',
    fields: { claim: 'API is compatible' },
    excerpt: 'API is compatible',
    ...overrides
  };
}

test('known version becomes a required confirmation scope and mismatched evidence cannot SUPPORT', () => {
  const input = claim({ version_scope: '2.0.0' });
  const policy = policyForClaim(input);
  assert.ok(policy.required_scope_fields.includes('version_scope'));

  const mismatch = bindExternalCandidate(input, candidate({ version: '1.0.0' }), policy);
  assert.equal(mismatch.relation, CandidateRelation.PARTIALLY_SUPPORTS);
  assert.ok(mismatch.reasons.includes('MISMATCH:version_scope'));

  const matching = bindExternalCandidate(input, candidate({ version: '2.0.0' }), policy);
  assert.equal(matching.relation, CandidateRelation.SUPPORTS);
});

test('current-date evidence must match the claim time scope instead of silently supporting stale material', () => {
  const input = claim({ time_scope: '2026-08-24' });
  const policy = policyForClaim(input);
  assert.ok(policy.required_scope_fields.includes('time_scope'));

  const stale = bindExternalCandidate(input, candidate({ updated_at: '2026-08-23T12:00:00.000Z' }), policy);
  assert.equal(stale.relation, CandidateRelation.PARTIALLY_SUPPORTS);
  assert.ok(stale.reasons.includes('MISMATCH:time_scope'));

  const current = bindExternalCandidate(input, candidate({ updated_at: '2026-08-24T01:00:00.000Z' }), policy);
  assert.equal(current.relation, CandidateRelation.SUPPORTS);
});

test('known jurisdiction must match and unknown evidence scope fails closed', () => {
  const input = claim({ jurisdiction: 'JP' });
  const policy = policyForClaim(input);
  assert.ok(policy.required_scope_fields.includes('jurisdiction'));

  const wrong = bindExternalCandidate(input, candidate({ jurisdiction: 'US' }), policy);
  assert.equal(wrong.relation, CandidateRelation.PARTIALLY_SUPPORTS);
  assert.ok(wrong.reasons.includes('MISMATCH:jurisdiction'));

  const missing = bindExternalCandidate(input, candidate(), policy);
  assert.equal(missing.relation, CandidateRelation.PARTIALLY_SUPPORTS);
  assert.ok(missing.reasons.includes('EVIDENCE_SCOPE_UNKNOWN:jurisdiction'));
});

test('conditional claims require the evidence condition to match', () => {
  const input = claim({
    raw_text: 'PlanがAなら有効',
    subject: 'Plan',
    predicate: 'RESULT_WHEN',
    object_or_value: '有効',
    polarity: Polarity.CONDITIONAL,
    modality: Modality.CONDITIONAL_RULE,
    condition: { subject: 'Plan', value: 'A' }
  });
  const policy = policyForClaim(input);

  const wrong = bindExternalCandidate(input, candidate({
    fields: { claim: 'PlanがBなら有効' },
    excerpt: 'PlanがBなら有効'
  }), policy);
  assert.equal(wrong.relation, CandidateRelation.PARTIALLY_SUPPORTS);
  assert.ok(wrong.reasons.includes('MISMATCH:condition'));

  const matching = bindExternalCandidate(input, candidate({
    fields: { claim: 'PlanがAなら有効' },
    excerpt: 'PlanがAなら有効'
  }), policy);
  assert.equal(matching.relation, CandidateRelation.SUPPORTS);
});
