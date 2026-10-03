'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyUniversalCaseGraph } = require('../src/runtime/universal-case-graph');

function prepared(question, language) {
  return {
    original_question: question,
    normalized_question: question,
    language,
    instruction_understanding: { overall_status: 'COMPLETE' },
    analysis_task_packet: {
      tasks: [],
      dependencies: [],
      execution_waves: [],
      hard_blockers: [],
      unresolved: [],
      observable_material: {}
    }
  };
}

test('one Japanese decision request with material-shaping requirements still activates Case Graph', () => {
  const question = 'System設計変更について判断材料が欲しい。現在分かっている事実、未確認事項、主要な危険、比較に必要な軸、必要な根拠とその成立状態、次に確認する材料を示して。';
  const out = applyUniversalCaseGraph(prepared(question, 'ja'), { question, language: 'ja' });
  assert.equal(out.analysis_task_packet.universal_case_graph?.applied, true);
  assert.equal(out.analysis_task_packet.case_model?.request_count, 1);
  const request = out.analysis_task_packet.case_model?.judgment_requests?.[0];
  assert.ok((request?.local_context?.material_requirements || []).length >= 2, JSON.stringify(request, null, 2));
  assert.equal(out.analysis_task_packet.tasks.length, 1);
  assert.deepEqual(out.analysis_task_packet.tasks[0].material_requirements, request.local_context.material_requirements);
});

test('one English decision request retains material requirements without creating phantom requests', () => {
  const question = 'I need decision material for software architecture change. Separate known facts from unresolved items, identify material risks and disconfirming conditions, state comparison dimensions and evidence requirements, and say what should be verified next.';
  const out = applyUniversalCaseGraph(prepared(question, 'en'), { question, language: 'en' });
  assert.equal(out.analysis_task_packet.universal_case_graph?.applied, true);
  assert.equal(out.analysis_task_packet.case_model?.request_count, 1);
  const request = out.analysis_task_packet.case_model?.judgment_requests?.[0];
  assert.ok((request?.local_context?.material_requirements || []).length >= 3, JSON.stringify(request, null, 2));
  assert.equal(out.analysis_task_packet.tasks.length, 1);
});
