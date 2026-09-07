'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateInformationQuality } = require('../src/quality-completion-evaluator');
const createEvidenceSearchModule = require('../src/evidence-search');
const {
  createJsonProjectionProvider
} = require('../src/evidence-search/providers/json-projection-provider');

const EXECUTION_TIME = '2026-07-18T03:00:00.000Z';

function candidate(id, authority, role) {
  return {
    candidate_id: id,
    canonical_record_id: id,
    canonical_locator: { replayable: true },
    authority_id: authority,
    publisher: { id: authority, name: authority },
    source_role: role,
    title: `${authority} verified record`,
    excerpt: `${authority} provides independent verified evidence.`,
    language: 'en',
    content_hash: `${id}-hash`,
    revision_id: `${id}-revision`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public' }
  };
}

function qualityRequest(phase = 'INITIAL', reinforcementCount = 0, newCount = 0) {
  return {
    schema_version: 'astera.information-quality-request.v1',
    phase,
    domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
    overlays: [],
    jurisdictions: [],
    conditions: [
      { condition_id: 'core', class: 'CORE', field: 'claim', required: true }
    ],
    candidates: [
      candidate('record-a', 'authority-a', 'PRIMARY'),
      candidate('record-b', 'authority-b', 'OFFICIAL'),
      ...(phase === 'FINAL'
        ? [candidate('record-c', 'authority-c', 'OFFICIAL')]
        : [])
    ],
    measurements: {
      conditions: [
        { condition_id: 'core', class: 'CORE', status: 'CONFIRMED' }
      ],
      lineage: {
        independent_origin_count: phase === 'FINAL' ? 3 : 2,
        origin_count: phase === 'FINAL' ? 3 : 2,
        distinct_official_record_count: phase === 'FINAL' ? 3 : 2
      },
      conflict: { highest_severity: 'NONE', conflicts: [] },
      freshness: { overall_state: 'IDEAL', current_required: true },
      coverage: {
        registry_coverage_state: 'COMPLETE_FOR_ACTIVE_REGISTRY',
        discovery_scope_state: 'COMPLETE_FOR_QUERY_SCOPE'
      }
    },
    reinforcement_attempt_count: reinforcementCount,
    new_corroboration_count: newCount
  };
}

function evidenceRecord(id, authority, role, family, capability) {
  return {
    canonical_record_id: id,
    canonical_url: `https://official.example/${id}`,
    authority_id: authority,
    publisher_id: authority,
    publisher_name: authority,
    source_role: role,
    source_family_id: family,
    capability_id: capability,
    title: `${authority} Node.js support record`,
    excerpt: `${authority} independently confirms Node.js 22 support in ${id}.`,
    language: 'en',
    updated_at: EXECUTION_TIME,
    version: '22.0.0',
    revision_id: `${id}-revision`,
    retrieval_trace: { current_pointer_verified: true },
    rights: { access: 'public', reuse: 'allowed' },
    fields: { domain_id: 'G29', claim: 'Node.js 22 is supported' },
    lineage_fingerprint: {
      authority_id: authority,
      publisher_id: authority,
      origin_record_id: id,
      publication_event_id: `${id}-publication`
    }
  };
}

function providers() {
  return [
    createJsonProjectionProvider({
      provider_id: 'remote-evaluator-primary',
      source_class: 'FREE_PROJECTION',
      source_family_id: 'remote-primary-family',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [evidenceRecord(
        'remote-primary-record',
        'remote-primary-authority',
        'PRIMARY',
        'remote-primary-family',
        'projection_search'
      )]
    }),
    createJsonProjectionProvider({
      provider_id: 'remote-evaluator-official',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'remote-official-family',
      capabilities: ['NO_REINFORCEMENT'],
      domains: ['G29'],
      records: [evidenceRecord(
        'remote-official-record',
        'remote-official-authority',
        'OFFICIAL',
        'remote-official-family',
        'current_official'
      )]
    }),
    createJsonProjectionProvider({
      provider_id: 'remote-evaluator-reinforcement',
      source_class: 'FREE_OFFICIAL_LIVE',
      source_family_id: 'remote-reinforcement-family',
      capabilities: ['REINFORCEMENT_ONLY'],
      domains: ['G29'],
      records: [evidenceRecord(
        'remote-reinforcement-record',
        'remote-reinforcement-authority',
        'OFFICIAL',
        'remote-reinforcement-family',
        'independent_origin'
      )]
    })
  ];
}

test('in-process information quality evaluator satisfies initial and final gates', async () => {
  const initial = await evaluateInformationQuality(qualityRequest(), {
    tenant_id: 'tenant-evaluator-test',
    request_id: 'request-evaluator-initial'
  });
  assert.equal(initial.status, 'REINFORCEMENT_REQUIRED');
  assert.ok(initial.score_bp >= 8000);

  const final = await evaluateInformationQuality(qualityRequest('FINAL', 1, 1), {
    tenant_id: 'tenant-evaluator-test',
    request_id: 'request-evaluator-final'
  });
  assert.equal(final.status, 'FINAL_VALID');
  assert.ok(final.score_bp >= 9500);
});

test('free evidence search uses the in-process evaluator for initial and final gates', async () => {
  let evaluatorCalls = 0;
  const trackingEvaluator = async (input, context) => {
    evaluatorCalls += 1;
    return evaluateInformationQuality(input, context);
  };
  const module = createEvidenceSearchModule({
    providers: providers(),
    informationQualityEvaluator: trackingEvaluator,
    informationQualityEvaluatorMode: 'IN_PROCESS'
  });

  const health = await module.execute({
    schema_version: 'astera.evidence-search.module-request.v1',
    operation: 'HEALTH'
  });
  assert.equal(health.result.evaluator_mode, 'IN_PROCESS');

  const response = await module.execute({
    schema_version: 'astera.evidence-search.module-request.v1',
    operation: 'SEARCH_EVIDENCE',
    context: {
      tenant_id: 'tenant-remote-evaluator',
      request_id: 'request-remote-evaluator',
      execution_time: EXECUTION_TIME,
      effective_as_of: EXECUTION_TIME
    },
    payload: {
      question: 'Node.js 22 support evidence',
      domain_lens: { id: 'G29', taxonomy_version: '1.0.0' },
      conditions: [{
        condition_id: 'core-claim',
        class: 'CORE',
        field: 'fields.claim',
        operator: 'EQ',
        expected_value: 'Node.js 22 is supported',
        required: true
      }],
      search: { free_projection: true, free_current: true },
      paid_search: { enabled: false },
      deadline_ms: 8000
    }
  });

  assert.equal(response.result.status, 'FINAL_VALID');
  assert.equal(evaluatorCalls, 2);
  assert.equal(response.result.quality.reinforcement_attempt_count, 1);
  assert.equal(response.result.ai_used, false);
});
