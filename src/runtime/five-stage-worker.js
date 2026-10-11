'use strict';

const { parentPort, threadId } = require('node:worker_threads');
const { compileLensPlan, lensPlanEntries } = require('../lens-plan');
const {
  factLane,
  riskLane,
  multiLane,
  inquiryLane,
  compareLane
} = require('../v4-canonical/lanes');

if (!parentPort) throw new Error('five-stage-worker must run inside Worker Threads');

const OPERATIONS = Object.freeze({
  PROJECT_FACT_LANE: 'fact',
  PROJECT_RISK_LANE: 'risk',
  PROJECT_MULTI_LANE: 'multi',
  PROJECT_INQUIRY_LANE: 'inquiry',
  PROJECT_COMPARE_LANE: 'compare'
});

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(array(values).map(clean).filter(Boolean))];
}

function serializeError(error) {
  return {
    name: String(error?.name || 'Error'),
    code: String(error?.code || 'FIVE_STAGE_WORKER_FAILED'),
    message: String(error?.message || 'Five-stage worker failed')
  };
}

function normalizePayload(payload = {}) {
  const task = payload.task || {};
  const canonical = payload.canonical || {};
  const records = Array.isArray(canonical.records) ? canonical.records : [];
  const claims = records.map((record) => record.claim).filter(Boolean);
  const results = records.map((record) => record.confirmation).filter(Boolean);
  const policyByClaimId = Object.fromEntries(records
    .filter((record) => record.claim?.claim_id)
    .map((record) => [record.claim.claim_id, record.policy]));
  const domain = task.domain || {};
  const lensPlan = domain.lens_plan || compileLensPlan(domain);
  return {
    task,
    canonical,
    claims,
    results,
    policyByClaimId,
    domain: { ...domain, lens_plan: lensPlan },
    searchPlan: canonical.search_plan || task.canonical_plan?.search_plan || {},
    probeDelayMs: Math.max(0, Number(payload.probeDelayMs || 0))
  };
}

function wait(ms) {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function factRequirements(domain) {
  return Object.freeze(lensPlanEntries(domain, 'fact').map((entry) => Object.freeze({
    item: entry.value,
    status: 'REQUIRES_CONFIRMATION',
    source: 'LENS_PLAN',
    lens_sources: entry.sources || []
  })));
}

function enrichRiskLane(base = {}, task = {}) {
  const observable = task.observable_material || {};
  const additions = array(observable.risks).map((risk, index) => ({
    rule_id: `OBSERVABLE-${clean(risk?.code || `RISK-${index + 1}`)}`,
    key: clean(risk?.code || `observable-risk-${index + 1}`),
    impact: clean(risk?.impact),
    failure_condition: `${clean(risk?.code || 'OBSERVABLE_RISK')} を解消するEvidence・成立条件が未確認のまま判断材料を使用する。`,
    weight: Math.max(35, 60 - index),
    source: 'OBSERVABLE_MATERIAL',
    claim_ids: []
  })).filter((item) => item.impact);
  if (!additions.length) return base;
  const seen = new Set(additions.map((item) => `${item.key}|${item.impact}`));
  const risks = [...additions, ...array(base.risks).filter((item) => !seen.has(`${item?.key}|${item?.impact}`))];
  const highest = [...risks].sort((a, b) => Number(b?.weight || 0) - Number(a?.weight || 0))[0] || null;
  return Object.freeze({
    ...base,
    rule_ids: unique(risks.map((item) => item?.rule_id)),
    risk_count: risks.length,
    risks,
    highest,
    failure_conditions: unique(risks.map((item) => item?.failure_condition)),
    level: Number(highest?.weight || 0) >= 30 ? 'high' : highest ? 'medium' : 'low'
  });
}

function observableCandidateMaterial(label, index, task = {}) {
  const claims = array(task.observable_material?.claim_texts).filter((claim) => String(claim).includes(label));
  return {
    candidate_id: `observable:${index + 1}`,
    label,
    material_state: claims.length ? 'OBSERVABLE_UNVERIFIED_MATERIAL' : 'INSUFFICIENT_CANDIDATE_MATERIAL',
    observations: claims,
    confirmed_claim_ids: [],
    undetermined_claim_ids: [],
    supported_scopes: [],
    evidence_refs: []
  };
}

function enrichCompareLane(base = {}, task = {}) {
  const observable = task.observable_material || {};
  const candidates = unique([...array(observable.candidates), ...array(base.comparison_candidates).map((item) => typeof item === 'string' ? item : item?.label)]);
  const dimensions = unique([...array(observable.dimensions), ...array(base.dimensions)]);
  if (!candidates.length && !dimensions.length) return base;

  const existingMaterials = new Map(array(base.candidate_materials).map((item) => [clean(item?.label), item]));
  const candidateMaterials = candidates.map((label, index) => existingMaterials.get(clean(label)) || observableCandidateMaterial(label, index, task));
  const existingDifferences = new Map(array(base.trade_off_differences).map((item) => [clean(item?.dimension), item]));
  const tradeOffDifferences = dimensions.map((dimension) => existingDifferences.get(clean(dimension)) || ({
    dimension,
    comparison_state: 'INSUFFICIENT_COMPARISON_MATERIAL',
    per_candidate: candidateMaterials.map((item) => ({
      candidate_id: item.candidate_id,
      label: item.label,
      material_state: item.material_state,
      observations: item.observations || [],
      confirmed_claim_ids: item.confirmed_claim_ids || [],
      undetermined_claim_ids: item.undetermined_claim_ids || [],
      supported_scopes: item.supported_scopes || [],
      evidence_refs: item.evidence_refs || []
    })),
    conditions: unique([...(task.conditions || []), ...(task.constraints || [])]),
    status: 'MATERIAL_ONLY',
    source: 'OBSERVABLE_MATERIAL'
  }));

  return Object.freeze({
    ...base,
    comparison_candidates: candidates,
    candidate_materials: candidateMaterials,
    dimensions,
    trade_off_differences: tradeOffDifferences,
    selected_candidate: null,
    candidate_ranking: [],
    rejected_candidates: []
  });
}

async function runLane(lane, payload) {
  const normalized = normalizePayload(payload);
  const startedAt = Date.now();
  await wait(normalized.probeDelayMs);
  let value;
  switch (lane) {
    case 'fact': {
      const base = factLane(normalized.claims, normalized.results, normalized.domain);
      value = Object.freeze({ ...base, fact_requirements: factRequirements(normalized.domain) });
      break;
    }
    case 'risk':
      value = enrichRiskLane(riskLane(normalized.claims, normalized.results, normalized.task, normalized.domain), normalized.task);
      break;
    case 'multi':
      value = multiLane(normalized.claims, normalized.results, normalized.domain, normalized.task, normalized.searchPlan);
      break;
    case 'inquiry':
      value = inquiryLane(normalized.claims, normalized.results, normalized.domain, normalized.task);
      break;
    case 'compare':
      value = enrichCompareLane(compareLane(normalized.claims, normalized.results, normalized.policyByClaimId, normalized.domain, normalized.task), normalized.task);
      break;
    default: {
      const error = new Error(`Unsupported five-stage lane: ${lane || '-'}`);
      error.code = 'UNSUPPORTED_FIVE_STAGE_LANE';
      throw error;
    }
  }
  const finishedAt = Date.now();
  return {
    lane,
    value,
    telemetry: {
      thread_id: threadId,
      started_at_ms: startedAt,
      finished_at_ms: finishedAt,
      duration_ms: Math.max(0, finishedAt - startedAt)
    }
  };
}

parentPort.on('message', async (message) => {
  const jobId = message?.job_id;
  try {
    const lane = OPERATIONS[message?.operation];
    if (!lane) {
      const error = new Error(`Unsupported five-stage worker operation: ${message?.operation || '-'}`);
      error.code = 'UNSUPPORTED_FIVE_STAGE_OPERATION';
      throw error;
    }
    const result = await runLane(lane, message.payload || {});
    parentPort.postMessage({ job_id: jobId, ok: true, result });
  } catch (error) {
    parentPort.postMessage({ job_id: jobId, ok: false, error: serializeError(error) });
  }
});