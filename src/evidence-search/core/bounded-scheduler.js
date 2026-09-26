'use strict';

const { ProviderResilienceController } = require('./provider-resilience');

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
    this.resilience = options.resilienceController || new ProviderResilienceController({
      failureThreshold: Number(options.failureThreshold || process.env.ASTERA_SEARCH_BREAKER_FAILURE_THRESHOLD || 3),
      openMs: Number(options.openMs || process.env.ASTERA_SEARCH_BREAKER_OPEN_MS || 30_000),
      maxCacheEntries: Number(options.maxCacheEntries || process.env.ASTERA_SEARCH_CACHE_MAX_ENTRIES || 512)
    });
  }

  health() {
    return this.resilience.health();
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
          const providerId = task.provider.provider_id;
          const current = activeByProvider.get(providerId) || 0;
          if (current >= this.perProviderConcurrency) { i += 1; continue; }

          const cached = this.resilience.cacheGet(task.cache_key);
          if (cached) {
            queue.splice(i, 1);
            results.push({
              status: 'FULFILLED', provider: task.provider, value: cached.value, duration_ms: 0,
              cache_status: 'HIT', cache_stored_at: cached.stored_at, circuit: this.resilience.before(providerId).circuit
            });
            started = true;
            continue;
          }

          const admission = this.resilience.before(providerId);
          if (!admission.allowed) {
            queue.splice(i, 1);
            const error = new Error(`${providerId} circuit is open`);
            error.code = 'PROVIDER_CIRCUIT_OPEN';
            error.retry_after_ms = admission.retry_after_ms;
            results.push({
              status: 'REJECTED', provider: task.provider, error, duration_ms: 0,
              cache_status: 'MISS', circuit: admission.circuit
            });
            started = true;
            continue;
          }

          queue.splice(i, 1);
          started = true;
          active += 1;
          activeByProvider.set(providerId, current + 1);
          const startedAt = Date.now();
          const timeoutMs = Math.max(1, Math.min(task.timeout_ms, context.remaining_ms?.() || task.timeout_ms));
          withTimeout(task.run(), timeoutMs, providerId, context.signal)
            .then((value) => {
              this.resilience.cacheSet(task.cache_key, value, task.cache_ttl_ms);
              results.push({
                status: 'FULFILLED', provider: task.provider, value, duration_ms: Date.now() - startedAt,
                cache_status: 'MISS', circuit: this.resilience.success(providerId)
              });
            })
            .catch((error) => results.push({
              status: 'REJECTED', provider: task.provider, error, duration_ms: Date.now() - startedAt,
              cache_status: 'MISS', circuit: this.resilience.failure(providerId, error)
            }))
            .finally(() => {
              active -= 1;
              activeByProvider.set(providerId, Math.max(0, (activeByProvider.get(providerId) || 1) - 1));
              drain();
            });
        }
        if (!started && active === 0 && queue.length) {
          const impossible = queue.shift();
          results.push({ status: 'REJECTED', provider: impossible.provider, error: Object.assign(new Error('scheduler deadlock prevented'), { code: 'SCHEDULER_DEADLOCK' }), duration_ms: 0, cache_status: 'MISS', circuit: null });
          drain();
        }
      };
      drain();
    });
  }
}

module.exports = { BoundedScheduler };
