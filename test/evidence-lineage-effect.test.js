'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareLineage, analyzeLineage } = require('../src/evidence-search/evidence/lineage-matcher');

function candidate({ id, family, authority, publisher }) {
  return {
    candidate_id: id,
    canonical_record_id: `${id}-record`,
    source_family_id: family,
    authority_id: authority,
    publisher_id: publisher,
    lineage_fingerprint: {
      origin_record_id: `${id}-origin`,
      authority_id: authority,
      publisher_id: publisher
    }
  };
}

test('PURPOSE EFFECT: records from the same source family are never classified as independent lineage', () => {
  const left = candidate({ id: 'left', family: 'family-a', authority: 'authority-a', publisher: 'publisher-a' });
  const right = candidate({ id: 'right', family: 'family-a', authority: 'authority-b', publisher: 'publisher-b' });

  assert.equal(compareLineage(left, right), 'PARTIALLY_SHARED');
  const analysis = analyzeLineage([left, right]);
  assert.equal(analysis.source_family_count, 1);
  assert.equal(analysis.independent_origin_count, 1);
  assert.equal(analysis.pair_measurements[0].status, 'PARTIALLY_SHARED');
});

test('PURPOSE EFFECT: distinct source families with distinct authority and publisher can count as independent lineage', () => {
  const left = candidate({ id: 'left', family: 'family-a', authority: 'authority-a', publisher: 'publisher-a' });
  const right = candidate({ id: 'right', family: 'family-b', authority: 'authority-b', publisher: 'publisher-b' });

  assert.equal(compareLineage(left, right), 'INDEPENDENT');
  const analysis = analyzeLineage([left, right]);
  assert.equal(analysis.source_family_count, 2);
  assert.equal(analysis.independent_origin_count, 2);
  assert.equal(analysis.pair_measurements[0].status, 'INDEPENDENT');
});
