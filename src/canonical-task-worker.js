'use strict';

const { parentPort } = require('node:worker_threads');
const { projectCanonicalTask } = require('./canonical-task-projection');

if (!parentPort) throw new Error('canonical-task-worker must run inside Worker Threads');

function serializeError(error) {
  return {
    name: String(error?.name || 'Error'),
    code: String(error?.code || 'WORKER_TASK_FAILED'),
    message: String(error?.message || 'Canonical task worker failed')
  };
}

parentPort.on('message', (message) => {
  const jobId = message?.job_id;
  try {
    if (message?.operation !== 'PROJECT_CANONICAL_TASK') {
      const error = new Error(`Unsupported canonical worker operation: ${message?.operation || '-'}`);
      error.code = 'UNSUPPORTED_WORKER_OPERATION';
      throw error;
    }
    const payload = message.payload || {};
    const result = projectCanonicalTask({
      task: payload.task,
      evidenceRaw: payload.evidenceRaw
    });
    parentPort.postMessage({ job_id: jobId, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ job_id: jobId, ok: false, error: serializeError(error) });
  }
});
