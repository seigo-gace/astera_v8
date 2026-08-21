'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const AsteraEngine = require('../src/astera-engine');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const silentLogger = { write() {}, async flush() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

test('public AsteraEngine entrypoint resolves to the canonical non-recommendation runtime', () => {
  assert.equal(AsteraEngine, CanonicalAsteraEngine);
});

test('direct AsteraEngine use preserves canonical Main8 and material-only comparison invariants', async () => {
  const engine = new AsteraEngine({ logger: silentLogger });
  try {
    const out = await engine.process({ question: 'APIを検証する。', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.non_ai, true);
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.deepEqual(out.result.judgment.order, [
      '01_purpose',
      '02_premise',
      '03_facts',
      '04_crisis',
      '05_opposition',
      '06_comparison',
      '07_evidence_status',
      '08_reinstruction'
    ]);
    assert.equal(out.result.judgment['07_recommendation'], undefined);
    assert.equal(out.result.comparison.material_only, true);
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
    assert.equal(out.result.comparison.verdict.decision, 'MATERIAL_ONLY');
    assert.equal(Object.hasOwn(out.result.comparison, 'score'), false);
  } finally {
    await engine.destroy();
  }
});
