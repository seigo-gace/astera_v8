'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createEvidenceSearchModule = require('../src/evidence-search');
const { createJsonProjectionProvider } = require('../src/evidence-search/providers/json-projection-provider');

const SCHEMA = 'astera.evidence-search.module-request.v1';
const EXECUTION_TIME = '2026-07-18T01:30:00.000Z';

function record({ id, authority, role, family, capability = 'projection_search' }) {
  return {
    canonical_record_id: id,
    canonical_url: `https://example.test/${id}`,
    authority_id: authority,
    publisher_id: authority,
    publisher_name: authority,
    source_role: role,
    source_family_id: family,
    capability_id: capability,
    title: 'Node.js 22 support evidence',
    excerpt: 'Node.js 22 is supported by this verified record.',
    language: 'en',
    updated_at: EXECUTION_TIME,
    version: '22.0.0',
    revision_id: `${id}-revision-1`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public', reuse: 'allowed' },
    fields: {
      domain_id: 'G29',
      claim: 'Node.js 22 is supported'
    },
    lineage_fingerprint: {
      authority_id: authority,
      publisher_id: authority,
      origin_record_id: id,
      publication_event_id: `${id}-publication`
    }
  };
}

function searchPayload(overrides = {}) {
  return {
    request_id: 'req_evidence_001',
    tenant_id: 'tenant_001',
    question: 'Node.js 22 support evidence',
    domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
    conditions: [
      {
        condition_id: 'core_claim',
        class: 'CORE',
        field: 'fields.claim',
        operator: 'EQ',
        expected_value: 'Node.js 22 is supported',
        required: true
      }
    ],
    search: { free_projection: true, free_current: true },
    paid_search: { enabled: false },
    maximum_results: 16,
    deadline_ms: 8000,
    ...overrides
  };
}

function request(payload = searchPayload()) {
  return {
    schema_version: SCHEMA,
    operation: 'SEARCH_EVIDENCE',
    context: {
      request_id: payload.request_id,
      tenant_id: payload.tenant_id,
      execution_time: EXECUTION_TIME,
      effective_as_of: EXECUTION_TIME
    },
    payload
  };
}

function completeProviders() {
  return [
    createJsonProjectionProvider({
      provider_id: 'projection-primary',
      source_class: 'FREE_PROJECTION',
      source_family_id: 'family-primary',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [record({ id: 'primary-record', authority: 'authority-primary', role: 'PRIMARY', family: 'family-primary' })]
    }),
    createJsonProjectionProvider({
      provider_id: 'official-current',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'family-official',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [record({ id: 'official-record', authority: 'authority-official', role: 'OFFICIAL', family: 'family-official' })]
    }),
    createJsonProjectionProvider({
      provider_id: 'independent-reinforcement',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'family-independent',
      capabilities: ['REINFORCEMENT_ONLY'],
      domains: ['G29'],
      records: [record({ id: 'independent-record', authority: 'authority-independent', role: 'OFFICIAL', family: 'family-independent', capability: 'independent_origin' })]
    })
  ];
}

test('runs the complete evidence-search module through its single execute connection', async () => {
  const module = createEvidenceSearchModule({ providers: completeProviders() });
  assert.deepEqual(Object.keys(module), ['execute']);

  const response = await module.execute(request());
  assert.equal(response.status, 'OK');
  assert.equal(response.operation, 'SEARCH_EVIDENCE');
  assert.equal(response.result.status, 'FINAL_VALID');
  assert.equal(response.result.quality.initial.status, 'REINFORCEMENT_REQUIRED');
  assert.ok(response.result.quality.initial.score_bp >= 8000);
  assert.equal(response.result.quality.final.status, 'FINAL_VALID');
  assert.ok(response.result.quality.final.score_bp >= 9500);
  assert.equal(response.result.quality.reinforcement_attempt_count, 1);
  assert.equal(response.result.quality.new_corroboration_count, 1);
  assert.equal(response.result.evidence.length, 3);
  assert.equal(response.result.ai_used, false);
  assert.equal(response.result.payment_executed, false);
  assert.equal(response.result.paid_usage_reports.length, 0);
  assert.match(response.result.query_plan_hash, /^[a-f0-9]{64}$/);
  assert.match(response.result.result_hash, /^[a-f0-9]{64}$/);
});

test('does not run reinforcement when initial quality is below 8000', async () => {
  const incomplete = createJsonProjectionProvider({
    provider_id: 'incomplete-provider',
    source_class: 'FREE_PROJECTION',
    capabilities: ['NO_REINFORCEMENT'],
    domains: ['G29'],
    records: [{
      canonical_record_id: 'weak-record',
      title: 'Node.js 22 support evidence',
      excerpt: 'Node.js 22 support evidence',
      fields: { claim: 'Node.js 22 is supported' }
    }]
  });
  const reinforcement = completeProviders()[2];
  const module = createEvidenceSearchModule({ providers: [incomplete, reinforcement] });
  const response = await module.execute(request());

  assert.equal(response.result.status, 'REJECTED_BLOCKING');
  assert.equal(response.result.quality.reinforcement_attempt_count, 0);
  assert.deepEqual(response.result.provider_execution.reinforcement, []);
});

test('calculates paid-provider usage but never performs payment or credit operations', async () => {
  const providers = completeProviders();
  providers[0] = createJsonProjectionProvider({
    provider_id: 'paid-primary',
    source_class: 'PAID_PROVIDER',
    source_family_id: 'family-primary',
    capabilities: ['NO_REINFORCEMENT'],
    domains: ['G29'],
    maximum_cost_minor: 100,
    provider_pricing: {
      provider_id: 'paid-primary',
      pricing_version: 'paid-primary-v1',
      currency: 'JPY',
      fixed_cost_minor: 5,
      components: [
        { metric: 'requests', unit_size: 1, price_minor: 10, rounding: 'CEIL' },
        { metric: 'results', unit_size: 1, price_minor: 2, rounding: 'CEIL' },
        { metric: 'records_scanned', unit_size: 1, price_minor: 1, rounding: 'CEIL' }
      ]
    },
    records: [record({ id: 'paid-primary-record', authority: 'authority-primary', role: 'PRIMARY', family: 'family-primary' })]
  });

  const module = createEvidenceSearchModule({ providers });
  const payload = searchPayload({
    paid_search: {
      enabled: true,
      astera_pricing: {
        pricing_version: 'astera-search-v1',
        currency: 'JPY',
        markup_bps: 2500,
        minimum_service_fee_minor: 20
      },
      direct_variable_policy: {
        currency: 'JPY',
        fixed_minor: 2,
        provider_cost_bps: 500
      }
    }
  });

  const response = await module.execute(request(payload));
  assert.equal(response.result.status, 'FINAL_VALID');
  assert.equal(response.result.paid_usage_reports.length, 1);
  const usage = response.result.paid_usage_reports[0];
  assert.equal(usage.provider_id, 'paid-primary');
  assert.ok(Number(usage.provider_cost_minor) > 0);
  assert.ok(Number(usage.astera_service_fee_minor) >= 20);
  assert.equal(Object.hasOwn(usage, 'payment_status'), false);
  assert.equal(Object.hasOwn(usage, 'credit_balance'), false);
  assert.equal(Object.hasOwn(usage, 'reservation_id'), false);
});

test('health reports no AI and no payment execution', async () => {
  const module = createEvidenceSearchModule({ providers: completeProviders() });
  const response = await module.execute({ schema_version: SCHEMA, operation: 'HEALTH' });
  assert.equal(response.result.status, 'OK');
  assert.equal(response.result.provider_count, 3);
  assert.equal(response.result.ai_used, false);
  assert.equal(response.result.payment_execution, false);
});
