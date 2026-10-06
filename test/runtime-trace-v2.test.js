'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const AsteraEngine = require('../src/astera-engine');
const Logger = require('../src/logger');
const {
  TRACE_SCHEMA,
  REQUIRED_SPANS
} = require('../src/runtime/runtime-trace');

function spanMap(trace) {
  return new Map((trace?.spans || []).map((span) => [span.name, span]));
}

function createTraceTestEngine() {
  return new AsteraEngine({
    evidenceSearchClient: null,
    logger: new Logger({ tgsEnabled: false })
  });
}

test('public Astera runtime emits complete asterav8 runtime-trace v2 without changing decision authority', async (t) => {
  const engine = createTraceTestEngine();
  t.after(async () => engine.destroy());

  const out = await engine.process({
    question: '[G10] Compare option A and option B. Show risks, missing evidence, opposing conditions, and comparison dimensions. Do not select a winner.',
    language: 'en',
    output_language: 'en'
  }, { id: 'runtime-trace-contract-test' });

  assert.equal(out?.result?.type, 'cognitive_map');
  assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
  assert.equal(out.result.no_normative_decision_generated, true);
  assert.equal(out.result.comparison?.selected_candidate, null);
  assert.deepEqual(out.result.comparison?.candidate_ranking || [], []);

  const trace = out.result.runtime_trace;
  assert.ok(trace, 'complete trace must be attached to public result');
  assert.equal(trace.schema_version, TRACE_SCHEMA);
  assert.equal(trace.status, 'COMPLETE');
  assert.deepEqual(trace.missing_spans, []);
  assert.deepEqual(trace.required_spans, [...REQUIRED_SPANS]);
  assert.equal(out.runtime.runtime_trace_status, 'COMPLETE');
  assert.equal(out.runtime.runtime_trace_schema, TRACE_SCHEMA);

  const spans = spanMap(trace);
  assert.deepEqual([...spans.keys()], [...REQUIRED_SPANS]);
  for (const name of REQUIRED_SPANS) {
    const span = spans.get(name);
    assert.ok(span, `missing trace span: ${name}`);
    assert.equal(typeof span.external_wait, 'boolean');
    assert.ok(Array.isArray(span.error_state));
    assert.ok(Array.isArray(span.fallback_state));
    assert.ok(Array.isArray(span.measurement_state));
    assert.ok(span.cache && Number.isFinite(span.cache.hit) && Number.isFinite(span.cache.miss) && Number.isFinite(span.cache.unknown));
    assert.ok(span.counts && typeof span.counts === 'object');
    if (span.wall_time_ms !== null) assert.ok(span.wall_time_ms >= 0, `${name} wall_time_ms must be non-negative`);
    if (span.queue_wait_ms !== null) assert.ok(span.queue_wait_ms >= 0, `${name} queue_wait_ms must be non-negative`);
    if (span.cpu_time_ms !== null) assert.ok(span.cpu_time_ms >= 0, `${name} cpu_time_ms must be non-negative`);
  }

  assert.equal(spans.get('parser_wait').measurement_state.includes('NOT_APPLICABLE'), true);
  assert.equal(spans.get('evidence_bind').measurement_state.includes('CONTAINED_IN_CANONICAL_EVALUATION'), true);
  assert.equal(spans.get('canonical_cpu').measurement_state.includes('WORKER_WALL_INCLUSIVE'), true);
  for (const lane of ['fact_lane', 'risk_lane', 'multi_lane', 'inquiry_lane', 'compare_lane']) {
    assert.equal(spans.get(lane).measurement_state.includes('WORKER_TELEMETRY'), true, `${lane} must come from worker telemetry`);
  }
  assert.ok(spans.get('total').wall_time_ms >= 0);
  assert.ok(trace.counts.task_count >= 1);
  assert.ok(trace.counts.claim_count >= 1);
});

test('runtime trace keeps optional external waits explicit instead of fabricating durations', async (t) => {
  const engine = createTraceTestEngine();
  t.after(async () => engine.destroy());

  const out = await engine.process({
    question: '[G01] Review this project plan and identify the material risks and missing information.',
    language: 'en',
    output_language: 'en'
  }, { id: 'runtime-trace-no-external-wait-test' });

  const trace = out?.result?.runtime_trace;
  assert.ok(trace);
  const spans = spanMap(trace);
  const parserWait = spans.get('parser_wait');
  assert.ok(parserWait);
  assert.equal(parserWait.wall_time_ms, 0);
  assert.equal(parserWait.external_wait, false);
  assert.equal(parserWait.measurement_state.includes('NOT_APPLICABLE'), true);

  const evidenceWait = spans.get('evidence_wait');
  assert.ok(evidenceWait);
  if (evidenceWait.measurement_state.includes('NOT_APPLICABLE')) {
    assert.equal(evidenceWait.wall_time_ms, 0);
    assert.equal(evidenceWait.external_wait, false);
  } else {
    assert.equal(evidenceWait.external_wait, true);
    assert.ok(evidenceWait.wall_time_ms >= 0);
  }
});
