'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');

const tenant = { id: 'test', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({ poolSize: 4, logger: silentLogger });
  try { await fn(engine); } finally { await engine.destroy(); }
}

test('internally resolved explicit Task target is routed into the appropriate Genre Lens', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'APIサーバーのシステム開発を改善する。成功条件は互換性を維持し、回帰テストが通ることである。' }, tenant);
    const task = out.result.task_results.find((item) => item.task.action === 'improve') || out.result.task_results[0];
    assert.match(task.task.target, /APIサーバー|システム開発|API/);
    assert.equal(task.task.domain.primary?.id, 'G29');
    assert.equal(out.result.judgment.lens_routing.per_task[task.task.id].primary?.id, 'G29');
    assert.ok(out.result.five_stage.tasks.some((item) => item.task_id === task.task.id && item.lens_id === 'G29'));
    assert.equal(out.result.judgment['08_reinstruction'].decision_basis.lens_ids.includes('G29'), true);
  });
});

test('five-pillar public order remains Fact/Risk/Multi/Inquiry/Compare', async () => {
  await withEngine(async (engine) => {
    const out = await engine.process({ question: 'APIサーバーを改善する。' }, tenant);
    assert.deepEqual(out.result.five_stage.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    assert.equal(out.result.judgment.order.length, 8);
  });
});
