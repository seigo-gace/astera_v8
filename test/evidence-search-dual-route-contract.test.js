'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enforceDualRoutePayload,
  routeExecutionSummary,
  attachDualRouteTrace
} = require('../src/evidence-search/module');

test('Evidence Search forces all free route flags on when omitted', () => {
  const payload = enforceDualRoutePayload({ question: 'test' });
  assert.equal(payload.search.free_projection, true);
  assert.equal(payload.search.free_current, true);
  assert.equal(payload.search.free_general_web, true);
});

test('Evidence Search rejects attempts to disable either search route', () => {
  for (const key of ['free_projection', 'free_current', 'free_general_web']) {
    assert.throws(
      () => enforceDualRoutePayload({ question: 'test', search: { [key]: false } }),
      (error) => error?.code === 'EVIDENCE_DUAL_ROUTE_REQUIRED'
    );
  }
});

test('dual route trace requires Specialist/Authoritative and General/Current attempts', () => {
  const result = {
    schema_version: 'astera.evidence-search.result.v1',
    status: 'FINAL_VALID',
    evidence: [],
    provider_execution: {
      initial: [
        { provider_id: 'authority-a', source_class: 'FREE_PROJECTION', status: 'FULFILLED' },
        { provider_id: 'current-a', source_class: 'FREE_OFFICIAL_LIVE', status: 'REJECTED', error_code: 'TIMEOUT' },
        { provider_id: 'web-a', source_class: 'FREE_GENERAL_WEB', status: 'FULFILLED' }
      ],
      reinforcement: []
    },
    result_hash: 'old'
  };
  const summary = routeExecutionSummary(result);
  assert.equal(summary.specialist_authoritative.attempted, true);
  assert.equal(summary.specialist_authoritative.fulfilled_count, 1);
  assert.equal(summary.general_current.attempted, true);
  assert.equal(summary.general_current.provider_count, 2);
  assert.equal(summary.general_current.rejected_count, 1);

  const traced = attachDualRouteTrace(result);
  assert.equal(traced.route_execution.specialist_authoritative.attempted, true);
  assert.equal(traced.route_execution.general_current.attempted, true);
  assert.notEqual(traced.result_hash, 'old');
});

test('dual route trace fails closed when one required route was never attempted', () => {
  assert.throws(
    () => attachDualRouteTrace({
      status: 'FINAL_VALID',
      evidence: [],
      provider_execution: {
        initial: [{ provider_id: 'authority-only', source_class: 'FREE_PROJECTION', status: 'FULFILLED' }],
        reinforcement: []
      }
    }),
    (error) => error?.code === 'EVIDENCE_DUAL_ROUTE_EXECUTION_INCOMPLETE'
  );
});
