'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function executorError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

class CanonicalTaskExecutor {
  constructor(options = {}) {
    this.size = positiveInteger(options.size, 4);
    this.timeoutMs = positiveInteger(options.timeoutMs, 10_000);
    this.maxQueue = positiveInteger(options.maxQueue, Math.max(this.size * 8, 32));
    this.maxTransportRetries = Number.isInteger(options.maxTransportRetries)
      ? Math.max(0, options.maxTransportRetries)
      : 1;
    this.workerFile = options.workerFile || path.join(__dirname, '..', 'canonical-task-worker.js');
    this.workerFactory = options.workerFactory || ((workerFile) => new Worker(workerFile));
    this.logger = options.logger || null;
    this.queue = [];
    this.slots = [];
    this.sequence = 0;
    this.destroyed = false;
  }

  _log(type, payload = {}) {
    if (typeof this.logger?.write !== 'function') return;
    try {
      this.logger.write({ type, text: type, payload });
    } catch {
      // Observability must never become execution authority.
    }
  }

  _ensureWorkers() {
    if (this.destroyed) return;
    while (this.slots.length < this.size) this._spawnSlot();
  }

  _spawnSlot() {
    const worker = this.workerFactory(this.workerFile);
    const slot = { worker, ready: false, busy: false, current: null, retired: false };
    this.slots.push(slot);

    worker.once('online', () => {
      slot.ready = true;
      this._drain();
    });
    worker.on('message', (message) => this._handleMessage(slot, message));
    worker.on('error', (error) => this._retireSlot(slot, executorError(
      'WORKER_CRASH',
      error?.message || 'canonical task worker crashed',
      { cause: error }
    )));
    worker.on('exit', (code) => {
      if (slot.retired || this.destroyed) return;
      if (code !== 0) {
        this._retireSlot(slot, executorError('WORKER_CRASH', `canonical task worker exited with code ${code}`));
      } else {
        this._retireSlot(slot, executorError('WORKER_EXITED', 'canonical task worker exited unexpectedly'));
      }
    });
  }

  _removeSlot(slot) {
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
  }

  _retireSlot(slot, error) {
    if (slot.retired) return;
    slot.retired = true;
    const current = slot.current;
    slot.current = null;
    slot.busy = false;
    slot.ready = false;
    this._removeSlot(slot);
    try { void slot.worker.terminate(); } catch {}

    if (current) {
      clearTimeout(current.timer);
      current.cleanupAbort?.();
      if (current.transportRetries < this.maxTransportRetries && !current.signal?.aborted && !this.destroyed) {
        current.transportRetries += 1;
        current.timer = null;
        current.cleanupAbort = null;
        this._armQueuedAbort(current);
        this.queue.unshift(current);
        this._log('canonical_task_transport_retry', { job_id: current.id, retries: current.transportRetries, error_code: error.code });
      } else {
        current.reject(error);
      }
    }

    if (!this.destroyed) {
      this._ensureWorkers();
      this._drain();
    }
  }

  _handleMessage(slot, message) {
    const current = slot.current;
    if (!current || message?.job_id !== current.id) return;
    clearTimeout(current.timer);
    current.cleanupAbort?.();
    slot.current = null;
    slot.busy = false;

    if (message.ok === true) current.resolve(message.result);
    else {
      const error = executorError(
        message?.error?.code || 'WORKER_TASK_FAILED',
        message?.error?.message || 'canonical task worker failed',
        { worker_error: message?.error || null }
      );
      current.reject(error);
    }
    this._drain();
  }

  _armQueuedAbort(job) {
    if (!job.signal) return;
    const onAbort = () => this._cancelQueued(job);
    job.signal.addEventListener('abort', onAbort, { once: true });
    job.cleanupAbort = () => job.signal.removeEventListener('abort', onAbort);
  }

  _cancelQueued(job, reason = 'Task cancelled before execution') {
    const index = this.queue.indexOf(job);
    if (index < 0) return;
    this.queue.splice(index, 1);
    job.cleanupAbort?.();
    job.cleanupAbort = null;
    job.reject(executorError('TASK_CANCELLED', reason));
  }

  _cancelRunning(slot, job, reason = 'Task cancelled during execution') {
    if (slot.current !== job) return;
    clearTimeout(job.timer);
    job.cleanupAbort?.();
    slot.current = null;
    slot.busy = false;
    job.reject(executorError('TASK_CANCELLED', reason));
    this._removeSlot(slot);
    slot.retired = true;
    try { void slot.worker.terminate(); } catch {}
    if (!this.destroyed) {
      this._ensureWorkers();
      this._drain();
    }
  }

  _start(slot, job) {
    if (job.signal?.aborted) {
      job.reject(executorError('TASK_CANCELLED', 'Task cancelled before execution'));
      this._drain();
      return;
    }

    slot.busy = true;
    slot.current = job;
    const onAbort = () => this._cancelRunning(slot, job);
    if (job.signal) {
      job.signal.addEventListener('abort', onAbort, { once: true });
      job.cleanupAbort = () => job.signal.removeEventListener('abort', onAbort);
    }
    job.timer = setTimeout(() => {
      if (slot.current !== job) return;
      job.cleanupAbort?.();
      slot.current = null;
      slot.busy = false;
      job.reject(executorError('TASK_TIMEOUT', `Canonical task exceeded ${job.timeoutMs}ms`, { timeout_ms: job.timeoutMs }));
      this._removeSlot(slot);
      slot.retired = true;
      try { void slot.worker.terminate(); } catch {}
      if (!this.destroyed) {
        this._ensureWorkers();
        this._drain();
      }
    }, job.timeoutMs);

    try {
      slot.worker.postMessage({ job_id: job.id, operation: job.operation, payload: job.payload });
    } catch (error) {
      clearTimeout(job.timer);
      job.cleanupAbort?.();
      slot.current = null;
      slot.busy = false;
      job.reject(executorError('SERIALIZATION_ERROR', error?.message || 'Worker payload could not be serialized', { cause: error }));
      this._drain();
    }
  }

  _drain() {
    if (this.destroyed) return;
    this._ensureWorkers();
    for (const slot of this.slots) {
      if (!this.queue.length) break;
      if (!slot.ready || slot.busy || slot.retired) continue;
      const job = this.queue.shift();
      job.cleanupAbort?.();
      job.cleanupAbort = null;
      if (job.signal?.aborted) {
        job.reject(executorError('TASK_CANCELLED', 'Task cancelled before execution'));
        continue;
      }
      this._start(slot, job);
    }
  }

  exec(operation, payload, options = {}) {
    if (this.destroyed) return Promise.reject(executorError('EXECUTOR_DESTROYED', 'Canonical task executor is destroyed'));
    const active = this.slots.filter((slot) => slot.busy).length;
    const dispatchableSlots = Math.max(0, this.size - active);
    if (this.queue.length >= this.maxQueue + dispatchableSlots) {
      return Promise.reject(executorError('POOL_EXHAUSTED', `Canonical task queue limit ${this.maxQueue} exceeded`));
    }
    const signal = options.signal || null;
    if (signal?.aborted) return Promise.reject(executorError('TASK_CANCELLED', 'Task cancelled before queueing'));

    return new Promise((resolve, reject) => {
      const job = {
        id: `canonical-job-${++this.sequence}`,
        operation,
        payload,
        resolve,
        reject,
        signal,
        timeoutMs: positiveInteger(options.timeoutMs, this.timeoutMs),
        transportRetries: 0,
        timer: null,
        cleanupAbort: null
      };
      this._armQueuedAbort(job);
      this.queue.push(job);
      this._drain();
    });
  }

  stats() {
    return {
      size: this.size,
      workers: this.slots.length,
      ready: this.slots.filter((slot) => slot.ready).length,
      busy: this.slots.filter((slot) => slot.busy).length,
      queued: this.queue.length,
      destroyed: this.destroyed
    };
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const error = executorError('EXECUTOR_DESTROYED', 'Canonical task executor destroyed');
    for (const job of this.queue.splice(0)) {
      job.cleanupAbort?.();
      job.reject(error);
    }
    const workers = this.slots.splice(0);
    await Promise.allSettled(workers.map(async (slot) => {
      slot.retired = true;
      if (slot.current) {
        clearTimeout(slot.current.timer);
        slot.current.cleanupAbort?.();
        slot.current.reject(error);
        slot.current = null;
      }
      await slot.worker.terminate();
    }));
  }
}

module.exports = { CanonicalTaskExecutor, executorError };
