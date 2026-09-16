'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const createEvidenceSearchModule = require('../src/evidence-search');
const { stableStringify } = require('../src/quality-completion-evaluator/utils/stable-json');

const SCHEMA = 'astera.evidence-search.module-request.v1';
const EXECUTION_TIME = '2026-09-13T00:00:00.000Z';

function sha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function generalWebProvider() {
  return {
    provider_id: 'free-general-web-test',
    source_class: 'FREE_GENERAL_WEB',
    source_family_id: 'general-web-test',
    priority: 10,
    domains: [],
    capabilities: ['NO_REINFORCEMENT'],
    routing_terms: [],
    certified: true,
    search: async (plan) => {
      const query = plan.query_set[0];
      return {
        coverage_state: 'PARTIAL_FOR_QUERY_SCOPE',
        query_results: [{
          query_id: query.query_id,
          retrieval_status: 'FOUND',
          candidate_record_ids: ['web-candidate-1']
        }],
        candidates: [{
          canonical_record_id: 'web-candidate-1',
          canonical_url: 'https://example.org/evidence',
          title: 'General web candidate page',
          excerpt: 'A fetched destination page that is still only a candidate until quality judgment passes.',
          source_role: 'SECONDARY',
          source_family_id: 'general-web-test',
          authority_id: 'example.org',
          publisher_id: 'example.org',
          publisher_name: 'example.org',
          retrieval_trace: {
            search_result_used_as_evidence: false,
            destination_page_fetched: true
          },
          rights: { access: 'public' }
        }]
      };
    }
  };
}

test('rejected general-web candidates remain diagnostic candidates and are not published as adopted evidence', async () => {
  const module = createEvidenceSearchModule({
    providers: [generalWebProvider()],
    informationQualityEvaluator: async () => ({
      schema_version: 'astera.information-quality-result.v1',
      phase: 'INITIAL',
      status: 'REJECTED_BLOCKING',
      score_bp: 0,
      criterion_scores: {},
      blocking_reasons: ['TEST_REJECTION']
    })
  });

  const response = await module.execute({
    schema_version: SCHEMA,
    operation: 'SEARCH_EVIDENCE',
    context: {
      request_id: 'general-web-adoption-boundary-1',
      caller_id: 'caller-test',
      execution_time: EXECUTION_TIME,
      effective_as_of: EXECUTION_TIME
    },
    payload: {
      request_id: 'general-web-adoption-boundary-1',
      caller_id: 'caller-test',
      question: 'general web evidence candidate',
      search: {
        free_projection: false,
        free_current: false,
        free_general_web: true
      },
      paid_search: { enabled: false },
      maximum_results: 8,
      deadline_ms: 4000
    }
  });

  assert.equal(response.result.status, 'REJECTED_BLOCKING');
  assert.deepEqual(response.result.evidence, []);
  assert.equal(response.result.provider_execution.initial.length, 1);
  assert.equal(response.result.provider_execution.initial[0].provider_id, 'free-general-web-test');
  assert.equal(response.result.provider_execution.initial[0].candidate_count, 1);
  assert.deepEqual(
    response.result.query_execution.initial[0].provider_records[0].candidate_record_ids,
    ['web-candidate-1']
  );

  const { result_hash: resultHash, ...hashBase } = response.result;
  assert.equal(resultHash, sha256(hashBase));
});
