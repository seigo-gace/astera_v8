'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMaterialRequirementGraph } = require('../src/runtime/material-requirement-graph');
const { diagnoseMaterialRequirementGraph } = require('../src/runtime/material-requirement-diagnostics');

test('missing material remains a valid accounted gap and does not fail graph integrity', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{ id: 'R01', action: 'verify', request_text: '未知の対象を検証する', local_context: {} }]
  });
  const diagnostic = diagnoseMaterialRequirementGraph(graph, { expectedMinRequests: 1 });
  assert.equal(diagnostic.pass, true);
  assert.equal(diagnostic.accounting_complete, true);
  assert.equal(diagnostic.decision_ready, false);
  assert.ok(diagnostic.gaps_by_kind.DECISION_CRITERION >= 1);
  assert.ok(diagnostic.gaps_by_kind.FALSIFICATION_OR_DISQUALIFIER >= 1);
});

test('graph absence is an integrity failure', () => {
  const diagnostic = diagnoseMaterialRequirementGraph(null);
  assert.equal(diagnostic.pass, false);
  assert.equal(diagnostic.failures[0].code, 'MATERIAL_REQUIREMENT_GRAPH_MISSING');
});

test('request coverage is validated independently of missing information', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{ id: 'R01', action: 'verify', request_text: '一件目を検証する', local_context: {} }]
  });
  const diagnostic = diagnoseMaterialRequirementGraph(graph, { expectedMinRequests: 2 });
  assert.equal(diagnostic.pass, false);
  assert.ok(diagnostic.failures.some((failure) => failure.code === 'MATERIAL_REQUIREMENT_REQUEST_COVERAGE_INCOMPLETE'));
});

test('invalid node states fail accounting integrity', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{ id: 'R01', action: 'verify', request_text: '対象を検証する', local_context: {} }]
  });
  graph.requests[0].nodes[0].status = 'MAGIC_COMPLETE';
  const diagnostic = diagnoseMaterialRequirementGraph(graph);
  assert.equal(diagnostic.pass, false);
  assert.ok(diagnostic.failures.some((failure) => failure.code === 'MATERIAL_REQUIREMENT_NODE_STATE_INVALID'));
});
