'use strict';
const { parentPort } = require('node:worker_threads');
parentPort.on('message', async (message) => {
  const { job_id: jobId, payload } = message;
  if (payload?.crash) process.exit(17);
  if (payload?.delay) await new Promise((resolve) => setTimeout(resolve, payload.delay));
  if (payload?.fail) return parentPort.postMessage({ job_id: jobId, ok: false, error: { code: payload.fail, message: payload.fail } });
  parentPort.postMessage({ job_id: jobId, ok: true, result: { id: payload.id, value: payload.value ?? payload.id } });
});
