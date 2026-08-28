'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { destroyGlobalCanonicalTaskAdmission } = require('../src/runtime/canonical-task-admission');

const tenant = { id: 'decision-materials-load', is_global: true, plan: 'admin' };
const silentLogger = { write() {} };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function rejectedEvidence(taskId) {
  return {
    schema_version: 'astera.evidence-search.result.v1',
    task_id: taskId,
    status: 'REJECTED_PROVIDER_FAILURE',
    effective_as_of: '2026-08-26T00:00:00.000Z',
    evidence: [],
    coverage: { discovery_scope_state: 'UNKNOWN' },
    quality: {
      initial: { status: 'REJECTED_PROVIDER_FAILURE', phase: 'INITIAL', score_bp: 0, blocking_reasons: ['PROVIDER_FAILURE'] },
      reinforcement_attempt_count: 0,
      new_corroboration_count: 0,
      final: { status: 'REJECTED_PROVIDER_FAILURE', phase: 'FINAL', score_bp: 0, blocking_reasons: ['PROVIDER_FAILURE'] }
    },
    query_execution: { initial: [], reinforcement: [] },
    provider_execution: {
      initial: [{ provider_id: 'decision-materials-load-fixture', status: 'FAILED', error_code: 'LOAD_FIXTURE' }],
      reinforcement: []
    },
    ai_used: false,
    payment_executed: false
  };
}

function buildPrepared(engine, count, prefix = 'L') {
  const seed = engine.prepareRequest({ question: 'FixtureAPIは有効である。', language: 'ja' });
  const template = seed.analysis_task_packet.tasks[0];
  const tasks = Array.from({ length: count }, (_, index) => {
    const id = `${prefix}${String(index + 1).padStart(3, '0')}`;
    const rawText = `FixtureAPI${index + 1}は有効である。`;
    return {
      ...template,
      id,
      source_span: { start: index * 32, end: index * 32 + rawText.length, text: rawText },
      raw_text: rawText,
      action: 'verify',
      target: `FixtureAPI${index + 1}`,
      objective: `FixtureAPI${index + 1}の状態を検証する。`,
      purpose: `FixtureAPI${index + 1}の状態を検証する。`,
      order: index + 1,
      depends_on: [],
      parallelizable: true,
      parallel_group: 'LOAD-FIXTURE',
      premises: [],
      constraints: [],
      prohibitions: [],
      preserve: [],
      replace: [],
      conditions: [],
      exceptions: [],
      deliverables: [],
      success_criteria: ['未確認をCONFIRMEDへ推測昇格しない。'],
      completion_criteria: ['未確認をCONFIRMEDへ推測昇格しない。'],
      verification: [],
      unresolved: [],
      hard_blockers: [],
      evidence_need: { required: true, reasons: ['load-fixture'], queries: [] }
    };
  });
  return {
    ...seed,
    instruction_understanding: {
      ...(seed.instruction_understanding || {}),
      execution_allowed: true,
      blocked_reasons: []
    },
    analysis_task_packet: {
      ...seed.analysis_task_packet,
      tasks,
      dependencies: [],
      execution_waves: [tasks.map((task) => task.id)],
      branches: [],
      branch_groups: [],
      unresolved: [],
      conflicts: [],
      hard_blockers: [],
      source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span })),
      task_graph_validation: { valid: true, cycle: [] }
    }
  };
}

class DecisionMaterialsLoadEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    this.evidenceActive = 0;
    this.maximumEvidenceActive = 0;
    this.evidenceStarts = 0;
    this.evidenceDelayMs = options.evidenceDelayMs || 4;
    this._fixturePrepared = null;
    this._fixtureByQuestion = new Map();
  }

  setFixturePrepared(prepared, question) {
    if (question) this._fixtureByQuestion.set(String(question), prepared);
    else this._fixturePrepared = prepared;
  }

  prepareRequest(input = {}) {
    const keyed = this._fixtureByQuestion.get(String(input.question || ''));
    if (keyed) return keyed;
    if (this._fixturePrepared) return this._fixturePrepared;
    return super.prepareRequest(input);
  }

  async resolveEvidenceForTask({ task }) {
    this.evidenceActive += 1;
    this.evidenceStarts += 1;
    this.maximumEvidenceActive = Math.max(this.maximumEvidenceActive, this.evidenceActive);
    try {
      await sleep(this.evidenceDelayMs);
      return rejectedEvidence(task.id);
    } finally {
      this.evidenceActive -= 1;
    }
  }
}

for (const count of [8, 9, 20, 50, 100]) {
  test(`decision-materials completes ${count} Task load with hard Task concurrency <= 8 and default CPU worker pool 4`, async () => {
    await destroyGlobalCanonicalTaskAdmission();
    const engine = new DecisionMaterialsLoadEngine({ logger: silentLogger });
    try {
      const question = `${count} Task load fixture`;
      const preparedRequest = buildPrepared(engine, count, `N${count}-`);
      engine.setFixturePrepared(preparedRequest, question);
      const out = await engine.process({ question }, tenant);
      assert.equal(out.result.type, 'cognitive_map');
      assert.equal(out.result.task_results.length, count);
      assert.equal(out.result.parallel_execution.pool_size, 4);
      assert.equal(engine.evidenceStarts, count);
      assert.equal(engine.maximumEvidenceActive, Math.min(8, count));
      assert.ok(out.result.task_results.every((entry) => entry.canonical.undetermined_count >= 1));
      assert.equal(out.result.comparison.selected_candidate, null);
      assert.deepEqual(out.result.comparison.candidate_ranking, []);
      assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
    } finally {
      await engine.destroy();
    }
  });
}

test('simultaneous decision-material requests share the same server-wide maximum of 8 Task bodies', async () => {
  await destroyGlobalCanonicalTaskAdmission();
  const engine = new DecisionMaterialsLoadEngine({ logger: silentLogger, evidenceDelayMs: 8 });
  try {
    const requests = [
      buildPrepared(engine, 20, 'A-'),
      buildPrepared(engine, 20, 'B-'),
      buildPrepared(engine, 20, 'C-')
    ];
    const outputs = await Promise.all(requests.map((preparedRequest, index) => {
      const question = `simultaneous request ${index + 1}`;
      engine.setFixturePrepared(preparedRequest, question);
      return engine.process({ question }, tenant);
    }));

    assert.equal(outputs.reduce((sum, out) => sum + out.result.task_results.length, 0), 60);
    assert.equal(engine.evidenceStarts, 60);
    assert.equal(engine.maximumEvidenceActive, 8);
    assert.ok(outputs.every((out) => out.result.parallel_execution.pool_size === 4));
    assert.ok(outputs.every((out) => out.result.decision_authority === 'EXTERNAL_ONLY'));
  } finally {
    await engine.destroy();
  }
});
