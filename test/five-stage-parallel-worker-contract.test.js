'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CanonicalTaskExecutor } = require('../src/runtime/canonical-task-executor');
const { buildCanonicalTaskPlan } = require('../src/canonical-claim-runtime');
const { routeDomainTemplates } = require('../src/domain-template-router');

const silentLogger = { write() {} };

function rejectedEvidence(taskId) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    task_id: taskId,
    status: 'REJECTED_SEARCH_NOT_EXECUTED',
    search_state: 'NOT_EXECUTED',
    evidence: [],
    coverage: { discovery_scope_state: 'NOT_EXECUTED' },
    quality: { final: { status: 'REJECTED_SEARCH_NOT_EXECUTED', score_bp: 0, blocking_reasons: ['SEARCH_NOT_EXECUTED'] } },
    provider_execution: { initial: [], reinforcement: [] },
    query_execution: { initial: [], reinforcement: [] },
    ai_used: false,
    payment_executed: false
  };
}

test('Fact/Risk/Multi/Inquiry/Compare execute on five distinct overlapping Worker Threads', async () => {
  const sourceText = 'A案とB案を作業時間と法務リスクと利用者理解で比較して。返金ポリシー文言は変えない。';
  const domain = routeDomainTemplates({ question: sourceText, context: '' });
  const baseTask = {
    id: 'T01',
    action: 'compare',
    target: 'A案とB案',
    purpose: 'FAQ更新の判断材料を作る',
    objective: 'A案とB案の差分を判断材料として整理する',
    source_span: { start: 0, end: sourceText.length, text: sourceText },
    raw_text: sourceText,
    premises: ['A案は3件追加、B案は10件追加。'],
    constraints: ['返金ポリシー文言は変えない。'],
    prohibitions: ['最終判断や推奨はしない。'],
    preserve: ['返金ポリシー文言'],
    replace: [],
    conditions: [],
    exceptions: [],
    depends_on: [],
    domain
  };
  const task = { ...baseTask, canonical_plan: buildCanonicalTaskPlan(baseTask, domain) };
  const executor = new CanonicalTaskExecutor({
    size: 1,
    timeoutMs: 5000,
    fiveStageProbeDelayMs: 400,
    logger: silentLogger
  });

  try {
    const projected = await executor.exec('PROJECT_CANONICAL_TASK', {
      task,
      evidenceRaw: rejectedEvidence(task.id)
    });
    const execution = projected.lane_execution;
    assert.equal(execution.mode, 'FIVE_STAGE_PARALLEL_WORKER_THREADS');
    assert.equal(execution.lane_count, 5);
    assert.deepEqual(execution.lane_order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    assert.equal(execution.telemetry.length, 5);

    const threadIds = new Set(execution.telemetry.map((item) => item.thread_id));
    assert.equal(threadIds.size, 5, 'each lane must run on its own worker thread');

    const latestStart = Math.max(...execution.telemetry.map((item) => item.started_at_ms));
    const earliestFinish = Math.min(...execution.telemetry.map((item) => item.finished_at_ms));
    assert.ok(latestStart < earliestFinish, `five lane intervals did not overlap: ${JSON.stringify(execution.telemetry)}`);

    for (const lane of ['fact', 'risk', 'multi', 'inquiry', 'compare']) {
      assert.ok(projected.lanes[lane], `${lane} lane result missing`);
      assert.equal(projected.lanes[lane].lane, lane);
    }
  } finally {
    await executor.destroy();
  }
});


test('task executor preserves raw five-stage lanes while carrying a separately scoped public copy', async () => {
  const sourceText = 'Verify whether Node.js 22 is supported in production using official evidence.';
  const domain = routeDomainTemplates({ question: sourceText, context: '' });
  const baseTask = {
    id: 'T01',
    action: 'verify',
    target: 'Node.js 22 production support',
    objective: 'Verify support status from official evidence',
    purpose: 'Verify support status by separating facts, risks, and evidence gaps',
    source_span: { start: 0, end: sourceText.length, text: sourceText },
    raw_text: sourceText,
    premises: [],
    constraints: [],
    prohibitions: [],
    preserve: [],
    replace: [],
    conditions: [],
    exceptions: [],
    depends_on: [],
    domain
  };
  const task = { ...baseTask, canonical_plan: buildCanonicalTaskPlan(baseTask, domain) };
  const executor = new CanonicalTaskExecutor({ size: 1, timeoutMs: 5000, logger: silentLogger });

  try {
    const projected = await executor.exec('PROJECT_CANONICAL_TASK', {
      task,
      evidenceRaw: rejectedEvidence(task.id)
    });
    assert.ok(projected.lanes?.risk?.risks?.some((item) => item.source === 'LENS_PLAN'), 'raw internal Lens risk must remain available');
    assert.ok(projected.public_lanes, 'scoped public lanes must survive the task executor boundary');
    assert.equal(projected.public_lanes.risk.risks.some((item) => item.source === 'LENS_PLAN'), false);
    assert.equal(projected.public_lanes.fact.fact_requirements.some((item) => item.source === 'LENS_PLAN'), false);
    assert.equal(projected.public_lanes.multi.perspectives.some((item) => item.source === 'LENS_PLAN'), false);
    assert.equal(projected.public_lanes.inquiry.evidence_need.includes('Code参照'), false);
  } finally {
    await executor.destroy();
  }
});
