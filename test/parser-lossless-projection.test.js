'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { requestFromParser, failClosedRequest } = require('../src/canonical-v4-engine');
const { enrichRequest, isMcpDeepPathRequest, parserFailClosedRequest } = require('../src/deterministic-task-decomposer');
const { readHumanState } = require('../src/human-reader');

function baseFastRequest(question) {
  return {
    schema_version: 'astera.request-model.v3-canonical-v4',
    normalized_question: question,
    original_question: question,
    target: '',
    action: 'analyze',
    objective: '',
    success_criteria: [],
    constraints: [],
    prohibitions: [],
    preserve: [],
    replace: [],
    verification: []
  };
}

test('MCP tasks=[] keeps parser constraints via projection without synthesizeFallbackTasks', () => {
  const question = '大学研究室の論文管理を進めたい。関係者が複数いて、予算・期限・品質のどれも譲れない。';
  const parserResult = {
    overall_status: 'PARTIAL',
    execution_allowed: true,
    blocked_reasons: [],
    meaning_graph: {
      graph_version: 'test-v1',
      semantic_hash: 'hash-test',
      propositions: [{
        proposition_id: 'P-1',
        intent_type: 'desire',
        value: '大学研究室の論文管理を進めたい。',
        source_span: { start: 0, end: 16, source_text: '大学研究室の論文管理を進めたい。' },
        status: 'RESOLVED'
      }],
      unresolved: [{ code: 'SCOPE', note: '予算・期限・品質' }]
    },
    task_graph: {
      graph_version: 'test-v1',
      tasks: [],
      edges: [],
      constraints: [{ constraint_type: 'limit', value: '予算・期限・品質のどれも譲れない', source_span: { start: 24, end: 40, source_text: '予算・期限・品質のどれも譲れない' } }]
    },
    contradictions: [],
    ambiguities: [],
    missing_information: [],
    unsupported_elements: [],
    timeouts: [],
    versions: { parser: 'test' },
    metrics: {}
  };
  const prepared = requestFromParser(baseFastRequest(question), parserResult, question);
  assert.equal(isMcpDeepPathRequest(prepared), true);
  assert.ok((prepared.analysis_task_packet.constraint_records || []).length >= 1);
  assert.ok((prepared.analysis_task_packet.tasks || []).length >= 1);
  const enriched = enrichRequest(prepared, { question });
  assert.ok((enriched.analysis_task_packet.tasks || []).length >= 1);
  assert.ok((enriched.analysis_task_packet.constraint_records || []).length >= 1);
  assert.equal(parserFailClosedRequest(enriched), false);
});

test('FAIL_CLOSED remains fail-closed and does not synthesize fallback tasks', () => {
  const question = '短い';
  const failClosed = failClosedRequest(baseFastRequest(question), { code: 'PARSER_UNAVAILABLE', message: 'down' });
  const enriched = enrichRequest(failClosed, { question });
  assert.equal(enriched.instruction_understanding.mode, 'FAIL_CLOSED');
  assert.equal((enriched.analysis_task_packet.tasks || []).length, 0);
  assert.ok((enriched.analysis_task_packet.unresolved || []).some((item) => /JAPANESE_PARSER_FAIL_CLOSED/.test(item)));
  assert.equal(parserFailClosedRequest(enriched), true);
});

test('deadlines survive context binding and enrichRequest aggregation', () => {
  const question = 'API改善の進め方を整理したい。';
  const parserResult = {
    overall_status: 'COMPLETE',
    execution_allowed: true,
    blocked_reasons: [],
    meaning_graph: { graph_version: 'v1', semantic_hash: 'h1', propositions: [], unresolved: [] },
    task_graph: {
      graph_version: 'v1',
      tasks: [{
        task_id: 'A-001',
        intent_type: 'request',
        action: 'analyze',
        target: 'API',
        status: 'RESOLVED',
        original_span: { start: 0, end: question.length, source_text: question },
        dependencies: [],
        external_action: false,
        constraints: [],
        structured_constraints: [{ constraint_type: 'deadline', value: '来週金曜まで' }],
        completion_criteria: [],
        verification_criteria: []
      }],
      edges: [],
      constraints: []
    },
    contradictions: [],
    ambiguities: [],
    missing_information: [],
    unsupported_elements: [],
    timeouts: [],
    versions: { parser: 'test' },
    metrics: {}
  };
  const prepared = requestFromParser(baseFastRequest(question), parserResult, question);
  const enriched = enrichRequest(prepared, { question, context: '納期は来月15日まで。' });
  const deadlines = enriched.analysis_task_packet.deadlines || [];
  assert.ok(deadlines.some((item) => /来週金曜|来月15日/.test(item)));
});

test('Human Reader presentation flags stay non-mutating in engine frame metadata', () => {
  const human = readHumanState('判断材料だけ欲しい', {});
  const wrapped = {
    mode: human.mode,
    signals: human.signals,
    response_policy: human.response_policy,
    drift_watch: human.drift_watch,
    fact_mutation_allowed: false,
    evidence_mutation_allowed: false,
    constraint_mutation_allowed: false
  };
  assert.equal(wrapped.fact_mutation_allowed, false);
  assert.equal(wrapped.evidence_mutation_allowed, false);
  assert.equal(wrapped.constraint_mutation_allowed, false);
});
