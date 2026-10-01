'use strict';

const path = require('node:path');
const { CanonicalTaskExecutor } = require('./canonical-task-executor');

const FIVE_STAGE = Object.freeze(['fact', 'risk', 'multi', 'inquiry', 'compare']);
const OPERATION = Object.freeze({
  fact: 'PROJECT_FACT_LANE',
  risk: 'PROJECT_RISK_LANE',
  multi: 'PROJECT_MULTI_LANE',
  inquiry: 'PROJECT_INQUIRY_LANE',
  compare: 'PROJECT_COMPARE_LANE'
});

class FiveStageExecutor {
  constructor(options = {}) {
    this.probeDelayMs = Math.max(0, Number(options.probeDelayMs || 0));
    this.executor = new CanonicalTaskExecutor({
      size: 5,
      timeoutMs: options.timeoutMs || 10_000,
      maxQueue: options.maxQueue || 40,
      maxTransportRetries: options.maxTransportRetries,
      workerFile: options.workerFile || path.join(__dirname, 'five-stage-worker.js'),
      workerFactory: options.workerFactory,
      logger: options.logger || null
    });
  }

  get size() {
    return this.executor.size;
  }

  async exec({ task, canonical }, options = {}) {
    const externalSignal = options.signal || null;
    const controller = new AbortController();
    const relayAbort = () => controller.abort(externalSignal?.reason);
    if (externalSignal) {
      if (externalSignal.aborted) relayAbort();
      else externalSignal.addEventListener('abort', relayAbort, { once: true });
    }

    try {
      const jobs = FIVE_STAGE.map((lane) => this.executor.exec(
        OPERATION[lane],
        { task, canonical, probeDelayMs: this.probeDelayMs },
        { signal: controller.signal, timeoutMs: options.timeoutMs }
      ).catch((error) => {
        controller.abort(error);
        throw error;
      }));
      const projected = await Promise.all(jobs);
      const lanes = { lens_plan: task?.domain?.lens_plan || null };
      const telemetry = [];
      for (const item of projected) {
        lanes[item.lane] = item.value;
        telemetry.push({ lane: item.lane, ...item.telemetry });
      }
      return {
        lanes,
        lane_execution: {
          mode: 'FIVE_STAGE_PARALLEL_WORKER_THREADS',
          lane_count: FIVE_STAGE.length,
          worker_pool_size: this.executor.size,
          lane_order: [...FIVE_STAGE],
          telemetry
        }
      };
    } finally {
      if (externalSignal) externalSignal.removeEventListener('abort', relayAbort);
    }
  }

  stats() {
    return this.executor.stats();
  }

  async destroy() {
    await this.executor.destroy();
  }
}

module.exports = { FiveStageExecutor, FIVE_STAGE };
