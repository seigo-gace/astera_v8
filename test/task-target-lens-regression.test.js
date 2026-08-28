'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');

const tenant = { id: 'test', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

test('Canonical Task reference resolution carries the resolved target into per-Task Lens routing', async () => {
  const engine = new KaguraEngine({ poolSize: 4, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'APIサーバーのシステム開発を検証する。それを改善する。'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    const tasks = out.result.analysis_task_packet.tasks;
    assert.ok(tasks.length >= 2);
    assert.ok(out.result.analysis_task_packet.reference_resolutions.length >= 1);

    const followup = tasks[1];
    assert.equal(followup.target, 'APIサーバーのシステム開発');

    const projected = out.result.task_results.find((entry) => entry.task.id === followup.id);
    assert.ok(projected);
    assert.equal(projected.task.domain.primary?.id, 'G29');
    assert.equal(out.result.judgment.lens_routing.per_task[followup.id].primary?.id, 'G29');
    assert.ok(out.result.five_stage.tasks.some((entry) => entry.lens_id === 'G29'));
    assert.equal(out.result.judgment['08_reinstruction'].decision_basis.lens_ids.includes('G29'), true);
  } finally {
    await engine.destroy();
  }
});

test('5本柱の公開順はFact/Risk/Multi/Inquiry/Compareのまま維持する', async () => {
  const engine = new KaguraEngine({ poolSize: 4, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'APIサーバーのシステム開発を検証する。それを改善する。'
    }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    assert.deepEqual(out.result.five_stage.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    assert.equal(out.result.judgment.order.length, 8);
  } finally {
    await engine.destroy();
  }
});
