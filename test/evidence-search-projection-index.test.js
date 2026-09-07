'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  createJsonProjectionProvider
} = require('../src/evidence-search/providers/json-projection-provider');

function plan(text, maximumResults = 10) {
  return {
    request_id: 'projection-index-test',
    query_plan_hash: 'a'.repeat(64),
    domain_lens: { id: 'G29' },
    query_set: [{ text }],
    maximum_results: maximumResults
  };
}

function record(index, text) {
  return {
    canonical_record_id: `record-${index}`,
    canonical_url: `https://example.test/records/${index}`,
    title: text,
    excerpt: `Independent projection content ${index}`,
    domain_id: 'G29',
    source_role: 'PRIMARY',
    authority_id: `authority-${index}`,
    publisher_id: `authority-${index}`,
    revision_id: `revision-${index}`,
    fields: { claim: text }
  };
}

test('large specialist projection scores only indexed candidates instead of every record', async () => {
  const records = Array.from({ length: 20_000 }, (_, index) =>
    record(index, index === 12_345
      ? 'unique deterministic evidence target zephyr-12345'
      : `ordinary specialist record ${index}`)
  );
  const provider = createJsonProjectionProvider({
    provider_id: 'large-indexed-projection',
    source_class: 'FREE_PROJECTION',
    domains: ['G29'],
    records,
    maximumCandidatePool: 500
  });

  const result = await provider.search(
    plan('unique deterministic evidence target zephyr-12345')
  );

  assert.equal(result.candidates[0].canonical_record_id, 'record-12345');
  assert.equal(result.usage.records_indexed, 20_000);
  assert.ok(result.usage.candidate_records_scored < 500);
  assert.ok(result.usage.candidate_records_scored < result.usage.records_indexed / 10);
});

test('trigram index retrieves a near-match without scanning all records', async () => {
  const records = [
    record(1, 'official node runtime compatibility'),
    record(2, 'unrelated database reference'),
    record(3, 'unrelated network reference')
  ];
  const provider = createJsonProjectionProvider({
    provider_id: 'trigram-projection',
    source_class: 'FREE_PROJECTION',
    domains: ['G29'],
    records
  });

  const result = await provider.search(plan('offical node runtme compatibilty'));
  assert.equal(result.candidates[0].canonical_record_id, 'record-1');
  assert.ok(result.usage.candidate_records_scored <= 3);
});

test('file-backed projection rebuilds its index when the source file changes', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astera-projection-reload-'));
  try {
    const filePath = path.join(root, 'projection.json');
    await fs.writeFile(filePath, JSON.stringify([
      record(1, 'first source version')
    ]), 'utf8');

    const provider = createJsonProjectionProvider({
      provider_id: 'reload-projection',
      source_class: 'FREE_PROJECTION',
      domains: ['G29'],
      filePath
    });
    const first = await provider.search(plan('first source version'));
    const firstFingerprint = first.candidates[0].retrieval_trace.projection_fingerprint;
    assert.equal(first.candidates[0].canonical_record_id, 'record-1');

    await new Promise((resolve) => setTimeout(resolve, 10));
    await fs.writeFile(filePath, JSON.stringify([
      record(2, 'second source version')
    ]), 'utf8');

    const second = await provider.search(plan('second source version'));
    const secondFingerprint = second.candidates[0].retrieval_trace.projection_fingerprint;
    assert.equal(second.candidates[0].canonical_record_id, 'record-2');
    assert.notEqual(secondFingerprint, firstFingerprint);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
