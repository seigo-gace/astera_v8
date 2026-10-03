'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const createEvidenceSearchModule = require('../src/evidence-search');

const SCHEMA = 'astera.evidence-search.module-request.v1';
const EXECUTION_TIME = '2026-09-26T00:00:00.000Z';

function provider({ id, sourceClass, orphanCandidate = false }) {
  return {
    provider_id: id,
    source_class: sourceClass,
    source_family_id: `${id}-family`,
    certified: true,
    enabled: true,
    paid: false,
    domains: ['G29'],
    capabilities: ['NO_REINFORCEMENT'],
    latency_p95_ms: 10,
    async search(plan) {
      const queryResults = (plan.query_set || []).map((query) => ({
        query_id: query.query_id,
        retrieval_status: 'NOT_FOUND',
        candidate_record_ids: []
      }));
      return {
        coverage_state: 'COMPLETE_FOR_QUERY_SCOPE',
        query_results: queryResults,
        candidates: orphanCandidate ? [{
          canonical_record_id: 'orphan-record-1',
          canonical_url: 'https://example.com/orphan-record-1',
          authority_id: 'authority-orphan',
          publisher_id: 'authority-orphan',
          publisher_name: 'Authority Orphan',
          source_role: 'PRIMARY',
          source_family_id: `${id}-family`,
          capability_id: 'search',
          title: 'Unbound evidence candidate',
          excerpt: 'This candidate is not bound to any requested query result.',
          language: 'en',
          updated_at: EXECUTION_TIME,
          fields: { claim: 'Node.js 22 is supported' }
        }] : []
      };
    }
  };
}

function request() {
  return {
    schema_version: SCHEMA,
    operation: 'SEARCH_EVIDENCE',
    context: {
      request_id: 'query-binding-contract-001',
      caller_id: 'query-binding-test',
      execution_time: EXECUTION_TIME,
      effective_as_of: EXECUTION_TIME
    },
    payload: {
      request_id: 'query-binding-contract-001',
      caller_id: 'query-binding-test',
      question: 'Node.js 22 support evidence',
      domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
      conditions: [],
      search: { free_projection: true, free_current: true, free_general_web: true },
      paid_search: { enabled: false },
      maximum_results: 8,
      deadline_ms: 4000
    }
  };
}

test('Evidence Search rejects provider candidates that are not bound to any requested query result', async () => {
  const module = createEvidenceSearchModule({
    providers: [
      provider({ id: 'projection-orphan', sourceClass: 'FREE_PROJECTION', orphanCandidate: true }),
      provider({ id: 'current-empty', sourceClass: 'FREE_OFFICIAL_LIVE' })
    ],
    informationQualityEvaluator: async () => ({
      status: 'FINAL_VALID',
      score_bp: 10000,
      blocking: [],
      ai_used: false
    })
  });

  const response = await module.execute(request());
  const orphanExecution = response.result.provider_execution.initial.find((item) => item.provider_id === 'projection-orphan');

  assert.equal(orphanExecution.status, 'REJECTED');
  assert.equal(orphanExecution.error_code, 'PROVIDER_QUERY_BINDING_INVALID');
  assert.equal(response.result.evidence.some((item) => item.canonical_record_id === 'orphan-record-1'), false);
});
