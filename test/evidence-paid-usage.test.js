'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createEvidenceSearchModule = require('../src/evidence-search');

const REQUEST_SCHEMA_VERSION = 'astera.evidence-search.module-request.v1';
const OPERATION = 'CALCULATE_PAID_USAGE';

function basePayload() {
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
      pricing_version: 'direct-v1',
      currency: 'JPY',
      fixed_minor: 2,
      provider_cost_bps: 500
    }
  };
}

function request(payload = basePayload()) {
  return {
    schema_version: REQUEST_SCHEMA_VERSION,
    operation: OPERATION,
    payload
  };
}

test('exposes exactly one official connection method', () => {
  const module = createEvidenceSearchModule();
  assert.deepEqual(Object.keys(module), ['execute']);
  assert.equal(typeof module.execute, 'function');
});

test('calculates usage and billable amount deterministically through the single facade', async () => {
  const module = createEvidenceSearchModule();
  const first = await module.execute(request());
  const second = await module.execute(request());

  assert.equal(first.status, 'OK');
  assert.equal(first.operation, OPERATION);
  assert.equal(first.result.provider_fixed_cost_minor, 5);
  assert.equal(first.result.provider_cost_minor, 38);
  assert.equal(first.result.direct_variable_cost_minor, 4);
  assert.equal(first.result.astera_service_fee_minor, 20);
  assert.equal(first.result.total_billable_minor, 62);
  assert.equal(first.result.report_id, second.result.report_id);
  assert.equal(first.result.report_hash, second.result.report_hash);
  assert.match(first.result.provider_pricing_hash, /^[a-f0-9]{64}$/);
  assert.match(first.result.astera_pricing_hash, /^[a-f0-9]{64}$/);
  assert.match(first.result.direct_variable_policy_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(first, second);
});

test('supports estimate mode without payment, credit, reservation, refund, or settlement state', async () => {
  const module = createEvidenceSearchModule();
  const payload = { ...basePayload(), mode: 'ESTIMATE' };
  const response = await module.execute(request(payload));
  const report = response.result;

  assert.equal(report.mode, 'ESTIMATE');
  for (const forbidden of [
    'reservation_id',
    'payment_status',
    'credit_balance',
    'refund',
    'settlement_status'
  ]) {
    assert.equal(Object.hasOwn(report, forbidden), false);
  }
});

test('rejects unsupported module schemas and operations at the facade', async () => {
  const module = createEvidenceSearchModule();
  await assert.rejects(
    module.execute({ schema_version: 'wrong', operation: OPERATION, payload: basePayload() }),
    (error) => error.code === 'UNSUPPORTED_MODULE_SCHEMA'
  );
  await assert.rejects(
    module.execute({ schema_version: REQUEST_SCHEMA_VERSION, operation: 'DIRECT_COMPONENT_CALL', payload: basePayload() }),
    (error) => error.code === 'UNSUPPORTED_MODULE_OPERATION'
  );
});

test('rejects non-zero usage without an explicit price', async () => {
  const module = createEvidenceSearchModule();
  const payload = basePayload();
  payload.usage.unpriced_metric = 1;
  await assert.rejects(module.execute(request(payload)), (error) => error.code === 'UNPRICED_USAGE_METRIC');
});

test('rejects unsafe, negative, provider-mismatched, and currency-mismatched input', async () => {
  const module = createEvidenceSearchModule();

  const negative = basePayload();
  negative.usage.requests = -1;
  await assert.rejects(module.execute(request(negative)), /non-negative/);

  const mismatched = basePayload();
  mismatched.provider_pricing.provider_id = 'provider_b';
  await assert.rejects(module.execute(request(mismatched)), (error) => error.code === 'PROVIDER_MISMATCH');

  const currency = basePayload();
  currency.astera_pricing.currency = 'USD';
  await assert.rejects(module.execute(request(currency)), (error) => error.code === 'CURRENCY_MISMATCH');
});

test('uses integer minor units and returns strings only above Number.MAX_SAFE_INTEGER', async () => {
  const module = createEvidenceSearchModule();
  const payload = basePayload();
  payload.usage.requests = '9007199254740992';
  payload.usage.results = 0;
  payload.usage.bytes_downloaded = 0;
  const response = await module.execute(request(payload));
  assert.equal(typeof response.result.provider_cost_minor, 'string');
  assert.match(response.result.provider_cost_minor, /^\d+$/);
});

test('rejects inconsistent minimum and maximum fee bounds', async () => {
  const module = createEvidenceSearchModule();
  const payload = basePayload();
  payload.astera_pricing.maximum_service_fee_minor = 10;
  await assert.rejects(module.execute(request(payload)), (error) => error.code === 'INVALID_PRICING_POLICY');
});
