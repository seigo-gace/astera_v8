'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { attachMaterialRequirementGraph } = require('../src/runtime/material-requirement-graph');
const { refinePreparedMaterialRequirements } = require('../src/runtime/specialist-requirement-refiner');

function preparedFor(question, action = 'verify') {
  return attachMaterialRequirementGraph({
    target: question,
    analysis_task_packet: {
      user_goal: question,
      tasks: [{
        id: 'T01',
        action,
        target: question,
        objective: question,
        evidence_need: { required: false }
      }]
    }
  });
}

test('strong G25 Lens adds specialist requirements without claiming original four-level classification', () => {
  const refined = refinePreparedMaterialRequirements(preparedFor('機械製造の材料強度と品質工学を検証する。'));
  const graph = refined.analysis_task_packet.material_requirement_graph;
  const request = graph.requests[0];

  assert.equal(graph.specialist_refinement_version, 'astera.specialist-requirement-refinement.v1');
  assert.equal(request.specialist_refinement.genre_lens_primary.id, 'G25');
  assert.equal(request.specialist_refinement.original_domain_classification_state, 'CLASSIFICATION_UNRESOLVED');
  assert.equal(request.specialist_refinement.genre_lens_primary.path_resolution, 'GENRE_LENS_ANCHOR');
  assert.ok(request.nodes.some((node) => node.material_kind === 'SPECIALIST_FACT_REQUIREMENT'));
  assert.ok(request.nodes.some((node) => node.material_kind === 'SPECIALIST_RISK_CHECK'));
  assert.ok(request.nodes.some((node) => node.material_kind === 'SPECIALIST_INQUIRY_REQUIREMENT'));
  assert.ok(!request.nodes.some((node) => node.truth_state === 'ORIGINAL_DOMAIN_CLASSIFICATION_RESOLVED'));
});

test('low-signal input does not turn a speculative Genre Lens into required specialist material', () => {
  const refined = refinePreparedMaterialRequirements(preparedFor('これについて検討する。', 'consider'));
  const request = refined.analysis_task_packet.material_requirement_graph.requests[0];
  assert.equal(request.specialist_refinement.original_domain_classification_state, 'CLASSIFICATION_UNRESOLVED');
  const requiredSpecialist = request.nodes.filter((node) => node.tags?.includes('SPECIALIST_REFINEMENT') && node.required !== false);
  if (request.specialist_refinement.state === 'ABSTAINED') assert.equal(requiredSpecialist.length, 0);
});


test('software UI error request does not receive required finance specialist material from incidental payment words', () => {
  const refined = refinePreparedMaterialRequirements(preparedFor(
    'system側の通信失敗や内部API名やstack traceは見せず、利用回数上限、クレジット不足、購入失敗、権限不足だけ利用者向けに分かる文章へ整理する。',
    'improve'
  ));
  const request = refined.analysis_task_packet.material_requirement_graph.requests[0];
  assert.notEqual(request.specialist_refinement.genre_lens_primary?.id, 'G11');
  const values = request.nodes.flatMap((node) => node.value_refs || []);
  assert.equal(values.some((value) => /前受管理|返金負債|未使用残高管理|失効Policy/u.test(value)), false);
});

test('finance specialist refinement for investment uses broad investment material instead of prepaid-credit accounting template', () => {
  const refined = refinePreparedMaterialRequirements(preparedFor(
    '投資案件AとBをCash Flow、収益性、Downside、流動性、資本Costで比較する。',
    'compare'
  ));
  const request = refined.analysis_task_packet.material_requirement_graph.requests[0];
  assert.equal(request.specialist_refinement.genre_lens_primary?.id, 'G11');
  const values = request.nodes.flatMap((node) => node.value_refs || []);
  assert.ok(values.some((value) => /Cash Flow/u.test(value)));
  assert.ok(values.some((value) => /NPV|IRR|Risk-adjusted Return/u.test(value)));
  assert.ok(values.some((value) => /Downside|流動性/u.test(value)));
  assert.equal(values.some((value) => /前受管理|返金負債|未使用残高管理|失効Policy/u.test(value)), false);
});
