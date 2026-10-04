'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const { performance } = require('node:perf_hooks');

const TRACE_SCHEMA = 'astera.runtime-trace.v2';
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

const storage = new AsyncLocalStorage();
const WRAPPED = Symbol.for('astera.runtimeTraceWrapped');
let instrumentationInstalled = false;

function round(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Number(Number(value).toFixed(3));
}

function mergeCounts(left = {}, right = {}) {
  const next = { ...left };
  for (const [key, value] of Object.entries(right || {})) {
    if (Number.isFinite(Number(value))) next[key] = Number(next[key] || 0) + Number(value);
    else if (value !== undefined) next[key] = value;
  }
  return next;
}

function unique(values = []) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && String(value).trim() !== '').map(String))];
}

class RuntimeTrace {
  constructor(meta = {}) {
    this.startedAt = performance.now();
    this.meta = { ...meta };
    this.spans = new Map();
    this.finalized = false;
  }

  record(name, measurement = {}) {
    if (!REQUIRED_SPANS.includes(name) || this.finalized) return;
    const current = this.spans.get(name) || {
      name,
      wall_time_ms: 0,
      queue_wait_ms: 0,
      cpu_time_ms: 0,
      external_wait: false,
      cache: { hit: 0, miss: 0, unknown: 0 },
      counts: {},
      error_state: [],
      fallback_state: [],
      measurement_state: [],
      invocations: 0
    };
    const wall = round(measurement.wall_time_ms);
    const queue = round(measurement.queue_wait_ms);
    const cpu = round(measurement.cpu_time_ms);
    if (wall !== null) current.wall_time_ms = round(Number(current.wall_time_ms || 0) + wall);
    if (queue === null) current.queue_wait_ms = null;
    else if (current.queue_wait_ms !== null) current.queue_wait_ms = round(Number(current.queue_wait_ms || 0) + queue);
    if (cpu === null) current.cpu_time_ms = null;
    else if (current.cpu_time_ms !== null) current.cpu_time_ms = round(Number(current.cpu_time_ms || 0) + cpu);
    current.external_wait = current.external_wait || measurement.external_wait === true;
    current.cache.hit += Number(measurement.cache_hit || 0);
    current.cache.miss += Number(measurement.cache_miss || 0);
    current.cache.unknown += Number(measurement.cache_unknown ?? 1);
    current.counts = mergeCounts(current.counts, measurement.counts || {});
    current.error_state = unique([...current.error_state, ...(measurement.error_state ? [measurement.error_state] : [])]);
    current.fallback_state = unique([...current.fallback_state, ...(measurement.fallback_state ? [measurement.fallback_state] : [])]);
    current.measurement_state = unique([...current.measurement_state, measurement.measurement_state || 'MEASURED']);
    current.invocations += Number(measurement.invocations || 1);
    this.spans.set(name, current);
  }

  measureSync(name, fn, measurement = {}) {
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    try {
      return fn();
    } catch (error) {
      measurement = { ...measurement, error_state: error?.code || error?.name || 'ERROR' };
      throw error;
    } finally {
      const cpu = process.cpuUsage(cpuStarted);
      this.record(name, {
        ...measurement,
        wall_time_ms: performance.now() - started,
        cpu_time_ms: (cpu.user + cpu.system) / 1000,
        queue_wait_ms: measurement.queue_wait_ms ?? 0
      });
    }
  }

  async measureAsync(name, fn, measurement = {}) {
    const started = performance.now();
    try {
      return await fn();
    } catch (error) {
      measurement = { ...measurement, error_state: error?.code || error?.name || 'ERROR' };
      throw error;
    } finally {
      this.record(name, {
        ...measurement,
        wall_time_ms: performance.now() - started,
        cpu_time_ms: measurement.cpu_time_ms ?? null,
        queue_wait_ms: measurement.queue_wait_ms ?? null
      });
    }
  }

  markNotApplicable(name, reason = 'STAGE_NOT_REACHED') {
    if (this.spans.has(name)) return;
    this.record(name, {
      wall_time_ms: 0,
      queue_wait_ms: 0,
      cpu_time_ms: 0,
      cache_unknown: 0,
      invocations: 0,
      fallback_state: reason,
      measurement_state: 'NOT_APPLICABLE'
    });
  }

  has(name) {
    return this.spans.has(name);
  }

  finalize(meta = {}) {
    if (this.finalized) return this.document;
    const totalMs = performance.now() - this.startedAt;
    this.record('total', {
      wall_time_ms: totalMs,
      queue_wait_ms: 0,
      cpu_time_ms: null,
      cache_unknown: 0,
      counts: meta.counts || {},
      measurement_state: 'MEASURED'
    });
    const missing = REQUIRED_SPANS.filter((name) => !this.spans.has(name));
    const ordered = REQUIRED_SPANS.map((name) => this.spans.get(name) || {
      name,
      wall_time_ms: null,
      queue_wait_ms: null,
      cpu_time_ms: null,
      external_wait: false,
      cache: { hit: 0, miss: 0, unknown: 0 },
      counts: {},
      error_state: [],
      fallback_state: ['INSTRUMENTATION_MISSING'],
      measurement_state: ['NOT_OBSERVED'],
      invocations: 0
    });
    this.document = Object.freeze({
      schema_version: TRACE_SCHEMA,
      status: missing.length ? 'PARTIAL' : 'COMPLETE',
      required_spans: [...REQUIRED_SPANS],
      missing_spans: missing,
      request: { ...this.meta, ...(meta.request || {}) },
      counts: { ...(meta.counts || {}) },
      spans: ordered
    });
    this.finalized = true;
    return this.document;
  }
}

function activeTrace() {
  return storage.getStore() || null;
}

function runWithTrace(trace, fn) {
  return storage.run(trace, fn);
}

function traceSync(name, fn, measurement = {}) {
  const trace = activeTrace();
  return trace ? trace.measureSync(name, fn, measurement) : fn();
}

function traceAsync(name, fn, measurement = {}) {
  const trace = activeTrace();
  return trace ? trace.measureAsync(name, fn, measurement) : Promise.resolve().then(fn);
}

function wrapFunction(target, key, spanName, measurementFactory = null) {
  const original = target?.[key];
  if (typeof original !== 'function' || original[WRAPPED]) return;
  const wrapped = function wrappedRuntimeTraceFunction(...args) {
    const measurement = typeof measurementFactory === 'function' ? (measurementFactory(args) || {}) : {};
    const trace = activeTrace();
    if (!trace) return original.apply(this, args);
    const started = performance.now();
    const cpuStarted = process.cpuUsage();
    try {
      const value = original.apply(this, args);
      if (value && typeof value.then === 'function') {
        return Promise.resolve(value).then(
          (result) => {
            trace.record(spanName, {
              ...measurement,
              wall_time_ms: performance.now() - started,
              cpu_time_ms: null,
              queue_wait_ms: measurement.queue_wait_ms ?? null
            });
            return result;
          },
          (error) => {
            trace.record(spanName, {
              ...measurement,
              wall_time_ms: performance.now() - started,
              cpu_time_ms: null,
              queue_wait_ms: measurement.queue_wait_ms ?? null,
              error_state: error?.code || error?.name || 'ERROR'
            });
            throw error;
          }
        );
      }
      const cpu = process.cpuUsage(cpuStarted);
      trace.record(spanName, {
        ...measurement,
        wall_time_ms: performance.now() - started,
        cpu_time_ms: (cpu.user + cpu.system) / 1000,
        queue_wait_ms: measurement.queue_wait_ms ?? 0
      });
      return value;
    } catch (error) {
      const cpu = process.cpuUsage(cpuStarted);
      trace.record(spanName, {
        ...measurement,
        wall_time_ms: performance.now() - started,
        cpu_time_ms: (cpu.user + cpu.system) / 1000,
        queue_wait_ms: measurement.queue_wait_ms ?? 0,
        error_state: error?.code || error?.name || 'ERROR'
      });
      throw error;
    }
  };
  Object.defineProperty(wrapped, WRAPPED, { value: true });
  target[key] = wrapped;
}

function installRuntimeTraceInstrumentation() {
  if (instrumentationInstalled) return;
  instrumentationInstalled = true;

  const japaneseParser = require('../japanese-parser-mcp-client');
  wrapFunction(japaneseParser, 'needsJapaneseParser', 'language_detection', () => ({ cache_unknown: 0 }));

  const sourceGraph = require('./universal-source-graph');
  const originalBuildSourceGraph = sourceGraph.buildSourceGraph;
  const originalBuildSemanticAtoms = sourceGraph.buildSemanticAtoms;
  sourceGraph.buildUniversalSourceUnderstanding = function tracedUniversalSourceUnderstanding(input, languageHint = '') {
    const source = traceSync('source_graph', () => originalBuildSourceGraph(input, languageHint), {
      counts: { source_chars: String(input ?? '').length },
      cache_unknown: 0
    });
    const semantic = traceSync('semantic_atoms', () => originalBuildSemanticAtoms(source), {
      counts: { source_nodes: source?.nodes?.length || 0 },
      cache_unknown: 0
    });
    const trace = activeTrace();
    if (trace) {
      const atomCount = semantic?.atoms?.length || 0;
      const span = trace.spans.get('semantic_atoms');
      if (span) span.counts = mergeCounts(span.counts, { semantic_atoms: atomCount });
    }
    return { source_graph: source, semantic_atoms: semantic };
  };

  const universalCase = require('./universal-case-graph');
  wrapFunction(universalCase, 'applyUniversalCaseGraph', 'case_graph', (args) => ({
    counts: { source_chars: String(args?.[1]?.question ?? '').length },
    cache_unknown: 0
  }));

  const domainRouter = require('../domain-template-router');
  wrapFunction(domainRouter, 'routeDomainTemplates', 'lens_route', () => ({ cache_unknown: 0 }));

  const claimExtractor = require('../v4-canonical/claim-extractor');
  wrapFunction(claimExtractor, 'extractClaimsForTask', 'claim_extract', (args) => ({
    counts: { task_calls: args?.[0] ? 1 : 0 },
    cache_unknown: 0
  }));

  const queryPlanner = require('../v4-canonical/query-planner');
  wrapFunction(queryPlanner, 'planTaskQueries', 'evidence_plan', (args) => ({
    counts: { claims_planned: Array.isArray(args?.[0]) ? args[0].length : 0 },
    cache_unknown: 0
  }));

  const canonicalV4 = require('../canonical-v4-engine');
  wrapFunction(canonicalV4, 'prepareJapaneseRequestViaMcp', 'parser_wait', () => ({
    external_wait: true,
    cache_unknown: 1,
    measurement_state: 'EXTERNAL_WAIT'
  }));

  const { FiveStageExecutor } = require('./five-stage-executor');
  if (!FiveStageExecutor.prototype.exec[WRAPPED]) {
    const originalFiveStageExec = FiveStageExecutor.prototype.exec;
    const wrappedFiveStageExec = async function tracedFiveStageExec(...args) {
      const result = await originalFiveStageExec.apply(this, args);
      const trace = activeTrace();
      if (trace) {
        for (const item of result?.lane_execution?.telemetry || []) {
          const name = `${item.lane}_lane`;
          trace.record(name, {
            wall_time_ms: Number(item.duration_ms || 0),
            queue_wait_ms: null,
            cpu_time_ms: null,
            cache_unknown: 0,
            counts: { worker_invocations: 1 },
            measurement_state: 'WORKER_TELEMETRY'
          });
        }
      }
      return result;
    };
    Object.defineProperty(wrappedFiveStageExec, WRAPPED, { value: true });
    FiveStageExecutor.prototype.exec = wrappedFiveStageExec;
  }

  const { CanonicalTaskExecutor } = require('./canonical-task-executor');
  if (CanonicalTaskExecutor && !CanonicalTaskExecutor.prototype._execSingle[WRAPPED]) {
    const originalExecSingle = CanonicalTaskExecutor.prototype._execSingle;
    const wrappedExecSingle = function tracedCanonicalExec(operation, payload, options = {}) {
      if (operation !== 'EVALUATE_CANONICAL_TASK') return originalExecSingle.call(this, operation, payload, options);
      const trace = activeTrace();
      if (!trace) return originalExecSingle.call(this, operation, payload, options);
      const started = performance.now();
      return Promise.resolve(originalExecSingle.call(this, operation, payload, options)).then(
        (value) => {
          const wall = performance.now() - started;
          const counts = { claims: payload?.task?.canonical_plan?.claims?.length || 0 };
          trace.record('canonical_cpu', {
            wall_time_ms: wall,
            queue_wait_ms: null,
            cpu_time_ms: null,
            cache_unknown: 0,
            counts,
            measurement_state: 'WORKER_WALL_INCLUSIVE'
          });
          trace.record('evidence_bind', {
            wall_time_ms: wall,
            queue_wait_ms: null,
            cpu_time_ms: null,
            cache_unknown: 0,
            counts,
            measurement_state: 'CONTAINED_IN_CANONICAL_EVALUATION'
          });
          return value;
        },
        (error) => {
          const wall = performance.now() - started;
          const state = error?.code || error?.name || 'ERROR';
          trace.record('canonical_cpu', { wall_time_ms: wall, queue_wait_ms: null, cpu_time_ms: null, cache_unknown: 0, error_state: state, measurement_state: 'WORKER_WALL_INCLUSIVE' });
          trace.record('evidence_bind', { wall_time_ms: wall, queue_wait_ms: null, cpu_time_ms: null, cache_unknown: 0, error_state: state, measurement_state: 'CONTAINED_IN_CANONICAL_EVALUATION' });
          throw error;
        }
      );
    };
    Object.defineProperty(wrappedExecSingle, WRAPPED, { value: true });
    CanonicalTaskExecutor.prototype._execSingle = wrappedExecSingle;
  }
}

module.exports = {
  TRACE_SCHEMA,
  REQUIRED_SPANS,
  RuntimeTrace,
  activeTrace,
  runWithTrace,
  traceSync,
  traceAsync,
  installRuntimeTraceInstrumentation
};
