'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const {
  extractComparisonCandidates,
  extractComparisonDimensionsFromText
} = require('../src/v4-canonical/lanes');

const silentLogger = { write() {} };
const tenant = { id: 'global-compare', is_global: true, plan: 'admin' };

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try {
    await fn(engine);
  } finally {
    await engine.destroy();
  }
}

function deterministicSnapshot(out) {
  return JSON.stringify({
    analysis_task_packet: out.result.analysis_task_packet,
    five_stage: out.result.five_stage,
    perspective_expansion: out.result.perspective_expansion,
    comparison: out.result.comparison,
    judgment: out.result.judgment,
    material: out.material
  });
}

test('Japanese golden compare extracts candidates, dimensions and MATERIAL_ONLY output', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'A案とB案を費用と安全性で比較する。',
      language: 'ja'
    }, tenant);
    const s06 = out.result.judgment['06_comparison'];
    assert.deepEqual(s06.comparison_candidates.map((c) => c.label || c), ['A案', 'B案']);
    assert.ok(s06.dimensions.includes('費用'));
    assert.ok(s06.dimensions.includes('安全性'));
    assert.equal(s06.selected_candidate, null);
    assert.deepEqual(s06.candidate_ranking, []);
    assert.match(out.material.text, /A案/);
    assert.match(out.material.text, /B案/);
    assert.match(out.material.text, /費用/);
    assert.match(out.material.text, /安全性/);
    assert.match(out.material.text, /MATERIAL_ONLY|Candidate Material:/);
  });
});

test('English golden compare extracts candidates and dimensions without ranking', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'Compare A and B on cost and safety.',
      language: 'en'
    }, tenant);
    const s06 = out.result.judgment['06_comparison'];
    assert.deepEqual(s06.comparison_candidates.map((c) => c.label || c), ['A', 'B']);
    assert.ok(s06.dimensions.includes('cost'));
    assert.ok(s06.dimensions.includes('safety'));
    assert.equal(s06.selected_candidate, null);
    assert.deepEqual(s06.candidate_ranking, []);
    assert.match(out.material.text, /\bA\b/);
    assert.match(out.material.text, /\bB\b/);
    assert.match(out.material.text, /cost/i);
    assert.match(out.material.text, /safety/i);
  });
});

test('English compare patterns cover vs and in terms of forms', () => {
  const vsTask = { source_span: { text: 'Compare A vs B for compatibility and rollback.' } };
  assert.deepEqual(extractComparisonCandidates(vsTask), ['A', 'B']);
  assert.deepEqual(extractComparisonDimensionsFromText(vsTask, []), ['compatibility', 'rollback']);

  const termsTask = { source_span: { text: 'Compare option A with option B in terms of cost, safety, and maintainability.' } };
  assert.deepEqual(extractComparisonCandidates(termsTask), ['option A', 'option B']);
  assert.deepEqual(
    extractComparisonDimensionsFromText(termsTask, []),
    ['cost', 'safety', 'maintainability']
  );
});

test('English compare does not treat dimension tail as candidate', () => {
  const task = { source_span: { text: 'Compare A and B on cost and safety.' } };
  const candidates = extractComparisonCandidates(task);
  assert.equal(candidates.includes('B on cost and safety'), false);
  assert.deepEqual(candidates, ['A', 'B']);
});

test('JA and EN compare inputs remain deterministic across five executions', async () => {
  await withEngine(async (engine) => {
    const cases = [
      { question: 'A案とB案を費用と安全性で比較する。', language: 'ja' },
      { question: 'Compare A and B on cost and safety.', language: 'en' }
    ];
    for (const input of cases) {
      const first = await engine.process(input, tenant);
      const expected = deterministicSnapshot(first);
      assert.equal((first.result.five_stage.execution.timings || []).some((timing) => Object.hasOwn(timing, 'duration_ms')), false);
      for (let index = 0; index < 5; index += 1) {
        const next = await engine.process(input, tenant);
        assert.equal(deterministicSnapshot(next), expected);
      }
    }
  });
});
