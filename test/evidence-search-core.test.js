'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createEvidenceSearchModule = require('../src/evidence-search');
const {
  createJsonProjectionProvider
} = require('../src/evidence-search/providers/json-projection-provider');

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
    title: `Node.js 22 support evidence from ${authority}`,
    excerpt: `${authority} independently confirms Node.js 22 support in record ${id}.`,
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
      records: [record({
        id: 'primary-record',
        authority: 'authority-primary',
        role: 'PRIMARY',
        family: 'family-primary'
      })]
    }),
    createJsonProjectionProvider({
      provider_id: 'official-current',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'family-official',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [record({
        id: 'official-record',
        authority: 'authority-official',
        role: 'OFFICIAL',
        family: 'family-official'
      })]
    }),
    createJsonProjectionProvider({
      provider_id: 'independent-reinforcement',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'family-independent',
      capabilities: ['REINFORCEMENT_ONLY'],
      domains: ['G29'],
      records: [record({
        id: 'independent-record',
        authority: 'authority-independent',
        role: 'OFFICIAL',
        family: 'family-independent',
        capability: 'independent_origin'
      })]
    })
  ];
}

test('runs the complete free evidence-search module through one execute connection', async () => {
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
  assert.deepEqual(response.result.paid_usage_reports, []);
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

  const module = createEvidenceSearchModule({
    providers: [incomplete, completeProviders()[2]]
  });
  const response = await module.execute(request());

  assert.equal(response.result.status, 'REJECTED_BLOCKING');
  assert.equal(response.result.quality.reinforcement_attempt_count, 0);
  assert.deepEqual(response.result.provider_execution.reinforcement, []);
});

test('never invokes a paid provider during evidence search', async () => {
  let paidProviderCalls = 0;
  const paidProvider = {
    provider_id: 'paid-provider-must-not-run',
    source_class: 'PAID_PROVIDER',
    domains: ['G29'],
    capabilities: [],
    certified: true,
    search: async () => {
      paidProviderCalls += 1;
      throw new Error('paid provider must not be invoked');
    }
  };

  const module = createEvidenceSearchModule({
    providers: [...completeProviders(), paidProvider]
  });
  const response = await module.execute(request());

  assert.equal(response.result.status, 'FINAL_VALID');
  assert.equal(paidProviderCalls, 0);
  assert.equal(
    response.result.provider_execution.initial.some(
      (item) => item.provider_id === paidProvider.provider_id
    ),
    false
  );
});

test('rejects attempts to enable paid search', async () => {
  const module = createEvidenceSearchModule({ providers: completeProviders() });
  await assert.rejects(
    () => module.execute(request(searchPayload({ paid_search: { enabled: true } }))),
    (error) => error.code === 'PAID_SEARCH_DISABLED'
  );
});

test('keeps future usage calculation isolated from provider execution and payment', async () => {
  const module = createEvidenceSearchModule({ providers: completeProviders() });
  const response = await module.execute({
    schema_version: SCHEMA,
    operation: 'CALCULATE_PAID_USAGE',
    payload: {
      request_id: 'usage-only-001',
      tenant_id: 'tenant-001',
      provider_id: 'future-provider',
      mode: 'ESTIMATE',
      usage: { requests: 2 },
      provider_pricing: {
        provider_id: 'future-provider',
        pricing_version: 'future-v1',
        currency: 'JPY',
        fixed_cost_minor: 0,
        components: [
          { metric: 'requests', unit_size: 1, price_minor: 10, rounding: 'CEIL' }
        ]
      },
      astera_pricing: {
        pricing_version: 'astera-v1',
        currency: 'JPY',
        markup_bps: 2500,
        minimum_service_fee_minor: 20
      },
      direct_variable_policy: {
        pricing_version: 'direct-v1',
        currency: 'JPY',
        fixed_minor: 0,
        provider_cost_bps: 0
      }
    }
  });

  assert.equal(response.operation, 'CALCULATE_PAID_USAGE');
  assert.equal(response.result.provider_cost_minor, 20);
  assert.equal(response.result.astera_service_fee_minor, 20);
  assert.equal(Object.hasOwn(response.result, 'payment_status'), false);
  assert.equal(Object.hasOwn(response.result, 'credit_balance'), false);
  assert.equal(Object.hasOwn(response.result, 'reservation_id'), false);
});

test('health reports unavailable when no active provider exists', async () => {
  const module = createEvidenceSearchModule({ providers: [] });
  const response = await module.execute({
    schema_version: SCHEMA,
    operation: 'HEALTH'
  });
  assert.equal(response.status, 'OK');
  assert.equal(response.result.status, 'UNAVAILABLE_NO_ACTIVE_PROVIDER');
  assert.equal(response.result.provider_count, 0);
  assert.equal(response.result.active_provider_count, 0);
});

test('health reports no AI and no payment execution', async () => {
  const module = createEvidenceSearchModule({ providers: completeProviders() });
  const response = await module.execute({
    schema_version: SCHEMA,
    operation: 'HEALTH'
  });
  assert.equal(response.result.status, 'OK');
  assert.equal(response.result.provider_count, 3);
  assert.equal(response.result.active_provider_count, 3);
  assert.equal(response.result.ai_used, false);
  assert.equal(response.result.payment_execution, false);
});
