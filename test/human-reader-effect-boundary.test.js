'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const tenant = { id: 'human-reader-effect', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

test('PURPOSE EFFECT: Human Reader can change presentation mode but cannot change facts, evidence state, constraints, or comparison material', async () => {
  const engine = new CanonicalAsteraEngine({ logger: silentLogger });
  try {
    const input = {
      question: 'Astera APIの構造を整理する。対象はAstera API。',
      context: '既存Contractを維持する。'
    };
    const stable = await engine.process({ ...input, moodAnswers: { score: 0 } }, tenant);
    const pressured = await engine.process({ ...input, moodAnswers: { score: -10 } }, tenant);

    assert.equal(stable.result.human_reader.mode, 'stable');
    assert.equal(pressured.result.human_reader.mode, 'high_pressure');

    assert.deepEqual(pressured.result.canonical_claims, stable.result.canonical_claims);
    assert.deepEqual(pressured.result.facts, stable.result.facts);
    assert.deepEqual(pressured.result.risks, stable.result.risks);
    assert.deepEqual(pressured.result.comparison, stable.result.comparison);
    assert.deepEqual(
      pressured.result.analysis_task_packet.prohibitions,
      stable.result.analysis_task_packet.prohibitions
    );
    assert.deepEqual(
      pressured.result.analysis_task_packet.preserve,
      stable.result.analysis_task_packet.preserve
    );

    assert.equal(stable.result.judgment.human_reader.fact_mutation_allowed, false);
    assert.equal(stable.result.judgment.human_reader.evidence_mutation_allowed, false);
    assert.equal(stable.result.judgment.human_reader.constraint_mutation_allowed, false);
    assert.equal(pressured.result.judgment.human_reader.fact_mutation_allowed, false);
    assert.equal(pressured.result.judgment.human_reader.evidence_mutation_allowed, false);
    assert.equal(pressured.result.judgment.human_reader.constraint_mutation_allowed, false);
  } finally {
    await engine.destroy();
  }
});
