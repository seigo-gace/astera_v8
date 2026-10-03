'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMaterialRequirementGraph } = require('../src/runtime/material-requirement-graph');
const {
  projectMaterialRequirementsToMain8,
  mergeProjectionIntoRenderedMain8
} = require('../src/runtime/material-requirement-main8-projection');

function baseRendered() {
  const keys = [
    '01_purpose','02_premise','03_facts','04_crisis',
    '05_opposition','06_comparison','07_evidence_status','08_reinstruction'
  ];
  return {
    text: keys.map((key) => `${key}\n- base`).join('\n---\n'),
    compact_text: '',
    sections: keys.map((key) => ({ key, label: key, text: '- base' }))
  };
}

test('public projection maps requirement gaps into Main8 without leaking slot ids or material-kind tokens', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{
      id: 'R01',
      action: 'verify',
      request_text: '設計を検証する',
      external_evidence_requested: true,
      local_context: {}
    }]
  });
  const projection = projectMaterialRequirementsToMain8(graph, { lang: 'ja' });
  assert.equal(projection.accounting_complete, true);
  assert.ok(projection.sections['02_premise'].some((item) => item.includes('判断')));
  assert.ok(projection.sections['04_crisis'].length >= 1);
  assert.ok(projection.sections['07_evidence_status'].length >= 1);
  assert.ok(projection.sections['08_reinstruction'].length >= 1);
  const all = Object.values(projection.sections).flat().join('\n');
  assert.doesNotMatch(all, /R01:MR\d+/u);
  assert.doesNotMatch(all, /DECISION_CRITERION|EVIDENCE_SUPPORT|FALSIFICATION_OR_DISQUALIFIER/u);
});

test('internal-only domain refinement is not projected to public Main8', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{ id: 'R01', action: 'verify', request_text: '対象を検証する', local_context: {} }]
  });
  const projection = projectMaterialRequirementsToMain8(graph, { lang: 'ja' });
  const all = Object.values(projection.sections).flat().join('\n');
  assert.doesNotMatch(all, /original domain classification|Specialist refinement is not yet resolved/iu);
  assert.ok(projection.coverage.internal_only_nodes >= 1);
});

test('render merge preserves the eight sections and appends gap material only to mapped sections', () => {
  const graph = buildMaterialRequirementGraph({
    requests: [{ id: 'R01', action: 'verify', request_text: '対象を検証する', local_context: {} }]
  });
  const projection = projectMaterialRequirementsToMain8(graph, { lang: 'ja' });
  const rendered = mergeProjectionIntoRenderedMain8(baseRendered(), projection);
  assert.equal(rendered.sections.length, 8);
  assert.match(rendered.sections.find((s) => s.key === '02_premise').text, /判断に必要だが不足・未確認の材料/u);
  assert.match(rendered.sections.find((s) => s.key === '04_crisis').text, /判断を誤らせる失格条件・専門リスク/u);
  assert.match(rendered.sections.find((s) => s.key === '08_reinstruction').text, /不足を埋めるための次の確認/u);
  assert.equal(rendered.material_requirement_projection.coverage.coverage_complete, true);
});
