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

test('Main8 05/06 preserve multi and comparison material for golden compare input', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'A案とB案を費用と安全性で比較する。',
      language: 'ja'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');

    const s05 = out.result.judgment['05_opposition'];
    const s06 = out.result.judgment['06_comparison'];

    assert.ok(Array.isArray(s05.perspectives));
    assert.ok(Array.isArray(s05.expanded_perspectives));
    assert.ok(Array.isArray(s05.trade_off_map));
    assert.ok(s05.perspectives.length > 0);
    assert.ok(s05.perspectives.every((p) => String(p.id || p.class || '').toUpperCase() !== 'MAINLINE'));
    assert.ok(s05.expanded_perspectives.some((p) => p.id === 'opposition' || p.class === 'OPPOSITION'));
    assert.ok(s05.expanded_perspectives.every((p) => p.trade_off_material && typeof p.trade_off_material === 'object'));
    assert.ok(s05.expanded_perspectives.every((p) => typeof p.trade_off_material.status === 'string'));
    assert.ok(s05.expanded_perspectives.every((p) => Array.isArray(p.trade_off_material.dimensions)));
    assert.equal(Object.hasOwn(s05.expanded_perspectives[0].trade_off_material, 'score'), false);
    assert.equal(Object.hasOwn(s05.expanded_perspectives[0].trade_off_material, 'ranking'), false);
    assert.equal(Object.hasOwn(s05.expanded_perspectives[0].trade_off_material, 'winner'), false);

    assert.match(out.material.text, /Trade-off Material/);
    assert.match(out.material.text, /Candidates:/);
    assert.match(out.material.text, /Dimensions:/);
    assert.ok(s06.scope_booleans);
    assert.ok(s06.supported_scope);
    assert.ok(s06.unsupported_scope);
    assert.ok(s06.contradiction_map);
    assert.ok(s06.condition_differences && typeof s06.condition_differences === 'object');
    assert.deepEqual(s06.comparison_candidates.map((c) => c.label || c), ['A案', 'B案']);
    assert.ok(s06.dimensions.includes('費用') && s06.dimensions.includes('安全性'));
    assert.equal(s06.candidate_materials.length, 2);
    assert.ok(s06.trade_off_differences.length > 0);
    assert.ok(s06.trade_off_differences.every((d) => d.status === 'MATERIAL_ONLY' && Array.isArray(d.per_candidate)));
    assert.equal(s06.selected_candidate, null);
    assert.deepEqual(s06.candidate_ranking, []);
    assert.deepEqual(s06.rejected_candidates, []);
    assert.equal(out.result.comparison.material_only, true);
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
  } finally {
    await engine.destroy();
  }
});
