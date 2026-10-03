'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bridgeMaterialRequirementsIntoFiveLanes,
  structuralGapNodes
} = require('../src/runtime/material-requirement-five-lane-bridge');

function preparedFixture(language = 'ja') {
  return {
    language,
    analysis_task_packet: {
      tasks: [{
        id: 'T01',
        request_id: 'R01',
        unresolved: ['source unresolved item']
      }],
      material_requirement_graph: {
        requests: [{
          owner_request_id: 'R01',
          nodes: [
            { material_kind: 'DECISION_CRITERION', required: true, status: 'MISSING' },
            { material_kind: 'FALSIFICATION_OR_DISQUALIFIER', required: true, status: 'MISSING' },
            { material_kind: 'COMPARISON_BASIS', required: false, status: 'MISSING' },
            { material_kind: 'EVIDENCE_SUPPORT', required: true, status: 'MISSING' },
            { material_kind: 'SPECIALIST_RISK_CHECK', required: true, status: 'MISSING', value_refs: ['Data Loss'] },
            { material_kind: 'DOMAIN_REFINEMENT', required: false, status: 'UNRESOLVED' }
          ]
        }]
      }
    }
  };
}

test('bridge sends only structural decision gaps into the normal five-lane task input', () => {
  const prepared = preparedFixture('ja');
  const bridged = bridgeMaterialRequirementsIntoFiveLanes(prepared);
  const unresolved = bridged.analysis_task_packet.tasks[0].unresolved;

  assert.ok(unresolved.includes('source unresolved item'));
  assert.ok(unresolved.includes('判断基準・合格条件が未確定'));
  assert.ok(unresolved.includes('判断を無効にする条件・反例・失敗条件が未確定'));
  assert.doesNotMatch(unresolved.join('\n'), /Data Loss|EVIDENCE_SUPPORT|DOMAIN_REFINEMENT|SPECIALIST_RISK_CHECK/u);
  assert.equal(prepared.analysis_task_packet.tasks[0].unresolved.length, 1);
});

test('specialist/evidence gaps are not duplicated into task context because canonical Lens/Evidence paths own them', () => {
  const requestGraph = preparedFixture('ja').analysis_task_packet.material_requirement_graph.requests[0];
  const gaps = structuralGapNodes(requestGraph);
  assert.deepEqual(gaps.map((node) => node.material_kind), [
    'DECISION_CRITERION',
    'FALSIFICATION_OR_DISQUALIFIER'
  ]);
});

test('bridge localizes structural gap material before it can reach public Main8', () => {
  const bridged = bridgeMaterialRequirementsIntoFiveLanes(preparedFixture('en'));
  const unresolved = bridged.analysis_task_packet.tasks[0].unresolved.join('\n');
  assert.match(unresolved, /decision criteria \/ acceptance conditions are unresolved/i);
  assert.match(unresolved, /invalidating condition, counterexample, or failure condition is unresolved/i);
  assert.doesNotMatch(unresolved, /What conditions distinguish|What condition, counterexample/u);
});
