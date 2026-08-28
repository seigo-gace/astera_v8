'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { taskGraphView } = require('../src/server-with-evidence');

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

test('Human Reader is connected as presentation control but cannot mutate facts, evidence, or constraints', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: '正確にAPIを検証してCodeを実装する。' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(out.result.human_reader);
    assert.ok(out.result.judgment.human_reader);
    assert.equal(out.result.judgment.human_reader.fact_mutation_allowed, false);
    assert.equal(out.result.judgment.human_reader.evidence_mutation_allowed, false);
    assert.equal(out.result.judgment.human_reader.constraint_mutation_allowed, false);
    for (const key of out.result.judgment.order) {
      assert.equal(out.result.judgment[key].decision_basis.presentation_control.fact_mutation_allowed, false);
    }
    assert.equal(out.result.comparison.material_only, true);
    assert.equal(out.result.comparison.selected_candidate, null);
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

test('Task Graph view preserves Canonical V3 branch/reference/context/blocker metadata', () => {
  const request = {
    instruction_understanding: { execution_allowed: false, blocked_reasons: ['TASK_GRAPH_CYCLE:T01,T02'] },
    analysis_task_packet: {
      tasks: [{ id: 'T01' }, { id: 'T02' }],
      dependencies: [{ from: 'T01', to: 'T02' }],
      execution_waves: [],
      branches: [{ branch_id: 'BR-T01-T02' }],
      branch_groups: [{ branch_group_id: 'BR-T01' }],
      reference_resolutions: [{ task_id: 'T02', from_task_ids: ['T01'] }],
      context_bindings: [{ kind: 'constraint', scope: 'TASK', task_ids: ['T01'] }],
      unresolved: ['T02:reference'],
      hard_blockers: ['TASK_GRAPH_CYCLE:T01,T02'],
      task_graph_validation: { valid: false, cycle: ['T01', 'T02'] }
    }
  };
  const view = taskGraphView(request);
  assert.equal(view.branches.length, 1);
  assert.equal(view.branch_groups.length, 1);
  assert.equal(view.reference_resolutions.length, 1);
  assert.equal(view.context_bindings.length, 1);
  assert.ok(view.hard_blockers.includes('TASK_GRAPH_CYCLE:T01,T02'));
  assert.equal(view.validation.valid, false);
});
