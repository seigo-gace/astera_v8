'use strict';

const { parentPort } = require('node:worker_threads');
const { projectCanonicalTask } = require('./canonical-task-projection');
const { evaluateCanonicalTaskPlan, deterministicPerspectiveExpansion } = require('./canonical-claim-runtime');

if (!parentPort) throw new Error('canonical-task-worker must run inside Worker Threads');

function serializeError(error) {
  return {
    name: String(error?.name || 'Error'),
    code: String(error?.code || 'WORKER_TASK_FAILED'),
    message: String(error?.message || 'Canonical task worker failed')
  };
}

function evaluateCanonicalTask(payload = {}) {
  const task = payload.task;
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    const error = new TypeError('canonical task evaluation requires task object');
    error.code = 'INVALID_CANONICAL_TASK';
    throw error;
  }
  if (!task.canonical_plan || typeof task.canonical_plan !== 'object') {
    const error = new Error(`Task ${task.id || '-'} is missing canonical_plan`);
    error.code = 'CANONICAL_PLAN_MISSING';
    throw error;
  }
  const canonical = evaluateCanonicalTaskPlan(task.canonical_plan, payload.evidenceRaw);
  const perspectiveExpansion = deterministicPerspectiveExpansion({
    task,
    canonical,
    domain: task.domain || {}
  });
  return { canonical, perspective_expansion: perspectiveExpansion };
}

parentPort.on('message', (message) => {
  const jobId = message?.job_id;
  try {
    const payload = message.payload || {};
    let result;
    if (message?.operation === 'PROJECT_CANONICAL_TASK') {
      result = projectCanonicalTask({
        task: payload.task,
        evidenceRaw: payload.evidenceRaw
      });
    } else if (message?.operation === 'EVALUATE_CANONICAL_TASK') {
      result = evaluateCanonicalTask(payload);
    } else {
      const error = new Error(`Unsupported canonical worker operation: ${message?.operation || '-'}`);
      error.code = 'UNSUPPORTED_WORKER_OPERATION';
      throw error;
    }
    parentPort.postMessage({ job_id: jobId, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ job_id: jobId, ok: false, error: serializeError(error) });
  }
});
