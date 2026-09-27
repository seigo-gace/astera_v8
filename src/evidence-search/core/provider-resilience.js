'use strict';

const RETRYABLE_FAILURE = /(?:TIMEOUT|ECONN|ENOTFOUND|EAI_AGAIN|RESET|NETWORK|HTTP_429|HTTP_5\d\d|PROVIDER_FAILED)/i;

function nonNegativeInt(value, fallback) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

class ProviderResilienceController {
  constructor(options = {}) {
    this.failureThreshold = Math.max(1, nonNegativeInt(options.failureThreshold, 3));
    this.openMs = Math.max(100, nonNegativeInt(options.openMs, 30_000));
    this.now = typeof options.now === 'function' ? options.now : Date.now;
    this.states = new Map();
  }

  _state(providerId) {
    const id = String(providerId);
    if (!this.states.has(id)) {
      this.states.set(id, {
        state: 'CLOSED',
        consecutive_failures: 0,
        opened_at: 0,
        retry_at: 0,
        probe_in_flight: false,
        last_error_code: null
      });
    }
    return this.states.get(id);
  }

  _snapshot(providerId) {
    const state = this._state(providerId);
    return Object.freeze({
      state: state.state,
      consecutive_failures: state.consecutive_failures,
      retry_at: state.retry_at || null,
      last_error_code: state.last_error_code
    });
  }

  before(providerId) {
    const state = this._state(providerId);
    const now = this.now();
    if (state.state === 'OPEN') {
      if (now < state.retry_at) {
        return Object.freeze({ allowed: false, circuit: this._snapshot(providerId), retry_after_ms: state.retry_at - now });
      }
      state.state = 'HALF_OPEN';
      state.probe_in_flight = false;
    }
    if (state.state === 'HALF_OPEN') {
      if (state.probe_in_flight) {
        return Object.freeze({ allowed: false, circuit: this._snapshot(providerId), retry_after_ms: 0 });
      }
      state.probe_in_flight = true;
    }
    return Object.freeze({ allowed: true, circuit: this._snapshot(providerId), retry_after_ms: 0 });
  }

  success(providerId) {
    const state = this._state(providerId);
    state.state = 'CLOSED';
    state.consecutive_failures = 0;
    state.opened_at = 0;
    state.retry_at = 0;
    state.probe_in_flight = false;
    state.last_error_code = null;
    return this._snapshot(providerId);
  }

  failure(providerId, error) {
    const state = this._state(providerId);
    const code = String(error?.code || 'PROVIDER_FAILED');
    state.probe_in_flight = false;
    state.last_error_code = code;
    if (!RETRYABLE_FAILURE.test(code)) return this._snapshot(providerId);
    state.consecutive_failures += 1;
    if (state.state === 'HALF_OPEN' || state.consecutive_failures >= this.failureThreshold) {
      const now = this.now();
      state.state = 'OPEN';
      state.opened_at = now;
      state.retry_at = now + this.openMs;
    }
    return this._snapshot(providerId);
  }

  health() {
    return Object.freeze({
      failure_threshold: this.failureThreshold,
      open_ms: this.openMs,
      providers: Object.freeze([...this.states.entries()].map(([provider_id]) => Object.freeze({ provider_id, ...this._snapshot(provider_id) })))
    });
  }
}

module.exports = { ProviderResilienceController, RETRYABLE_FAILURE };
