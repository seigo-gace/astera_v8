'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  enforceDualRoutePayload,
  configuredRouteSummary,
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

test('dual route trace treats official live as the bridge between authority and current routes', () => {
  const result = {
    schema_version: 'astera.evidence-search.result.v1',
    status: 'FINAL_VALID',
    evidence: [],
    provider_execution: {
      initial: [
        { provider_id: 'projection-a', source_class: 'FREE_PROJECTION', status: 'FULFILLED' },
        { provider_id: 'official-live-a', source_class: 'FREE_OFFICIAL_LIVE', status: 'REJECTED', error_code: 'TIMEOUT' },
        { provider_id: 'web-a', source_class: 'FREE_GENERAL_WEB', status: 'FULFILLED' }
      ],
      reinforcement: []
    },
    result_hash: 'old'
  };
  const summary = routeExecutionSummary(result);
  assert.equal(summary.specialist_authoritative.attempted, true);
  assert.equal(summary.specialist_authoritative.provider_count, 2);
  assert.equal(summary.specialist_authoritative.fulfilled_count, 1);
  assert.equal(summary.general_current.attempted, true);
  assert.equal(summary.general_current.provider_count, 2);
  assert.equal(summary.general_current.rejected_count, 1);
  assert.equal(summary.distinct_provider_count, 3);

  const traced = attachDualRouteTrace(result);
  assert.equal(traced.route_execution.specialist_authoritative.attempted, true);
  assert.equal(traced.route_execution.general_current.attempted, true);
  assert.equal(traced.route_execution.distinct_provider_count, 3);
  assert.notEqual(traced.result_hash, 'old');
});

test('dual route trace accepts projection plus official-live as two distinct route attempts', () => {
  const traced = attachDualRouteTrace({
    status: 'REJECTED_BLOCKING',
    evidence: [],
    provider_execution: {
      initial: [
        { provider_id: 'projection-a', source_class: 'FREE_PROJECTION', status: 'FULFILLED' },
        { provider_id: 'official-live-a', source_class: 'FREE_OFFICIAL_LIVE', status: 'FULFILLED' }
      ],
      reinforcement: []
    }
  });
  assert.equal(traced.route_execution.distinct_provider_count, 2);
});

test('dual route trace accepts official-live plus general-web as two distinct route attempts', () => {
  const traced = attachDualRouteTrace({
    status: 'REJECTED_BLOCKING',
    evidence: [],
    provider_execution: {
      initial: [
        { provider_id: 'official-live-a', source_class: 'FREE_OFFICIAL_LIVE', status: 'FULFILLED' },
        { provider_id: 'web-a', source_class: 'FREE_GENERAL_WEB', status: 'FULFILLED' }
      ],
      reinforcement: []
    }
  });
  assert.equal(traced.route_execution.distinct_provider_count, 2);
});

test('dual route trace fails closed when one required route was never attempted', () => {
  assert.throws(
    () => attachDualRouteTrace({
      status: 'FINAL_VALID',
      evidence: [],
      provider_execution: {
        initial: [{ provider_id: 'projection-only', source_class: 'FREE_PROJECTION', status: 'FULFILLED' }],
        reinforcement: []
      }
    }),
    (error) => error?.code === 'EVIDENCE_DUAL_ROUTE_EXECUTION_INCOMPLETE'
  );
});

test('one official-live provider cannot satisfy both routes by itself', () => {
  assert.throws(
    () => attachDualRouteTrace({
      status: 'FINAL_VALID',
      evidence: [],
      provider_execution: {
        initial: [{ provider_id: 'official-only', source_class: 'FREE_OFFICIAL_LIVE', status: 'FULFILLED' }],
        reinforcement: []
      }
    }),
    (error) => error?.code === 'EVIDENCE_DUAL_ROUTE_EXECUTION_INCOMPLETE'
  );
});

test('dual-ready runtime rejects instead of fabricating a route when one route has no provider applicable to the query', () => {
  const configured = configuredRouteSummary([
    { provider_id: 'specialist-configured', source_class: 'FREE_PROJECTION', certified: true },
    { provider_id: 'general-configured', source_class: 'FREE_GENERAL_WEB', certified: true }
  ]);
  assert.equal(configured.dual_route_ready, true);

  const traced = attachDualRouteTrace({
    status: 'FINAL_VALID',
    evidence: [{ candidate_id: 'must-not-be-published' }],
    provider_execution: {
      initial: [
        { provider_id: 'general-configured', source_class: 'FREE_GENERAL_WEB', status: 'FULFILLED' }
      ],
      reinforcement: []
    },
    result_hash: 'old'
  }, configured);

  assert.equal(traced.status, 'REJECTED');
  assert.deepEqual(traced.evidence, []);
  assert.equal(traced.route_execution.dual_route_complete, false);
  assert.equal(traced.route_execution.configured_dual_route_ready, true);
  assert.equal(traced.route_execution.fail_closed, true);
  assert.equal(traced.route_execution.failure_mode, 'ROUTE_UNAVAILABLE_FOR_QUERY');
  assert.equal(traced.route_execution.specialist_authoritative.attempted, false);
  assert.equal(traced.route_execution.general_current.attempted, true);
  assert.notEqual(traced.result_hash, 'old');
});

test('runtime configuration that lacks a required route still raises execution-incomplete', () => {
  const configured = configuredRouteSummary([
    { provider_id: 'specialist-only', source_class: 'FREE_PROJECTION', certified: true }
  ]);
  assert.equal(configured.dual_route_ready, false);
  assert.throws(
    () => attachDualRouteTrace({
      status: 'FINAL_VALID',
      evidence: [],
      provider_execution: {
        initial: [{ provider_id: 'specialist-only', source_class: 'FREE_PROJECTION', status: 'FULFILLED' }],
        reinforcement: []
      }
    }, configured),
    (error) => error?.code === 'EVIDENCE_DUAL_ROUTE_EXECUTION_INCOMPLETE'
  );
});