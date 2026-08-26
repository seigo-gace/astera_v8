'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const tenant = { id: 'trace-test', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

test('hard instruction contradiction stops before Task/Claim/Evidence and never fabricates Main8', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'APIを変更する。APIを変更するな。成功条件は互換性を維持することである。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.ok(out.result.hard_blockers.includes('PROHIBITION_REPLACE_OVERLAP'));
    assert.equal(out.result.task_processing_started, false);
    assert.equal(out.result.evidence_processing_started, false);
    assert.equal(out.runtime.blocked, true);
    assert.ok(out.runtime.hard_blockers.includes('PROHIBITION_REPLACE_OVERLAP'));
    assert.match(out.material.text, /Task Graphを安全に実行できないため/);
    assert.equal(out.result.judgment, undefined);
  } finally {
    await engine.destroy();
  }
});

test('all Main8 Decision Basis entries expose instruction understanding on an executable request', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'APIを検証する。成功条件は互換性を維持することである。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
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
    for (const key of out.result.judgment.order) {
      const basis = out.result.judgment[key].decision_basis;
      assert.ok(basis.instruction_understanding);
      assert.equal(basis.instruction_understanding.mode, 'GLOBAL_LANGUAGE_ADAPTER');
      assert.ok(Array.isArray(basis.hard_blockers));
      assert.equal(basis.hard_blockers.length, 0);
      assert.ok(Array.isArray(basis.blocking_conditions));
    }
  } finally {
    await engine.destroy();
  }
});

test('unresolved deictic short request returns clarification instead of guessed Main8', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try {
    const out = await engine.process({ question: 'どう？', language: 'ja' }, tenant);
    assert.equal(out.result.type, 'clarification_needed');
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
    assert.match(out.material.text, /確認が必要です/);
    assert.match(out.material.text, /対象/);
  } finally {
    await engine.destroy();
  }
});
