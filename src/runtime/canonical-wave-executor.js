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
  const results = new Map();
  const failures = new Map();
  const skipped = new Map();
  const timings = [];
  const effectiveConcurrency = canonicalConcurrency(maxConcurrency);

  for (let waveNo = 0; waveNo < waves.length; waveNo += 1) {
    if (signal?.aborted) throw graphError('REQUEST_CANCELLED', 'Request cancelled before next execution wave', { status: 499 });
    const wave = waves[waveNo];
    const startedAt = Date.now();
    const settled = await mapBounded(wave, effectiveConcurrency, async (taskId) => {
      if (signal?.aborted) throw graphError('REQUEST_CANCELLED', 'Request cancelled during execution wave', { status: 499 });
      const task = byId.get(taskId);
      const failedDependencies = (task.depends_on || []).filter((dependency) => failures.has(String(dependency)) || skipped.has(String(dependency)));
      if (failedDependencies.length) {
        const skippedResult = {
          task_id: taskId,
          status: 'SKIPPED_DEPENDENCY',
          failed_dependencies: failedDependencies.map(String)
        };
        skipped.set(taskId, skippedResult);
        return { taskId, status: 'skipped', value: skippedResult };
      }
      try {
        const execute = () => runTask(task, { wave_index: waveNo, signal });
        const value = effectiveAdmission
          ? await effectiveAdmission.run(execute, { signal })
          : await execute();
        results.set(taskId, value);
        return { taskId, status: 'fulfilled', value };
      } catch (error) {
        if (error?.code === 'TASK_CANCELLED' && signal?.aborted) {
          throw graphError('REQUEST_CANCELLED', 'Request cancelled during execution wave', { status: 499 });
        }
        failures.set(taskId, error);
        return { taskId, status: 'rejected', error };
      }
    });
    timings.push({
      wave_index: waveNo,
      task_ids: [...wave],
      duration_ms: Date.now() - startedAt,
      maximum_concurrency: Math.min(wave.length, effectiveConcurrency),
      fulfilled: settled.filter((item) => item.status === 'fulfilled').length,
      rejected: settled.filter((item) => item.status === 'rejected').length,
      skipped: settled.filter((item) => item.status === 'skipped').length
    });
  }

  if (signal?.aborted) throw graphError('REQUEST_CANCELLED', 'Request cancelled during task execution', { status: 499 });

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
