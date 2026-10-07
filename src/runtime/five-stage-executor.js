'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { scopeFiveStageDecisionMaterial } = require('./five-stage-public-boundary');
const { compileLensPlan } = require('../lens-plan');

const FIVE_STAGE = Object.freeze(['fact', 'risk', 'multi', 'inquiry', 'compare']);
const OPERATION = Object.freeze({
  fact: 'PROJECT_FACT_LANE',
  risk: 'PROJECT_RISK_LANE',
  multi: 'PROJECT_MULTI_LANE',
  inquiry: 'PROJECT_INQUIRY_LANE',
  compare: 'PROJECT_COMPARE_LANE'
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function stageError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

class FiveStageExecutor {
  constructor(options = {}) {
    this.timeoutMs = positiveInteger(options.timeoutMs, 10_000);
    this.maxQueuePerLane = positiveInteger(options.maxQueuePerLane || options.maxQueue, 16);
    this.probeDelayMs = Math.max(0, Number(options.probeDelayMs || 0));
    this.workerFile = options.workerFile || path.join(__dirname, 'five-stage-worker.js');
    this.workerFactory = options.workerFactory || ((workerFile) => new Worker(workerFile));
    this.logger = options.logger || null;
    this.slots = new Map();
    this.sequence = 0;
    this.destroyed = false;
  }

  get size() {
    return FIVE_STAGE.length;
  }

  _log(type, payload = {}) {
    if (typeof this.logger?.write !== 'function') return;
    try { this.logger.write({ type, text: type, payload }); } catch {}
  }

  _ensureSlot(lane) {
    if (this.destroyed) throw stageError('EXECUTOR_DESTROYED', 'Five-stage executor is destroyed');
    const existing = this.slots.get(lane);
    if (existing && !existing.retired) return existing;
    const worker = this.workerFactory(this.workerFile);
    const slot = { lane, worker, ready: false, busy: false, current: null, queue: [], retired: false };
    this.slots.set(lane, slot);
    worker.once('online', () => {
      slot.ready = true;
      this._drain(slot);
    });
    worker.on('message', (message) => this._handleMessage(slot, message));
    worker.on('error', (error) => this._retire(slot, stageError('FIVE_STAGE_WORKER_CRASH', error?.message || `Five-stage ${lane} worker crashed`, { cause: error })));
    worker.on('exit', (code) => {
      if (slot.retired || this.destroyed) return;
      this._retire(slot, stageError('FIVE_STAGE_WORKER_EXITED', `Five-stage ${lane} worker exited with code ${code}`));
    });
    return slot;
  }

  _retire(slot, error) {
    if (slot.retired) return;
    slot.retired = true;
    slot.ready = false;
    if (slot.current) {
      clearTimeout(slot.current.timer);
      slot.current.cleanupAbort?.();
      slot.current.reject(error);
      slot.current = null;
    }
    slot.busy = false;
    try { void slot.worker.terminate(); } catch {}
    const queued = slot.queue.splice(0);
    this.slots.delete(slot.lane);
    if (this.destroyed) {
      for (const job of queued) {
        job.cleanupAbort?.();
        job.reject(stageError('EXECUTOR_DESTROYED', 'Five-stage executor destroyed'));
      }
      return;
    }
    const replacement = this._ensureSlot(slot.lane);
    replacement.queue.push(...queued);
    this._drain(replacement);
    this._log('five_stage_worker_restarted', { lane: slot.lane, error_code: error.code });
  }

  _handleMessage(slot, message) {
    const job = slot.current;
    if (!job || message?.job_id !== job.id) return;
    clearTimeout(job.timer);
    job.cleanupAbort?.();
    slot.current = null;
    slot.busy = false;
    if (message.ok === true) job.resolve(message.result);
    else job.reject(stageError(
      message?.error?.code || 'FIVE_STAGE_WORKER_FAILED',
      message?.error?.message || `Five-stage ${slot.lane} worker failed`,
      { worker_error: message?.error || null, lane: slot.lane }
    ));
    this._drain(slot);
  }

  _cancelQueued(slot, job) {
    const index = slot.queue.indexOf(job);
    if (index < 0) return;
    slot.queue.splice(index, 1);
    job.cleanupAbort?.();
    job.reject(stageError('TASK_CANCELLED', `Five-stage ${slot.lane} lane cancelled before execution`));
  }

  _cancelRunning(slot, job) {
    if (slot.current !== job) return;
    clearTimeout(job.timer);
    job.cleanupAbort?.();
    slot.current = null;
    slot.busy = false;
    job.reject(stageError('TASK_CANCELLED', `Five-stage ${slot.lane} lane cancelled during execution`));
    this._retire(slot, stageError('TASK_CANCELLED', `Five-stage ${slot.lane} lane worker retired after cancellation`));
  }

  _start(slot, job) {
    if (job.signal?.aborted) {
      job.reject(stageError('TASK_CANCELLED', `Five-stage ${slot.lane} lane cancelled before execution`));
      this._drain(slot);
      return;
    }
    slot.busy = true;
    slot.current = job;
    if (job.signal) {
      const onAbort = () => this._cancelRunning(slot, job);
      job.signal.addEventListener('abort', onAbort, { once: true });
      job.cleanupAbort = () => job.signal.removeEventListener('abort', onAbort);
    }
    job.timer = setTimeout(() => {
      if (slot.current !== job) return;
      job.cleanupAbort?.();
      slot.current = null;
      slot.busy = false;
      job.reject(stageError('FIVE_STAGE_TIMEOUT', `Five-stage ${slot.lane} lane exceeded ${job.timeoutMs}ms`, { lane: slot.lane, timeout_ms: job.timeoutMs }));
      this._retire(slot, stageError('FIVE_STAGE_TIMEOUT', `Five-stage ${slot.lane} worker retired after timeout`));
    }, job.timeoutMs);
    try {
      slot.worker.postMessage({ job_id: job.id, operation: OPERATION[slot.lane], payload: job.payload });
    } catch (error) {
      clearTimeout(job.timer);
      job.cleanupAbort?.();
      slot.current = null;
      slot.busy = false;
      job.reject(stageError('SERIALIZATION_ERROR', error?.message || 'Five-stage payload could not be serialized', { lane: slot.lane }));
      this._drain(slot);
    }
  }

  _drain(slot) {
    if (this.destroyed || !slot?.ready || slot.busy || slot.retired || !slot.queue.length) return;
    const job = slot.queue.shift();
    job.cleanupAbort?.();
    job.cleanupAbort = null;
    this._start(slot, job);
  }

  _enqueue(lane, payload, options = {}) {
    const slot = this._ensureSlot(lane);
    if (slot.queue.length >= this.maxQueuePerLane) {
      return Promise.reject(stageError('POOL_EXHAUSTED', `Five-stage ${lane} queue limit ${this.maxQueuePerLane} exceeded`, { lane }));
    }
    const signal = options.signal || null;
    if (signal?.aborted) return Promise.reject(stageError('TASK_CANCELLED', `Five-stage ${lane} lane cancelled before queueing`, { lane }));
    return new Promise((resolve, reject) => {
      const job = {
        id: `five-stage-${lane}-${++this.sequence}`,
        payload,
        resolve,
        reject,
        signal,
        timeoutMs: positiveInteger(options.timeoutMs, this.timeoutMs),
        timer: null,
        cleanupAbort: null
      };
      if (signal) {
        const onAbort = () => this._cancelQueued(slot, job);
        signal.addEventListener('abort', onAbort, { once: true });
        job.cleanupAbort = () => signal.removeEventListener('abort', onAbort);
      }
      slot.queue.push(job);
      this._drain(slot);
    });
  }

  async exec({ task, canonical }, options = {}) {
    if (this.destroyed) throw stageError('EXECUTOR_DESTROYED', 'Five-stage executor is destroyed');
    const externalSignal = options.signal || null;
    const controller = new AbortController();
    const relayAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) relayAbort();
      else externalSignal.addEventListener('abort', relayAbort, { once: true });
    }
    try {
      const payload = { task, canonical, probeDelayMs: this.probeDelayMs };
      const jobs = FIVE_STAGE.map((lane) => this._enqueue(lane, payload, {
        signal: controller.signal,
        timeoutMs: options.timeoutMs
      }).catch((error) => {
        controller.abort(error);
        throw error;
      }));
      const projected = await Promise.all(jobs);
      const lensPlan = task?.domain?.lens_plan || compileLensPlan(task?.domain || {});
      const lanes = { lens_plan: lensPlan };
      const telemetry = [];
      for (const item of projected) {
        lanes[item.lane] = item.value;
        telemetry.push({ lane: item.lane, ...item.telemetry });
      }
      const publicLanes = scopeFiveStageDecisionMaterial(lanes, task, canonical);
      return {
        lanes,
        public_lanes: publicLanes,
        lane_execution: {
          mode: 'FIVE_STAGE_PARALLEL_WORKER_THREADS',
          lane_count: FIVE_STAGE.length,
          worker_pool_size: FIVE_STAGE.length,
          lane_order: [...FIVE_STAGE],
          public_material_boundary: 'FIVE_STAGE_SCOPED_COPY_BEFORE_MAIN8',
          telemetry
        }
      };
    } finally {
      if (externalSignal) externalSignal.removeEventListener('abort', relayAbort);
    }
  }

  stats() {
    return {
      size: FIVE_STAGE.length,
      destroyed: this.destroyed,
      lanes: Object.fromEntries(FIVE_STAGE.map((lane) => {
        const slot = this.slots.get(lane);
        return [lane, slot ? { ready: slot.ready, busy: slot.busy, queued: slot.queue.length } : { ready: false, busy: false, queued: 0 }];
      }))
    };
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    const slots = [...this.slots.values()];
    this.slots.clear();
    await Promise.allSettled(slots.map(async (slot) => {
      slot.retired = true;
      for (const job of slot.queue.splice(0)) {
        job.cleanupAbort?.();
        job.reject(stageError('EXECUTOR_DESTROYED', 'Five-stage executor destroyed'));
      }
      if (slot.current) {
        clearTimeout(slot.current.timer);
        slot.current.cleanupAbort?.();
        slot.current.reject(stageError('EXECUTOR_DESTROYED', 'Five-stage executor destroyed'));
        slot.current = null;
      }
      await slot.worker.terminate();
    }));
  }
}

module.exports = { FiveStageExecutor, FIVE_STAGE, stageError };