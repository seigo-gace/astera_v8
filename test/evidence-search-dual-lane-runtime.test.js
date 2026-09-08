'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createEvidenceSearchModule = require('../src/evidence-search');
const { createJsonProjectionProvider } = require('../src/evidence-search/providers/json-projection-provider');

const SCHEMA = 'astera.evidence-search.module-request.v1';
const EXECUTION_TIME = '2026-09-09T00:00:00.000Z';

function record(id, role, family) {
  return {
    canonical_record_id: id,
    canonical_url: `https://example.test/${id}`,
    authority_id: family,
    publisher_id: family,
    publisher_name: family,
    source_role: role,
    source_family_id: family,
    capability_id: 'dual_lane_search',
    title: `Dual-lane evidence ${id}`,
    excerpt: `Evidence record ${id}`,
    language: 'en',
    updated_at: EXECUTION_TIME,
    fields: { claim: 'dual lanes execute' },
    lineage_fingerprint: {
      authority_id: family,
      publisher_id: family,
      origin_record_id: id,
      publication_event_id: `${id}-publication`
    }
  };
}

function provider(providerId, sourceClass, records = [record(providerId, 'OFFICIAL', providerId)]) {
  return createJsonProjectionProvider({
    provider_id: providerId,
    source_class: sourceClass,
    source_family_id: providerId,
    capabilities: ['NO_REINFORCEMENT'],
    domains: ['G29'],
    records
  });
}

function payload(search = { free_projection: true, free_current: true }) {
  return {
    request_id: 'dual-lane-runtime-test',
    tenant_id: 'test',
    question: 'dual lanes execute',
    domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
    conditions: [],
    search,
    paid_search: { enabled: false },
    maximum_results: 8,
    deadline_ms: 5000
  };
}

function request(search) {
  return {
    schema_version: SCHEMA,
    operation: 'SEARCH_EVIDENCE',
    context: {
      request_id: 'dual-lane-runtime-test',
      tenant_id: 'test',
      execution_time: EXECUTION_TIME,
      effective_as_of: EXECUTION_TIME
    },
    payload: payload(search)
  };
}

function finalEvaluator() {
  return {
    status: 'FINAL_VALID',
    score_bp: 10_000,
    blocking_reasons: [],
    advisory_reasons: []
  };
}

test('strict runtime executes specialist KB and current web lanes and merges their Evidence', async () => {
  const module = createEvidenceSearchModule({
    providers: [
      provider('specialist-kb-test', 'FREE_PROJECTION'),
      provider('current-web-test', 'FREE_OFFICIAL_LIVE')
    ],
    requireDualSearchLanes: true,
    informationQualityEvaluator: finalEvaluator
  });

  const health = await module.execute({ schema_version: SCHEMA, operation: 'HEALTH', payload: {} });
  assert.equal(health.result.status, 'OK');
  assert.equal(health.result.require_dual_search_lanes, true);
  assert.equal(health.result.dual_search_lane_ready, true);
  assert.equal(health.result.search_lanes.specialist_kb.active_provider_count, 1);
  assert.equal(health.result.search_lanes.current_web.active_provider_count, 1);

  const response = await module.execute(request());
  const lanes = response.result.search_lanes.initial;
  assert.equal(lanes.specialist_kb.source_class, 'FREE_PROJECTION');
  assert.equal(lanes.current_web.source_class, 'FREE_OFFICIAL_LIVE');
  assert.equal(lanes.specialist_kb.status, 'EXECUTED_WITH_EVIDENCE');
  assert.equal(lanes.current_web.status, 'EXECUTED_WITH_EVIDENCE');
  assert.equal(lanes.specialist_kb.fulfilled_provider_count, 1);
  assert.equal(lanes.current_web.fulfilled_provider_count, 1);
  assert.deepEqual(new Set(response.result.evidence.map((item) => item.source_family_id)), new Set([
    'specialist-kb-test',
    'current-web-test'
  ]));
  assert.deepEqual(
    new Set(response.result.provider_execution.initial.map((item) => item.source_class)),
    new Set(['FREE_PROJECTION', 'FREE_OFFICIAL_LIVE'])
  );
});

test('strict runtime refuses a masked one-lane success when current web lane has no provider', async () => {
  const module = createEvidenceSearchModule({
    providers: [provider('specialist-only', 'FREE_PROJECTION')],
    requireDualSearchLanes: true,
    informationQualityEvaluator: finalEvaluator
  });

  const health = await module.execute({ schema_version: SCHEMA, operation: 'HEALTH', payload: {} });
  assert.equal(health.result.status, 'UNAVAILABLE_REQUIRED_SEARCH_LANE');
  assert.equal(health.result.dual_search_lane_ready, false);

  await assert.rejects(
    () => module.execute(request()),
    (error) => error.code === 'EVIDENCE_SEARCH_REQUIRED_LANE_UNAVAILABLE'
      && error.lane === 'current_web'
  );
});

test('strict runtime reports requested lane execution failure instead of accepting the other lane', async () => {
  const currentFailure = {
    provider_id: 'current-web-failure',
    source_class: 'FREE_OFFICIAL_LIVE',
    domains: ['G29'],
    capabilities: ['NO_REINFORCEMENT'],
    certified: true,
    latency_p95_ms: 100,
    search: async () => {
      const error = new Error('current web unavailable');
      error.code = 'CURRENT_WEB_TEST_FAILURE';
      throw error;
    }
  };
  const module = createEvidenceSearchModule({
    providers: [provider('specialist-success', 'FREE_PROJECTION'), currentFailure],
    requireDualSearchLanes: true,
    informationQualityEvaluator: finalEvaluator
  });

  await assert.rejects(
    () => module.execute(request()),
    (error) => error.code === 'EVIDENCE_SEARCH_REQUIRED_LANE_EXECUTION_FAILED'
      && error.lane === 'current_web'
  );
});

test('executed with no matching record is distinct from a lane that did not run', async () => {
  const module = createEvidenceSearchModule({
    providers: [
      provider('specialist-with-record', 'FREE_PROJECTION'),
      provider('current-no-record', 'FREE_OFFICIAL_LIVE', [])
    ],
    requireDualSearchLanes: true,
    informationQualityEvaluator: finalEvaluator
  });

  const response = await module.execute(request());
  assert.equal(response.result.search_lanes.initial.specialist_kb.status, 'EXECUTED_WITH_EVIDENCE');
  assert.equal(response.result.search_lanes.initial.current_web.status, 'EXECUTED_NO_EVIDENCE');
  assert.equal(response.result.search_lanes.initial.current_web.fulfilled_provider_count, 1);
});
