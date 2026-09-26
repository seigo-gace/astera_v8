'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createEvidenceSearchModule = require('../src/evidence-search');

const SCHEMA = 'astera.evidence-search.module-request.v1';

function request() {
  return {
    schema_version: SCHEMA,
    operation: 'SEARCH_EVIDENCE',
    context: {
      request_id: 'certification-contract-001',
      caller_id: 'certification-test',
      execution_time: '2026-09-26T00:00:00.000Z',
      effective_as_of: '2026-09-26T00:00:00.000Z'
    },
    payload: {
      request_id: 'certification-contract-001',
      caller_id: 'certification-test',
      question: 'Node.js 22 support evidence',
      domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
      conditions: [],
      search: { free_projection: true, free_current: true, free_general_web: true },
      paid_search: { enabled: false },
      maximum_results: 4,
      deadline_ms: 2000
    }
  };
}

test('provider certification is fail-closed when certified is omitted', async () => {
  let calls = 0;
  const providerWithoutCertification = {
    provider_id: 'provider-without-certification',
    source_class: 'FREE_PROJECTION',
    domains: ['G29'],
    capabilities: ['NO_REINFORCEMENT'],
    async search() {
      calls += 1;
      return { coverage_state: 'COMPLETE_FOR_QUERY_SCOPE', query_results: [], candidates: [] };
    }
  };

  const module = createEvidenceSearchModule({ providers: [providerWithoutCertification] });
  const health = await module.execute({ schema_version: SCHEMA, operation: 'HEALTH' });

  assert.equal(health.result.status, 'UNAVAILABLE_NO_ACTIVE_PROVIDER');
  assert.equal(health.result.active_provider_count, 0);
  assert.equal(health.result.providers[0].certified, false);
  assert.equal(health.result.providers[0].active_search_eligible, false);

  await assert.rejects(
    () => module.execute(request()),
    (error) => error?.code === 'EVIDENCE_SEARCH_NO_ACTIVE_PROVIDER'
  );
  assert.equal(calls, 0);
});
