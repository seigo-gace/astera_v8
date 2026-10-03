'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DERIVATION_AUTHORITY,
  buildMaterialRequirementGraph,
  attachMaterialRequirementGraph
} = require('../src/runtime/material-requirement-graph');

function kinds(graph) {
  return graph.requests.flatMap((request) => request.nodes.map((node) => node.material_kind));
}

function nodeByKind(graph, kind) {
  return graph.requests.flatMap((request) => request.nodes).find((node) => node.material_kind === kind);
}

test('requirements are derived from the decision before domain classification exists', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{
      id: 'R01',
      action: 'verify',
      request_text: 'この未知の対象を採用してよいか検証する',
      objectives: ['採用可否を判断できる材料を得る'],
      local_context: {}
    }]
  });

  assert.equal(graph.derivation_authority, DERIVATION_AUTHORITY);
  assert.equal(graph.request_count, 1);
  assert.ok(kinds(graph).includes('DECISION_QUESTION'));
  assert.ok(kinds(graph).includes('DECISION_CRITERION'));
  assert.ok(kinds(graph).includes('FALSIFICATION_OR_DISQUALIFIER'));
  assert.equal(nodeByKind(graph, 'DOMAIN_REFINEMENT').required, false);
  assert.equal(nodeByKind(graph, 'DOMAIN_REFINEMENT').status, 'UNRESOLVED');
  assert.equal(graph.accounting_complete, true);
  assert.equal(graph.decision_ready, false);
});

test('the graph exposes missing criteria and falsification instead of filling them from a genre template', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{ id: 'R01', action: 'analyze', request_text: 'この内容を判断材料として検討する', local_context: {} }]
  });

  assert.equal(nodeByKind(graph, 'DECISION_CRITERION').status, 'MISSING');
  assert.equal(nodeByKind(graph, 'FALSIFICATION_OR_DISQUALIFIER').status, 'MISSING');
  assert.ok(graph.gap_slot_ids.length >= 2);
});

test('source-backed criteria and disqualifiers close their own requirement slots without becoming a final decision', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{
      id: 'R01',
      action: 'verify',
      request_text: '設計を承認可能か検証する',
      objectives: ['承認可能性を検証する'],
      local_context: {
        acceptance_criteria: ['許容荷重を満たすこと'],
        prohibitions: ['安全率を下回る場合は承認しない']
      }
    }]
  });

  assert.equal(nodeByKind(graph, 'DECISION_CRITERION').status, 'SATISFIED');
  assert.equal(nodeByKind(graph, 'FALSIFICATION_OR_DISQUALIFIER').status, 'SATISFIED');
  assert.equal(graph.decision_ready, true);
  assert.equal(graph.accounting_complete, true);
});

test('input observations remain unresolved validation material and never become verified facts', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{ id: 'R01', action: 'verify', request_text: '故障原因を検証する', local_context: {
      acceptance_criteria: ['原因を再現可能なEvidenceで確認する'],
      risk_signals: ['別原因の可能性を排除できない']
    }}],
    observations: [{ request_ids: ['R01'], text: '高負荷時だけ停止した', truth_state: 'USER_REPORTED_UNVERIFIED' }]
  });

  const observation = nodeByKind(graph, 'OBSERVATION_VALIDATION');
  assert.equal(observation.status, 'UNRESOLVED');
  assert.equal(observation.truth_state, 'USER_REPORTED_UNVERIFIED');
  assert.equal(graph.decision_ready, false);
});

test('explicit evidence demand creates claim-bound evidence gap rather than treating search routing as evidence', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{
      id: 'R01',
      action: 'verify',
      request_text: '公式根拠で確認する',
      external_evidence_requested: true,
      local_context: {
        acceptance_criteria: ['公式一次Sourceで成立を確認する'],
        exceptions: ['根拠が取れなければ未確認として残す']
      }
    }]
  });

  const evidence = nodeByKind(graph, 'EVIDENCE_SUPPORT');
  assert.equal(evidence.status, 'MISSING');
  assert.match(evidence.acquisition_hint, /claim-local evidence requirements/i);
});

test('runtime attachment creates Material Requirement Graph for ordinary task packets, not only long or multi-request cases', () => {
  const prepared = {
    target: '未知の資料を検証する',
    analysis_task_packet: {
      user_goal: '未知の資料を検証する',
      tasks: [{
        id: 'T01',
        action: 'verify',
        target: '未知の資料',
        objective: '採用可否を検証する',
        completion_criteria: ['判断基準を満たすこと'],
        prohibitions: ['未確認事項を事実扱いしない'],
        evidence_need: { required: false }
      }]
    }
  };

  const attached = attachMaterialRequirementGraph(prepared);
  const graph = attached.analysis_task_packet.material_requirement_graph;
  assert.equal(graph.request_count, 1);
  assert.ok(graph.requests[0].nodes.length >= 4);
  assert.equal(graph.derivation_authority, DERIVATION_AUTHORITY);
});
