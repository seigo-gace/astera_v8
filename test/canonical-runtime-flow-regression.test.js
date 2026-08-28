'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const silentLogger = { write() {}, async flush() {} };
const tenant = { id: 'test', is_global: true, plan: 'admin' };

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({ poolSize: 2, logger: silentLogger });
  try { await fn(engine); } finally { await engine.destroy(); }
}

test('canonical engine uses the canonical Task Decomposition contract automatically and exposes its graph metadata', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'APIサーバーを検証する。それを改善する。',
      context: 'APIサーバーはmainを変更するな。'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.analysis_task_packet.task_decomposition_version, '3.0-canonical');
    assert.equal(out.result.instruction_understanding.task_decomposition, 'DETERMINISTIC_CANONICAL_V3');
    assert.ok(out.result.analysis_task_packet.reference_resolutions.length >= 1);
    assert.ok(out.result.analysis_task_packet.context_bindings.length >= 1);
    assert.deepEqual(out.result.judgment.task_graph.reference_resolutions, out.result.analysis_task_packet.reference_resolutions);
    assert.deepEqual(out.result.judgment.task_graph.context_bindings, out.result.analysis_task_packet.context_bindings);
    assert.equal(out.result.judgment.task_graph.validation.valid, true);
  });
});

test('Main8 section 01 uses Task purpose rather than silently falling back to the old objective-only path', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'APIを改善する。' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    const task = out.result.analysis_task_packet.tasks[0];
    assert.ok(task.purpose);
    assert.ok(out.result.judgment['01_purpose'].items.some((item) => item.includes(task.purpose)));
  });
});

test('Human Reader remains presentation metadata and never gains decision or mutation authority', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: '正確にAPIを検証してCodeを実装する。' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(out.result.human_reader);
    assert.ok(out.result.judgment.human_reader);
    assert.equal(out.result.judgment.human_reader.mode, out.result.human_reader.mode);
    assert.deepEqual(out.result.judgment.human_reader.response_policy, out.result.human_reader.response_policy);
    assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    assert.equal(out.result.no_normative_decision_generated, true);
    assert.equal(out.result.comparison.material_only, true);
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
  });
});

test('hard Task Graph blocker stops canonical Task/Claim/Evidence processing before downstream runtime starts', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'APIを変更する。APIを変更するな。成功条件は互換性を維持することである。'
    }, tenant);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.task_processing_started, false);
    assert.equal(out.result.evidence_processing_started, false);
    assert.ok(out.result.hard_blockers.includes('PROHIBITION_REPLACE_OVERLAP'));
    assert.equal(out.runtime.blocked, true);
  });
});

test('Main8 Task Graph view preserves Canonical V3 branch/reference/context metadata on the production path', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({
      question: 'APIサーバーを検証する。それを改善する。検証が成功した場合に互換性を確認する。',
      context: 'APIサーバーはmainを変更するな。'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    const packet = out.result.analysis_task_packet;
    const view = out.result.judgment.task_graph;
    assert.ok(packet.branches.length >= 1);
    assert.ok(packet.reference_resolutions.length >= 1);
    assert.ok(packet.context_bindings.length >= 1);
    assert.deepEqual(view.branches, packet.branches);
    assert.deepEqual(view.branch_groups, packet.branch_groups);
    assert.deepEqual(view.reference_resolutions, packet.reference_resolutions);
    assert.deepEqual(view.context_bindings, packet.context_bindings);
    assert.deepEqual(view.hard_blockers, packet.hard_blockers);
    assert.deepEqual(view.validation, packet.task_graph_validation);
  });
});
