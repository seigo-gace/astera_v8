'use strict';

const path = require('node:path');
const createEvidenceSearchModule = require('../src/evidence-search');
const { loadEvidenceProviders } = require('../src/evidence-search/providers/config-loader');
const { KbTargetRegistry } = require('../src/evidence-search/core/kb-target-registry');
const { attachKbTargetsToProviders } = require('../src/evidence-search/providers/kb-target-aware-provider');

const CONFIG_FILE = process.env.ASTERA_EVIDENCE_LIVE_CONFIG
  || path.join(__dirname, '..', 'config', 'evidence-providers.public.json');
const SPECIALIST_PROVIDER_ID = process.env.ASTERA_EVIDENCE_SPECIALIST_SMOKE_PROVIDER
  || 'crossref-works';
const CURRENT_PROVIDER_ID = process.env.ASTERA_EVIDENCE_CURRENT_SMOKE_PROVIDER
  || 'loc-search';
const QUERY = process.env.ASTERA_EVIDENCE_DUAL_LANE_SMOKE_QUERY || 'climate change';

function fail(message, details = {}) {
  const error = new Error(message);
  Object.assign(error, details);
  throw error;
}

function smokeEvaluator() {
  return {
    status: 'FINAL_VALID',
    score_bp: 10_000,
    blocking_reasons: [],
    advisory_reasons: []
  };
}

async function main() {
  const kbTargetRegistry = KbTargetRegistry.load();
  const baseProviders = loadEvidenceProviders({ configFile: CONFIG_FILE });
  const providers = attachKbTargetsToProviders(baseProviders, kbTargetRegistry);
  const specialist = providers.find((provider) => provider.provider_id === SPECIALIST_PROVIDER_ID);
  const current = providers.find((provider) => provider.provider_id === CURRENT_PROVIDER_ID);

  if (!specialist) fail(`missing specialist smoke provider: ${SPECIALIST_PROVIDER_ID}`);
  if (!current) fail(`missing current smoke provider: ${CURRENT_PROVIDER_ID}`);
  if (specialist.source_class !== 'FREE_PROJECTION') {
    fail(`${SPECIALIST_PROVIDER_ID} is not FREE_PROJECTION`, { source_class: specialist.source_class });
  }
  if (current.source_class !== 'FREE_OFFICIAL_LIVE') {
    fail(`${CURRENT_PROVIDER_ID} is not FREE_OFFICIAL_LIVE`, { source_class: current.source_class });
  }

  const module = createEvidenceSearchModule({
    providers: [specialist, current],
    requireDualSearchLanes: true,
    globalConcurrency: 2,
    perProviderConcurrency: 1,
    informationQualityEvaluator: smokeEvaluator,
    informationQualityEvaluatorMode: 'LIVE_SMOKE_STUB'
  });

  const health = await module.execute({
    schema_version: 'astera.evidence-search.module-request.v1',
    operation: 'HEALTH',
    payload: {}
  });
  if (health.result.status !== 'OK' || health.result.dual_search_lane_ready !== true) {
    fail('dual-lane health preflight failed', { health: health.result });
  }

  const executionTime = new Date().toISOString();
  const response = await module.execute({
    schema_version: 'astera.evidence-search.module-request.v1',
    operation: 'SEARCH_EVIDENCE',
    context: {
      request_id: 'live-dual-lane-smoke',
      tenant_id: 'live-smoke',
      execution_time: executionTime,
      effective_as_of: executionTime
    },
    payload: {
      request_id: 'live-dual-lane-smoke',
      tenant_id: 'live-smoke',
      question: QUERY,
      domain_lens: { id: 'G37', taxonomy_version: '1.0.0' },
      conditions: [],
      search: { free_projection: true, free_current: true },
      provider_allowlist: [SPECIALIST_PROVIDER_ID, CURRENT_PROVIDER_ID],
      paid_search: { enabled: false },
      maximum_results: 20,
      deadline_ms: 30_000
    }
  });

  const lanes = response.result.search_lanes?.initial;
  if (lanes?.specialist_kb?.status !== 'EXECUTED_WITH_EVIDENCE') {
    fail('specialist KB lane did not return live Evidence', { lane: lanes?.specialist_kb });
  }
  if (lanes?.current_web?.status !== 'EXECUTED_WITH_EVIDENCE') {
    fail('current web lane did not return live Evidence', { lane: lanes?.current_web });
  }

  const executions = response.result.provider_execution?.initial || [];
  const specialistExecution = executions.find((item) => item.provider_id === SPECIALIST_PROVIDER_ID);
  const currentExecution = executions.find((item) => item.provider_id === CURRENT_PROVIDER_ID);
  if (specialistExecution?.status !== 'FULFILLED' || specialistExecution.candidate_count < 1) {
    fail('specialist live provider execution was not fulfilled with records', { specialistExecution });
  }
  if (currentExecution?.status !== 'FULFILLED' || currentExecution.candidate_count < 1) {
    fail('current live provider execution was not fulfilled with records', { currentExecution });
  }

  const output = {
    status: 'DUAL_LANE_LIVE_SEARCH_OK',
    query: QUERY,
    kb_target_count: kbTargetRegistry.target_count,
    specialist_kb: lanes.specialist_kb,
    current_web: lanes.current_web,
    evidence_count: response.result.evidence.length,
    provider_execution: executions.map((item) => ({
      provider_id: item.provider_id,
      source_class: item.source_class,
      status: item.status,
      candidate_count: item.candidate_count,
      error_code: item.error_code
    })),
    sample_evidence: response.result.evidence.slice(0, 4).map((item) => ({
      canonical_record_id: item.canonical_record_id,
      canonical_url: item.canonical_url,
      source_family_id: item.source_family_id,
      source_role: item.source_role
    }))
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    status: 'DUAL_LANE_LIVE_SEARCH_FAILED',
    code: error.code || null,
    message: error.message,
    lane: error.lane || null,
    source_class: error.source_class || null,
    details: Object.fromEntries(
      Object.entries(error).filter(([key]) => !['stack', 'message'].includes(key))
    )
  }, null, 2));
  process.exit(1);
});
