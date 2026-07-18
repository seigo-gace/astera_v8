'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateUsageReport } = require('../src/evidence-search/paid/usage-calculator');

function baseInput() {
  return {
    request_id: 'req_001',
    tenant_id: 'tenant_001',
    provider_id: 'provider_a',
    mode: 'ACTUAL',
    usage: {
      requests: 2,
      results: 11,
      bytes_downloaded: 1_500
    },
    provider_pricing: {
      provider_id: 'provider_a',
      pricing_version: 'provider-a-v1',
      currency: 'JPY',
      fixed_cost_minor: 5,
      components: [
        { metric: 'requests', unit_size: 1, price_minor: 10, rounding: 'CEIL' },
        { metric: 'results', unit_size: 5, price_minor: 3, rounding: 'CEIL' },
        { metric: 'bytes_downloaded', unit_size: 1_000, price_minor: 2, rounding: 'CEIL' }
      ]
    },
    astera_pricing: {
      pricing_version: 'astera-v1',
      currency: 'JPY',
      markup_bps: 2_500,
      minimum_service_fee_minor: 20
    },
    direct_variable_policy: {
      currency: 'JPY',
      fixed_minor: 2,
      provider_cost_bps: 500
    }
  };
}

test('calculates provider usage, direct variable cost, ASTERA fee, and total deterministically', () => {
  const input = baseInput();
  const first = calculateUsageReport(input);
  const second = calculateUsageReport(input);

  assert.equal(first.provider_cost_minor, 38);
  assert.equal(first.direct_variable_cost_minor, 4);
  assert.equal(first.astera_service_fee_minor, 20);
  assert.equal(first.total_billable_minor, 62);
  assert.equal(first.report_id, second.report_id);
  assert.equal(first.report_hash, second.report_hash);
  assert.deepEqual(first, second);
});

test('supports estimate mode without implementing payment or credit operations', () => {
  const report = calculateUsageReport({ ...baseInput(), mode: 'ESTIMATE' });
  assert.equal(report.mode, 'ESTIMATE');
  assert.equal(Object.hasOwn(report, 'reservation_id'), false);
  assert.equal(Object.hasOwn(report, 'payment_status'), false);
  assert.equal(Object.hasOwn(report, 'credit_balance'), false);
});

test('rejects non-zero usage without an explicit price', () => {
  const input = baseInput();
  input.usage.unpriced_metric = 1;
  assert.throws(() => calculateUsageReport(input), (error) => error.code === 'UNPRICED_USAGE_METRIC');
});

test('rejects unsafe, negative, or mismatched inputs', () => {
  const negative = baseInput();
  negative.usage.requests = -1;
  assert.throws(() => calculateUsageReport(negative), /non-negative/);

  const mismatched = baseInput();
  mismatched.provider_pricing.provider_id = 'provider_b';
  assert.throws(() => calculateUsageReport(mismatched), (error) => error.code === 'PROVIDER_MISMATCH');

  const currency = baseInput();
  currency.astera_pricing.currency = 'USD';
  assert.throws(() => calculateUsageReport(currency), (error) => error.code === 'CURRENCY_MISMATCH');
});

test('uses integer minor units and returns strings only above Number.MAX_SAFE_INTEGER', () => {
  const input = baseInput();
  input.usage.requests = '9007199254740992';
  input.usage.results = 0;
  input.usage.bytes_downloaded = 0;
  const report = calculateUsageReport(input);
  assert.equal(typeof report.provider_cost_minor, 'string');
  assert.match(report.provider_cost_minor, /^\d+$/);
});
