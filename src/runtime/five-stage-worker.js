'use strict';

const { parentPort, threadId } = require('node:worker_threads');
const { compileLensPlan } = require('../lens-plan');
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

async function runLane(lane, payload) {
  const normalized = normalizePayload(payload);
  const startedAt = Date.now();
  await wait(normalized.probeDelayMs);
  let value;
  switch (lane) {
    case 'fact':
      value = factLane(normalized.claims, normalized.results, normalized.domain);
      break;
    case 'risk':
      value = riskLane(normalized.claims, normalized.results, normalized.task, normalized.domain);
      break;
    case 'multi':
      value = multiLane(normalized.claims, normalized.results, normalized.domain, normalized.task, normalized.searchPlan);
      break;
    case 'inquiry':
      value = inquiryLane(normalized.claims, normalized.results, normalized.domain, normalized.task);
      break;
    case 'compare':
      value = compareLane(normalized.claims, normalized.results, normalized.policyByClaimId, normalized.domain, normalized.task);
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
