'use strict';

const { canonicalConcurrency, positiveInteger } = require('./concurrency-policy');
const { getGlobalCanonicalTaskAdmission } = require('./canonical-task-admission');

function graphError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizeWaves(tasks = [], executionWaves = []) {
  if (!Array.isArray(tasks)) throw graphError('INVALID_TASK_LIST', 'tasks must be an array');
  if (executionWaves !== undefined && executionWaves !== null && !Array.isArray(executionWaves)) {
    throw graphError('INVALID_EXECUTION_WAVES', 'execution_waves must be an array');
  }
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task) || !String(task.id || '').trim()) {
      throw graphError('INVALID_TASK', 'Each task must be an object with a non-empty id');
    }
    if (task.depends_on !== undefined && !Array.isArray(task.depends_on)) {
      throw graphError('INVALID_TASK_DEPENDENCIES', `Task ${task.id} depends_on must be an array`);
    }
  }
  const taskIds = tasks.map((task) => String(task.id));
  const taskSet = new Set(taskIds);
  if (taskSet.size !== taskIds.length) throw graphError('DUPLICATE_TASK_ID', 'Task IDs must be unique');

  const declared = Array.isArray(executionWaves) ? executionWaves : [];
  if (!declared.length) {
    const hasDependencies = tasks.some((task) => (task.depends_on || []).length);
    if (hasDependencies) throw graphError('MISSING_EXECUTION_WAVES', 'Dependency graph requires explicit execution_waves');
    return taskIds.length ? [taskIds] : [];
  }

  const seen = new Set();
  const waveIndex = new Map();
  const waves = declared.map((wave, index) => {
    if (!Array.isArray(wave) || !wave.length) throw graphError('INVALID_EXECUTION_WAVE', `Wave ${index + 1} must be a non-empty array`);
    return wave.map((id) => {
      const taskId = String(id);
      if (!taskSet.has(taskId)) throw graphError('UNKNOWN_TASK_IN_WAVE', `Unknown task ${taskId} in execution_waves`);
      if (seen.has(taskId)) throw graphError('DUPLICATE_TASK_IN_WAVES', `Task ${taskId} appears in multiple waves`);
      seen.add(taskId);
      waveIndex.set(taskId, index);
      return taskId;
    });
  });

  const omitted = taskIds.filter((id) => !seen.has(id));
  if (omitted.length) throw graphError('TASK_OMITTED_FROM_WAVES', `Tasks omitted from execution_waves: ${omitted.join(', ')}`);

  for (const task of tasks) {
    for (const dependencyRaw of task.depends_on || []) {
      const dependency = String(dependencyRaw);
      if (!taskSet.has(dependency)) throw graphError('UNKNOWN_DEPENDENCY', `Task ${task.id} depends on unknown task ${dependency}`);
      if (waveIndex.get(dependency) >= waveIndex.get(String(task.id))) {
        throw graphError('INVALID_DEPENDENCY_WAVE_ORDER', `Dependency ${dependency} must execute before task ${task.id}`);
      }
    }
  }
  return waves;
}

async function mapBounded(items, maximumConcurrency, mapper) {
  if (!items.length) return [];
  const requested = maximumConcurrency === null || maximumConcurrency === undefined
    ? items.length
    : positiveInteger(maximumConcurrency, items.length);
  const limit = Math.min(items.length, canonicalConcurrency(requested));
  const output = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(runners);
  return output;
}

async function executeTaskWaves({ tasks, executionWaves, runTask, signal = null, maxConcurrency = 8, admission }) {
  if (typeof runTask !== 'function') throw new TypeError('runTask must be a function');
  const effectiveAdmission = admission === undefined ? getGlobalCanonicalTaskAdmission() : admission;
  if (effectiveAdmission && typeof effectiveAdmission.run !== 'function') throw new TypeError('admission.run must be a function');
  const waves = normalizeWaves(tasks, executionWaves);
  const byId = new Map(tasks.map((task) => [String(task.id), task]));
  const originalIndex = new Map(tasks.map((task, index) => [String(task.id), index]));
  const waveIndex = new Map();
  for (let index = 0; index < waves.length; index += 1) {
    for (const taskId of waves[index]) waveIndex.set(taskId, index);
  }

  const dependents = new Map(tasks.map((task) => [String(task.id), []]));
  const remainingDependencies = new Map();
  for (const task of tasks) {
    const taskId = String(task.id);
    const dependencies = (task.depends_on || []).map(String);
    remainingDependencies.set(taskId, dependencies.length);
    for (const dependency of dependencies) dependents.get(dependency).push(taskId);
  }

  const results = new Map();
  const failures = new Map();
  const skipped = new Map();
  const settled = new Set();
  const effectiveConcurrency = canonicalConcurrency(maxConcurrency);
  const ready = [];
  const waveTiming = waves.map(() => ({ started_at: null, ended_at: null }));
  let active = 0;
  let completed = 0;

  const enqueueReady = (taskId) => {
    ready.push(taskId);
    ready.sort((left, right) => originalIndex.get(left) - originalIndex.get(right));
  };
  for (const task of tasks) {
    if ((remainingDependencies.get(String(task.id)) || 0) === 0) enqueueReady(String(task.id));
  }

  const touchWaveStart = (taskId, now = Date.now()) => {
    const index = waveIndex.get(taskId) || 0;
    const timing = waveTiming[index];
    if (timing.started_at === null) timing.started_at = now;
  };
  const touchWaveEnd = (taskId, now = Date.now()) => {
    const index = waveIndex.get(taskId) || 0;
    const timing = waveTiming[index];
    if (timing.started_at === null) timing.started_at = now;
    timing.ended_at = Math.max(timing.ended_at || now, now);
  };

  if (signal?.aborted) throw graphError('REQUEST_CANCELLED', 'Request cancelled before task execution', { status: 499 });

  await new Promise((resolve, reject) => {
    let finished = false;

    const cleanupAbort = () => {
      if (signal && onAbort) signal.removeEventListener('abort', onAbort);
    };
    const finishResolve = () => {
      if (finished) return;
      finished = true;
      cleanupAbort();
      resolve();
    };
    const finishReject = (error) => {
      if (finished) return;
      finished = true;
      cleanupAbort();
      reject(error);
    };
    const onAbort = () => finishReject(graphError('REQUEST_CANCELLED', 'Request cancelled during task execution', { status: 499 }));
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    const releaseDependents = (taskId) => {
      for (const dependentId of dependents.get(taskId) || []) {
        const remaining = Math.max(0, Number(remainingDependencies.get(dependentId) || 0) - 1);
        remainingDependencies.set(dependentId, remaining);
        if (remaining !== 0 || settled.has(dependentId)) continue;
        const dependent = byId.get(dependentId);
        const failedDependencies = (dependent.depends_on || []).map(String)
          .filter((dependency) => failures.has(dependency) || skipped.has(dependency));
        if (failedDependencies.length) {
          const now = Date.now();
          touchWaveStart(dependentId, now);
          const skippedResult = {
            task_id: dependentId,
            status: 'SKIPPED_DEPENDENCY',
            failed_dependencies: failedDependencies
          };
          skipped.set(dependentId, skippedResult);
          settled.add(dependentId);
          completed += 1;
          touchWaveEnd(dependentId, now);
          releaseDependents(dependentId);
        } else {
          enqueueReady(dependentId);
        }
      }
    };

    const settleTask = (taskId) => {
      if (settled.has(taskId)) return;
      settled.add(taskId);
      completed += 1;
      touchWaveEnd(taskId);
      releaseDependents(taskId);
    };

    const dispatch = () => {
      if (finished) return;
      if (signal?.aborted) {
        finishReject(graphError('REQUEST_CANCELLED', 'Request cancelled during task execution', { status: 499 }));
        return;
      }
      while (!finished && active < effectiveConcurrency && ready.length) {
        const taskId = ready.shift();
        if (settled.has(taskId)) continue;
        const task = byId.get(taskId);
        const declaredWave = waveIndex.get(taskId) || 0;
        touchWaveStart(taskId);
        active += 1;
        const execute = () => runTask(task, { wave_index: declaredWave, signal });
        const running = effectiveAdmission
          ? effectiveAdmission.run(execute, { signal })
          : Promise.resolve().then(execute);
        Promise.resolve(running).then(
          (value) => {
            results.set(taskId, value);
          },
          (error) => {
            if (error?.code === 'TASK_CANCELLED' && signal?.aborted) {
              finishReject(graphError('REQUEST_CANCELLED', 'Request cancelled during task execution', { status: 499 }));
              return;
            }
            failures.set(taskId, error);
          }
        ).finally(() => {
          active = Math.max(0, active - 1);
          if (finished) return;
          settleTask(taskId);
          if (completed === tasks.length) {
            finishResolve();
            return;
          }
          dispatch();
        });
      }
      if (!finished && completed === tasks.length) finishResolve();
      if (!finished && active === 0 && ready.length === 0 && completed < tasks.length) {
        finishReject(graphError('TASK_GRAPH_STALLED', 'Task graph made no progress while unresolved tasks remain'));
      }
    };

    dispatch();
  });

  if (signal?.aborted) throw graphError('REQUEST_CANCELLED', 'Request cancelled during task execution', { status: 499 });

  const timings = waves.map((wave, waveNo) => {
    const timing = waveTiming[waveNo];
    const startedAt = timing.started_at;
    const endedAt = timing.ended_at;
    return {
      wave_index: waveNo,
      task_ids: [...wave],
      duration_ms: startedAt === null || endedAt === null ? 0 : Math.max(0, endedAt - startedAt),
      maximum_concurrency: Math.min(wave.length, effectiveConcurrency),
      fulfilled: wave.filter((taskId) => results.has(taskId)).length,
      rejected: wave.filter((taskId) => failures.has(taskId)).length,
      skipped: wave.filter((taskId) => skipped.has(taskId)).length
    };
  });

  return {
    waves,
    results,
    failures,
    skipped,
    timings,
    ordered: tasks.map((task) => ({
      task,
      result: results.get(String(task.id)) || null,
      error: failures.get(String(task.id)) || null,
      skipped: skipped.get(String(task.id)) || null
    }))
  };
}

module.exports = { normalizeWaves, executeTaskWaves, graphError, mapBounded };
