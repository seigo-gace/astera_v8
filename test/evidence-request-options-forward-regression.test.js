'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

class CaptureSearchInputEngine extends CanonicalAsteraEngine {
  constructor(options) {
    super(options);
    this.searchInputs = [];
  }

  async resolveEvidenceForTask({ input, task }) {
    this.searchInputs.push({
      task: task.id,
      options: input.evidence_search
    });
    // Deliberately leave the evidence unresolved. This regression verifies
    // request option carriage, not acceptance of an unverified search result.
    return null;
  }
}

test('per-request Evidence Search deadline and provider restrictions survive canonical handoff', async () => {
  const engine = new CaptureSearchInputEngine({
    poolSize: 2,
    logger: { write() {} }
  });
  const options = {
    deadline_ms: 3000,
    maximum_results: 2,
    provider_allowlist: ['free-official-live'],
    provider_denylist: ['untrusted-provider']
  };

  try {
    const out = await engine.process({
      question: 'Verify that Node.js 22 is supported in production using official evidence.',
      language: 'en',
      evidence_search: options
    }, { id: 'evidence-budget-forward-test' });

    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(engine.searchInputs.length >= 1, 'expected a planned evidence lookup');
    for (const capture of engine.searchInputs) {
      assert.deepEqual(capture.options, options);
    }
    assert.equal(out.result.canonical_claims.confirmed_count, 0,
      'missing external evidence must never become confirmed merely because lookup was planned');
  } finally {
    await engine.destroy();
  }
});
