'use strict';

const { parentPort } = require('node:worker_threads');
const { sanitize } = require('../safe-json');

const ALLOWED = new Set(['fact', 'risk', 'multi', 'inquiry', 'compare', 'dialectic']);

parentPort.on('message', async (job) => {
  try {
    if (!ALLOWED.has(job.workerName)) throw new Error(`Worker is not allowed: ${job.workerName}`);
    const mod = require(`./${job.workerName}-worker`);
    const result = await mod.run(job.payload || {});
    parentPort.postMessage({ id: job.id, ok: true, result: sanitize(result) });
  } catch (error) {
    parentPort.postMessage({ id: job.id, ok: false, error: error.message, stack: error.stack });
  }
});
