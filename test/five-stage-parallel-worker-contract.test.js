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


test('parallel and serial Fact lanes preserve identical source-owned unverified verification targets', async()=>{
  const sourceText='Task 1 — Establish facts: Audit dated maps, original shipping ledger and archival custody. Identify dates, scope and primary records.';
  const domain=routeDomainTemplates({question:sourceText,context:''});
  const taskBase={
    id:'T01',request_id:'R01',action:'verify',target:'historical claim',
    purpose:'Verify an archival chronology without inventing facts',
    objective:'Audit original archival records and unresolved provenance',
    source_span:{start:0,end:sourceText.length,text:sourceText},raw_text:sourceText,
    premises:[],constraints:[],prohibitions:[],preserve:[],replace:[],
    conditions:[],exceptions:[],depends_on:[],domain
  };
  const task={...taskBase,canonical_plan:buildCanonicalTaskPlan(taskBase,domain)};
  const outputs=[];
  for(const enableFiveStageParallel of [false,true]){
    const executor=new CanonicalTaskExecutor({size:1,timeoutMs:8000,
      enableFiveStageParallel,logger:silentLogger});
    try{
      outputs.push(await executor.exec('PROJECT_CANONICAL_TASK',{
        task,evidenceRaw:rejectedEvidence(task.id)
      }));
    }finally{await executor.destroy();}
  }
  const serial=outputs[0].lanes.fact.verification_targets;
  const parallel=outputs[1].lanes.fact.verification_targets;
  assert.equal(serial.length,1);
  assert.deepEqual(parallel,serial,
    'the parallel Worker must not silently discard Task source semantics');
  assert.deepEqual(outputs[1].public_lanes.fact.verification_targets,serial,
    'public projection must preserve source-owned unverified Fact targets');
  assert.equal(serial[0].status,'UNVERIFIED');
  assert.equal(serial[0].request_id,'R01');
});
