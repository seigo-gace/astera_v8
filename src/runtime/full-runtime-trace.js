'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const TRACE_SCHEMA_VERSION = 'astera.runtime-trace.v2';
const LANE_TELEMETRY = Symbol.for('astera.runtime.lane.telemetry');
const storage = new AsyncLocalStorage();

const REQUIRED_SPANS = Object.freeze([
  'ingest',
  'source_graph',
  'language_detection',
  'parser_wait',
  'semantic_atoms',
  'case_graph',
  'lens_route',
  'claim_extract',
  'evidence_plan',
  'evidence_wait',
  'evidence_bind',
  'canonical_cpu',
  'fact_lane',
  'risk_lane',
  'multi_lane',
  'inquiry_lane',
  'compare_lane',
  'main8_render',
  'public_normalize',
  'total'
]);

function nowNs() {
  return process.hrtime.bigint();
}

function elapsedMs(startedNs, finishedNs = nowNs()) {
  return Number(finishedNs - startedNs) / 1e6;
}

function roundMs(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Number(number.toFixed(3)) : 0;
}

function createContext() {
  return {
    started_ns: nowNs(),
    observations: new Map(),
    evidence_attempted: false
  };
}

function currentContext() {
  return storage.getStore() || null;
}

function pushObservation(name, observation = {}) {
  const context = currentContext();
  if (!context) return;
  const list = context.observations.get(name) || [];
  list.push({
    duration_ms: roundMs(observation.duration_ms),
    execution_kind: observation.execution_kind || 'CPU',
    status: observation.status || 'OBSERVED',
    measurement: observation.measurement || 'OBSERVED',
    source: observation.source || null,
    started_ns: observation.started_ns || null,
    finished_ns: observation.finished_ns || null
  });
  context.observations.set(name, list);
}

function runWithRuntimeTrace(fn) {
  return storage.run(createContext(), fn);
}

function measureSync(name, fn, options = {}) {
  const startedNs = nowNs();
  try {
    return fn();
  } finally {
    const finishedNs = nowNs();
    pushObservation(name, {
      duration_ms: elapsedMs(startedNs, finishedNs),
      execution_kind: options.execution_kind || 'CPU',
      status: options.status || 'OBSERVED',
      source: options.source || null,
      started_ns: startedNs,
      finished_ns: finishedNs
    });
  }
}

async function measureAsync(name, fn, options = {}) {
  const startedNs = nowNs();
  try {
    return await fn();
  } finally {
    const finishedNs = nowNs();
    pushObservation(name, {
      duration_ms: elapsedMs(startedNs, finishedNs),
      execution_kind: options.execution_kind || 'CPU',
      status: options.status || 'OBSERVED',
      source: options.source || null,
      started_ns: startedNs,
      finished_ns: finishedNs
    });
  }
}

function recordEvidenceWait(startedNs, result) {
  const state = String(result?.search_state || result?.search_execution?.status || '').toUpperCase();
  const context = currentContext();
  if (context) context.evidence_attempted = context.evidence_attempted || state !== 'NOT_EXECUTED';
  if (!state || state === 'NOT_EXECUTED' || state === 'NOT_REQUIRED') {
    pushObservation('evidence_wait', {
      duration_ms: 0,
      execution_kind: 'NETWORK',
      status: 'NOT_INVOKED',
      measurement: 'OBSERVED',
      source: `search_state:${state || 'UNKNOWN'}`
    });
    return;
  }
  const finishedNs = nowNs();
  pushObservation('evidence_wait', {
    duration_ms: elapsedMs(startedNs, finishedNs),
    execution_kind: 'NETWORK',
    status: 'OBSERVED',
    measurement: 'OBSERVED',
    source: `search_state:${state}`,
    started_ns: startedNs,
    finished_ns: finishedNs
  });
}

function attachLaneTelemetry(lanes, laneExecution) {
  if (!lanes || typeof lanes !== 'object') return lanes;
  const telemetry = Array.isArray(laneExecution?.telemetry) ? laneExecution.telemetry : [];
  for (const item of telemetry) {
    const lane = String(item?.lane || '');
    const value = lanes[lane];
    if (!value || typeof value !== 'object') continue;
    Object.defineProperty(value, LANE_TELEMETRY, {
      value: Object.freeze({ ...item }),
      enumerable: false,
      configurable: false,
      writable: false
    });
  }
  return lanes;
}

function findParserTransport(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (value.astera_mcp_transport && typeof value.astera_mcp_transport === 'object') {
    const trace = value.astera_mcp_transport;
    if (Number.isFinite(Number(trace.latency_ms))) return trace;
  }
  for (const child of Object.values(value)) {
    const found = findParserTransport(child, seen);
    if (found) return found;
  }
  return null;
}

function observedSpan(name, durationMs, executionKind, options = {}) {
  return Object.freeze({
    name,
    duration_ms: roundMs(durationMs),
    execution_kind: executionKind,
    status: options.status || 'OBSERVED',
    measurement: options.measurement || 'OBSERVED',
    source: options.source || null
  });
}

function aggregateObservation(context, name, executionKind = 'CPU') {
  const list = context?.observations?.get(name) || [];
  if (!list.length) return null;
  const observed = list.filter((item) => item.status === 'OBSERVED');
  const duration = observed.reduce((sum, item) => sum + Number(item.duration_ms || 0), 0);
  const status = observed.length ? 'OBSERVED' : list[0].status;
  return observedSpan(name, duration, list[0].execution_kind || executionKind, {
    status,
    measurement: observed.length ? 'OBSERVED' : (list[0].measurement || 'OBSERVED'),
    source: uniqueSources(list)
  });
}

function uniqueSources(list) {
  const values = [...new Set((list || []).map((item) => item.source).filter(Boolean))];
  return values.length ? values.join('|') : null;
}

function laneSpan(out, lane, publicField) {
  const telemetry = [];
  for (const task of out?.result?.task_results || []) {
    const value = task?.[publicField];
    const item = value && typeof value === 'object' ? value[LANE_TELEMETRY] : null;
    if (item) telemetry.push(item);
  }
  if (!telemetry.length) {
    return observedSpan(`${lane}_lane`, 0, 'WORKER', {
      status: 'NOT_INVOKED',
      measurement: 'OBSERVED',
      source: 'five_stage_worker_telemetry_absent'
    });
  }
  const starts = telemetry.map((item) => Number(item.started_at_ms)).filter(Number.isFinite);
  const finishes = telemetry.map((item) => Number(item.finished_at_ms)).filter(Number.isFinite);
  let duration;
  let measurement;
  if (starts.length === telemetry.length && finishes.length === telemetry.length) {
    duration = Math.max(...finishes) - Math.min(...starts);
    measurement = 'OBSERVED_WALL_ENVELOPE';
  } else {
    duration = telemetry.reduce((max, item) => Math.max(max, Number(item.duration_ms || 0)), 0);
    measurement = 'OBSERVED_MAX_WORKER_DURATION';
  }
  return observedSpan(`${lane}_lane`, duration, 'WORKER', {
    measurement,
    source: 'five_stage_worker_telemetry'
  });
}

function canonicalCpuSpan(out) {
  const timings = out?.runtime?.parallel_execution?.timings || [];
  const duration = timings.reduce((sum, item) => sum + Number(item?.duration_ms || 0), 0);
  return observedSpan('canonical_cpu', duration, 'CPU', {
    status: timings.length ? 'OBSERVED' : 'NOT_INVOKED',
    measurement: timings.length ? 'OBSERVED_WAVE_WALL' : 'OBSERVED',
    source: 'canonical_wave_executor'
  });
}

function coalescedSpan(name, parent, executionKind = 'CPU') {
  return observedSpan(name, 0, executionKind, {
    status: 'COALESCED',
    measurement: 'COALESCED_IN_PARENT',
    source: parent
  });
}

function buildRuntimeTrace(out) {
  const context = currentContext();
  const parser = findParserTransport(out?.result?.request_model || null);
  const parserMs = Number(parser?.latency_ms || 0);
  const prepare = aggregateObservation(context, 'prepare_base');
  const prepareMs = Number(prepare?.duration_ms || 0);
  const sourceGraphMs = Math.max(0, prepareMs - parserMs);
  const ingest = aggregateObservation(context, 'ingest') || observedSpan('ingest', 0, 'CPU', { status: 'NOT_INVOKED', source: 'standalone_normalizer' });
  const caseGraph = aggregateObservation(context, 'case_graph') || observedSpan('case_graph', 0, 'CPU', { status: 'NOT_INVOKED', source: 'universal_case_graph' });
  const evidenceWait = aggregateObservation(context, 'evidence_wait', 'NETWORK') || observedSpan('evidence_wait', 0, 'NETWORK', { status: 'NOT_INVOKED', source: 'evidence_search' });
  const main8Render = aggregateObservation(context, 'main8_render') || observedSpan('main8_render', 0, 'CPU', { status: 'NOT_INVOKED', source: 'five_lane_main8_renderer' });
  const publicNormalize = aggregateObservation(context, 'public_normalize') || observedSpan('public_normalize', 0, 'CPU', { status: 'NOT_INVOKED', source: 'main8_public_normalizer' });
  const totalMs = context?.started_ns ? elapsedMs(context.started_ns) : 0;

  const spans = [
    ingest,
    observedSpan('source_graph', sourceGraphMs, 'CPU', {
      status: prepare ? 'OBSERVED' : 'NOT_INVOKED',
      measurement: parser ? 'DERIVED_PREPARE_MINUS_PARSER_WAIT' : 'OBSERVED_PREPARE',
      source: 'prepare_request'
    }),
    coalescedSpan('language_detection', 'source_graph'),
    observedSpan('parser_wait', parserMs, 'NETWORK', {
      status: parser ? 'OBSERVED' : 'NOT_INVOKED',
      measurement: parser ? 'OBSERVED' : 'OBSERVED',
      source: parser ? `japanese_parser_${parser.transport || 'transport'}` : 'parser_not_required'
    }),
    parser
      ? coalescedSpan('semantic_atoms', 'parser_wait')
      : coalescedSpan('semantic_atoms', 'source_graph'),
    caseGraph,
    coalescedSpan('lens_route', 'canonical_cpu'),
    coalescedSpan('claim_extract', 'canonical_cpu'),
    coalescedSpan('evidence_plan', 'canonical_cpu'),
    evidenceWait,
    coalescedSpan('evidence_bind', evidenceWait.status === 'OBSERVED' ? 'evidence_wait' : 'canonical_cpu'),
    canonicalCpuSpan(out),
    laneSpan(out, 'fact', 'facts'),
    laneSpan(out, 'risk', 'risks'),
    laneSpan(out, 'multi', 'multi'),
    laneSpan(out, 'inquiry', 'inquiry'),
    laneSpan(out, 'compare', 'comparison'),
    main8Render,
    publicNormalize,
    observedSpan('total', totalMs, 'CPU', {
      measurement: 'OBSERVED_WALL',
      source: 'astera_engine_process'
    })
  ];

  const byName = Object.freeze(Object.fromEntries(spans.map((span) => [span.name, span])));
  return Object.freeze({
    schema_version: TRACE_SCHEMA_VERSION,
    required_spans: [...REQUIRED_SPANS],
    spans: Object.freeze(spans),
    by_name: byName,
    path: Object.freeze({
      parser: parser ? String(parser.transport || 'unknown').toUpperCase() : 'NOT_INVOKED',
      evidence: evidenceWait.status === 'OBSERVED' ? 'EXECUTED' : 'NOT_INVOKED',
      five_lane_workers: spans.filter((span) => span.execution_kind === 'WORKER' && span.status === 'OBSERVED').length === 5
        ? 'OBSERVED'
        : 'PARTIAL_OR_NOT_INVOKED'
    }),
    accounting: Object.freeze({
      spans_are_not_assumed_additive: true,
      network_wait_excluded_from_canonical_cpu: true,
      worker_spans_may_overlap: true,
      coalesced_spans_claim_independent_timing: false
    })
  });
}

function validateRuntimeTrace(trace) {
  const errors = [];
  if (!trace || trace.schema_version !== TRACE_SCHEMA_VERSION) errors.push('SCHEMA_VERSION');
  const names = new Set((trace?.spans || []).map((span) => span?.name));
  for (const required of REQUIRED_SPANS) if (!names.has(required)) errors.push(`MISSING_SPAN:${required}`);
  for (const span of trace?.spans || []) {
    if (!['CPU', 'NETWORK', 'WORKER'].includes(span?.execution_kind)) errors.push(`EXECUTION_KIND:${span?.name || '-'}`);
    if (!Number.isFinite(Number(span?.duration_ms)) || Number(span.duration_ms) < 0) errors.push(`DURATION:${span?.name || '-'}`);
    if (!['OBSERVED', 'NOT_INVOKED', 'COALESCED'].includes(span?.status)) errors.push(`STATUS:${span?.name || '-'}`);
  }
  if (trace?.by_name?.total?.status !== 'OBSERVED') errors.push('TOTAL_NOT_OBSERVED');
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

module.exports = {
  TRACE_SCHEMA_VERSION,
  REQUIRED_SPANS,
  LANE_TELEMETRY,
  nowNs,
  runWithRuntimeTrace,
  measureSync,
  measureAsync,
  recordEvidenceWait,
  attachLaneTelemetry,
  buildRuntimeTrace,
  validateRuntimeTrace
};
