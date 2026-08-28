'use strict';

const { canonicalConcurrency, positiveInteger } = require('./concurrency-policy');

function admissionError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

class CanonicalTaskAdmission {
  constructor(options = {}) {
    this.limit = canonicalConcurrency(options.limit);
    this.maxQueue = positiveInteger(options.maxQueue, Math.max(this.limit * 8, 32));
    this.active = 0;
    this.queue = [];
    this.sequence = 0;
    this.destroyed = false;
    this.metrics = {
      admitted: 0,
      completed: 0,
      rejected: 0,
      cancelled: 0,
      maximum_active: 0,
      maximum_queued: 0
    };
  }

  _cancelQueued(job) {
    const index = this.queue.indexOf(job);
    if (index < 0) return;
    this.queue.splice(index, 1);
    job.cleanupAbort?.();
    job.cleanupAbort = null;
    this.metrics.cancelled += 1;
    job.reject(admissionError('TASK_CANCELLED', 'Task cancelled while waiting for canonical admission'));
  }

  _dispatch() {
    if (this.destroyed) return;
    while (this.active < this.limit && this.queue.length) {
      const job = this.queue.shift();
      job.cleanupAbort?.();
      job.cleanupAbort = null;
      if (job.signal?.aborted) {
        this.metrics.cancelled += 1;
        job.reject(admissionError('TASK_CANCELLED', 'Task cancelled before canonical admission'));
        continue;
      }
      this.active += 1;
      this.metrics.admitted += 1;
      this.metrics.maximum_active = Math.max(this.metrics.maximum_active, this.active);
      Promise.resolve()
        .then(() => job.run(job.signal))
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active -= 1;
          this.metrics.completed += 1;
          this._dispatch();
        });
    }
  }

  run(run, options = {}) {
    if (typeof run !== 'function') return Promise.reject(new TypeError('CanonicalTaskAdmission.run requires a function'));
    if (this.destroyed) return Promise.reject(admissionError('ADMISSION_DESTROYED', 'Canonical task admission is destroyed'));
    const signal = options.signal || null;
    if (signal?.aborted) return Promise.reject(admissionError('TASK_CANCELLED', 'Task cancelled before canonical admission'));
    if (this.active >= this.limit && this.queue.length >= this.maxQueue) {
      this.metrics.rejected += 1;
      return Promise.reject(admissionError('TASK_QUEUE_FULL', `Canonical task queue limit ${this.maxQueue} exceeded`));
    }

    return new Promise((resolve, reject) => {
      const job = {
        id: `canonical-admission-${++this.sequence}`,
        run,
        resolve,
        reject,
        signal,
        cleanupAbort: null
      };
      if (signal) {
        const onAbort = () => this._cancelQueued(job);
        signal.addEventListener('abort', onAbort, { once: true });
        job.cleanupAbort = () => signal.removeEventListener('abort', onAbort);
      }
      this.queue.push(job);
      this.metrics.maximum_queued = Math.max(this.metrics.maximum_queued, this.queue.length);
      this._dispatch();
    });
  }

  stats() {
    return {
      limit: this.limit,
      active: this.active,
      queued: this.queue.length,
      max_queue: this.maxQueue,
      destroyed: this.destroyed,
      ...this.metrics
    };
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const error = admissionError('ADMISSION_DESTROYED', 'Canonical task admission destroyed');
    for (const job of this.queue.splice(0)) {
      job.cleanupAbort?.();
      job.reject(error);
    }
  }
}

let globalAdmission = null;

function getGlobalCanonicalTaskAdmission(options = {}) {
  if (!globalAdmission || globalAdmission.destroyed) {
    globalAdmission = new CanonicalTaskAdmission(options);
  }
  return globalAdmission;
}

async function destroyGlobalCanonicalTaskAdmission() {
  const admission = globalAdmission;
  globalAdmission = null;
  if (admission) await admission.destroy();
}

module.exports = {
  CanonicalTaskAdmission,
  admissionError,
  getGlobalCanonicalTaskAdmission,
  destroyGlobalCanonicalTaskAdmission
};
