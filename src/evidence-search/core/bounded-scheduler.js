'use strict';

function withTimeout(promise, ms, label, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = 'PROVIDER_TIMEOUT';
      reject(error);
    }, ms);
    const abort = () => {
      clearTimeout(timer);
      const error = new Error(`${label} cancelled`);
      error.code = 'SEARCH_CANCELLED';
      reject(error);
    };
    if (signal?.aborted) return abort();
    signal?.addEventListener?.('abort', abort, { once: true });
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); resolve(value); },
      (error) => { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); reject(error); }
    );
  });
}

class BoundedScheduler {
  constructor(options = {}) {
    this.globalConcurrency = Math.max(1, Number(options.globalConcurrency || 8));
    this.perProviderConcurrency = Math.max(1, Number(options.perProviderConcurrency || 2));
  }

  async run(tasks, context = {}) {
    const queue = [...tasks];
    const activeByProvider = new Map();
    const results = [];
    let active = 0;
    return new Promise((resolve) => {
      const drain = () => {
        if (!queue.length && active === 0) return resolve(results);
        let started = false;
        for (let i = 0; i < queue.length && active < this.globalConcurrency;) {
          const task = queue[i];
          const current = activeByProvider.get(task.provider.provider_id) || 0;
          if (current >= this.perProviderConcurrency) { i += 1; continue; }
          queue.splice(i, 1);
          started = true;
          active += 1;
          activeByProvider.set(task.provider.provider_id, current + 1);
          const startedAt = Date.now();
          const timeoutMs = Math.max(1, Math.min(task.timeout_ms, context.remaining_ms?.() || task.timeout_ms));
          withTimeout(task.run(), timeoutMs, task.provider.provider_id, context.signal)
            .then((value) => results.push({ status: 'FULFILLED', provider: task.provider, value, duration_ms: Date.now() - startedAt }))
            .catch((error) => results.push({ status: 'REJECTED', provider: task.provider, error, duration_ms: Date.now() - startedAt }))
            .finally(() => {
              active -= 1;
              activeByProvider.set(task.provider.provider_id, Math.max(0, (activeByProvider.get(task.provider.provider_id) || 1) - 1));
              drain();
            });
        }
        if (!started && active === 0 && queue.length) {
          const impossible = queue.shift();
          results.push({ status: 'REJECTED', provider: impossible.provider, error: Object.assign(new Error('scheduler deadlock prevented'), { code: 'SCHEDULER_DEADLOCK' }), duration_ms: 0 });
          drain();
        }
      };
      drain();
    });
  }
}

module.exports = { BoundedScheduler };
