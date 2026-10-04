'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  projectFiveLaneMaterialToMain8
} = require('../src/runtime/five-lane-main8-projection');

function emptyMain8() {
  return {
    '03_facts': {},
    '04_crisis': {},
    '05_opposition': {},
    '06_comparison': {},
    '07_evidence_status': {},
    '08_reinstruction': {}
  };
}

test('selected LensPlan risk and comparison material remains public when parser material_requirements are partial', () => {
  const taskResults = [{
    task: {
      action: 'analyze',
      material_requirements: [],
      local_context: { material_requirements: [] }
    },
    lanes: {
      fact: {
        fact_requirements: [
          { item: 'Market・市場', source: 'LENS_PLAN' }
        ]
      },
      risk: {
        risks: [
          { impact: 'Execution Risk・実行リスク', source: 'LENS_PLAN' },
          { impact: 'generic runtime warning', source: 'CANONICAL_CLAIM_OR_TASK_SIGNAL' }
        ]
      },
      multi: {
        perspectives: [
          { focus: 'Customer・顧客', source: 'LENS_PLAN' }
        ]
      },
      inquiry: {
        inquiry_lens: ['成功指標は何か'],
        evidence_need: ['Market Research・市場調査']
      },
      compare: {
        comparison_candidates: [],
        candidate_materials: [],
        dimensions: ['Unit Economics・収益構造', 'Execution Risk・実行リスク']
      }
    }
  }];

  const projected = projectFiveLaneMaterialToMain8(emptyMain8(), taskResults);

  assert.deepEqual(projected['04_crisis'].risk_requirements, ['Execution Risk・実行リスク']);
  assert.deepEqual(projected['06_comparison'].dimensions, ['Unit Economics・収益構造', 'Execution Risk・実行リスク']);
  assert.deepEqual(projected['07_evidence_status'].evidence_requirements, ['Market Research・市場調査']);
  assert.deepEqual(projected.five_lane_public_material.risk_requirements, ['Execution Risk・実行リスク']);
  assert.deepEqual(projected.five_lane_public_material.comparison_dimensions, ['Unit Economics・収益構造', 'Execution Risk・実行リスク']);
});

test('projection never introduces candidate selection or ranking fields', () => {
  const projected = projectFiveLaneMaterialToMain8(emptyMain8(), [{
    task: {},
    lanes: {
      fact: { fact_requirements: [] },
      risk: { risks: [] },
      multi: { perspectives: [] },
      inquiry: { inquiry_lens: [], evidence_need: [] },
      compare: { dimensions: ['Cost・費用'] }
    }
  }]);

  assert.equal(Object.hasOwn(projected['06_comparison'], 'selected_candidate'), false);
  assert.equal(Object.hasOwn(projected['06_comparison'], 'candidate_ranking'), false);
  assert.deepEqual(projected['06_comparison'].dimensions, ['Cost・費用']);
});
