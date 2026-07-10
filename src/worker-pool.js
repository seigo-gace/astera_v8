'use strict';

const path = require('node:path');
const { Worker } = require('node:worker_threads');

class WorkerPool {
  constructor(size = 4, { timeoutMs = Number(process.env.ASTERA_WORKER_TIMEOUT_MS || process.env.KAGURA_WORKER_TIMEOUT_MS || 10_000) } = {}) {
    this.size = Math.max(1, Number(size) || 4);
    this.timeoutMs = Math.max(1000, Number(timeoutMs) || 10_000);
    this.nextId = 1;
    this.queue = [];
    this.workers = [];
    this.shuttingDown = false;
    for (let i = 0; i < this.size; i += 1) this._spawn();
  }

  _spawn() {
    const worker = new Worker(path.join(__dirname, 'pillars', 'pool-runner.js'));
    const slot = { worker, busy: false, current: null, dead: false };
    worker.on('message', (message) => this._onMessage(slot, message));
    worker.on('error', (error) => this._onCrash(slot, error));
    worker.on('exit', (code) => {
      if (this.shuttingDown) return;
      if (code !== 0) this._onCrash(slot, new Error(`Worker exited with code ${code}`));
    });
    this.workers.push(slot);
  }

  _finish(slot) {
    if (slot.current?.timer) clearTimeout(slot.current.timer);
    slot.busy = false;
    slot.current = null;
    this._drain();
  }

  _onMessage(slot, message) {
    const current = slot.current;
    if (!current) return;
    if (message.id !== current.id) return;
    if (message.ok) current.resolve(message.result);
    else current.reject(new Error(message.error || 'Worker failed'));
    this._finish(slot);
  }

  _onCrash(slot, error) {
    if (this.shuttingDown || slot.dead) return;
    slot.dead = true;
    const idx = this.workers.indexOf(slot);
    if (idx >= 0) this.workers.splice(idx, 1);
    if (slot.current) {
      if (slot.current.timer) clearTimeout(slot.current.timer);
      slot.current.reject(error);
      slot.current = null;
    }
    slot.busy = false;
    void slot.worker.terminate().catch(() => {});
    this._spawn();
    this._drain();
  }

  exec(workerName, payload) {
    if (this.shuttingDown) return Promise.reject(new Error('WorkerPool is shutting down'));
    return new Promise((resolve, reject) => {
      this.queue.push({ id: this.nextId++, workerName, payload, resolve, reject, timer: null });
      this._drain();
    });
  }

  _drain() {
    for (const slot of this.workers) {
      if (!this.queue.length) break;
      if (slot.busy) continue;
      const job = this.queue.shift();
      slot.busy = true;
      slot.current = job;
      job.timer = setTimeout(() => {
        const err = new Error(`Worker timeout: ${job.workerName}`);
        this._onCrash(slot, err);
      }, this.timeoutMs);
      slot.worker.postMessage({ id: job.id, workerName: job.workerName, payload: job.payload });
    }
  }

  async destroy() {
    this.shuttingDown = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      if (job.timer) clearTimeout(job.timer);
      job.reject(new Error('WorkerPool is shutting down'));
    }
    for (const slot of this.workers) if (slot.current?.timer) clearTimeout(slot.current.timer);
    await Promise.allSettled(this.workers.map((slot) => slot.worker.terminate()));
    this.workers = [];
  }
}

module.exports = WorkerPool;
