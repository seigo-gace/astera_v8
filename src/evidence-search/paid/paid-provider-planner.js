'use strict';

function utility(provider, requestMaximum, remainingMs) {
  const benefit = Math.floor(
    provider.domain_fit_bp * 3000 / 10000
    + provider.expected_quality_bp * 2500 / 10000
    + provider.coverage_bp * 1500 / 10000
    + provider.locator_replayability_bp * 1000 / 10000
    + provider.freshness_bp * 1000 / 10000
    + provider.reliability_bp * 1000 / 10000
  );
  const costPenalty = requestMaximum > 0
    ? Math.min(3000, Math.floor(provider.maximum_cost_minor * 3000 / requestMaximum))
    : 3000;
  const latencyPenalty = remainingMs > 0
    ? Math.min(2000, Math.floor(provider.latency_p95_ms * 2000 / remainingMs))
    : 2000;
  return benefit - costPenalty - latencyPenalty;
}

function planPaidProviders(providers, {
  maximumChargeMinor = 0,
  remainingMs = 8000,
  phase = 'INITIAL',
  initialLimit = 2,
  totalLimit = 3
} = {}) {
  if (!providers.length) return Object.freeze({ selected: Object.freeze([]), reserved_maximum_charge_minor: 0 });
  if (!Number.isSafeInteger(maximumChargeMinor) || maximumChargeMinor <= 0) {
    const error = new Error('paid search maximum_charge_minor must be a positive safe integer');
    error.code = 'PAID_SEARCH_BUDGET_REQUIRED';
    throw error;
  }

  const limit = phase === 'INITIAL' ? Math.min(initialLimit, totalLimit) : 1;
  const ranked = providers
    .map((provider) => ({ provider, utility_bp: utility(provider, maximumChargeMinor, remainingMs) }))
    .filter((item) => item.provider.latency_p95_ms < remainingMs)
    .sort((a, b) =>
      b.utility_bp - a.utility_bp
      || a.provider.maximum_cost_minor - b.provider.maximum_cost_minor
      || a.provider.latency_p95_ms - b.provider.latency_p95_ms
      || a.provider.provider_id.localeCompare(b.provider.provider_id)
    );

  const selected = [];
  let reserved = 0;
  for (const item of ranked) {
    if (selected.length >= limit) break;
    if (reserved + item.provider.maximum_cost_minor > maximumChargeMinor) continue;
    selected.push(Object.freeze({ ...item, maximum_cost_minor: item.provider.maximum_cost_minor }));
    reserved += item.provider.maximum_cost_minor;
  }

  if (!selected.length) {
    const error = new Error('no paid provider fits budget and deadline');
    error.code = 'PAID_SEARCH_PLAN_UNAVAILABLE';
    throw error;
  }

  return Object.freeze({ selected: Object.freeze(selected), reserved_maximum_charge_minor: reserved });
}

module.exports = { planPaidProviders };
