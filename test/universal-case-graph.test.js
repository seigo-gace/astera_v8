'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadUniversalCorpus } = require('../scripts/universal-judgment-corpus-v1');
const { applyUniversalCaseGraph, buildWaves, taskRequestScore } = require('../src/runtime/universal-case-graph');

function byId(id) {
  const row = loadUniversalCorpus().find((item) => item.id === id);
  assert.ok(row, `missing corpus case ${id}`);
  return row;
}

function preparedWithTasks(question, tasks, extra = {}) {
  return {
    original_question: question,
    normalized_question: question,
    language: extra.language || 'ja',
    instruction_understanding: {
      overall_status: extra.overall_status || 'PARTIAL',
      blocked_reasons: extra.blocked_reasons || []
    },
    analysis_task_packet: {
      tasks,
      dependencies: [],
      execution_waves: tasks.length ? [tasks.map((task) => task.id)] : [],
      hard_blockers: extra.hard_blockers || [],
      unresolved: extra.unresolved || [],
      constraints: [], prohibitions: [], preserve: [], deadlines: [], conditions: [], exceptions: [],
      observable_material: {},
      task_graph_validation: { valid: true, cycle: [], dependency_count: 0, wave_count: tasks.length ? 1 : 0 }
    }
  };
}

function broadFallback(question, id = 'T01') {
  return {
    id,
    action: 'analyze',
    target: '入力内容',
    objective: '入力内容を判断材料として整理する',
    purpose: '入力内容を判断材料として整理する',
    raw_text: question,
    source_span: { start: 0, end: question.length, text: question },
    depends_on: [],
    evidence_need: { required: false, queries: [], reasons: [] }
  };
}

test('5k JA formal design input recovers source-backed requests instead of one full-input fallback task', () => {
  const row = byId('known-clean-ai-ja-5k');
  const prepared = preparedWithTasks(row.input, [broadFallback(row.input)], { language: 'ja', overall_status: 'PARTIAL' });
  const out = applyUniversalCaseGraph(prepared, { question: row.input, language: 'ja' });
  const packet = out.analysis_task_packet;
  assert.equal(packet.universal_case_graph.applied, true);
  assert.ok(packet.case_model.request_count >= 12, `request_count=${packet.case_model.request_count}`);
  assert.ok(packet.tasks.length >= packet.case_model.request_count);
  assert.equal(packet.case_model.parser_task_mapping.retained_task_ids.includes('T01'), false, 'whole-input fallback must not represent a local request');
  assert.ok(packet.case_model.parser_task_mapping.recovered_request_ids.length >= 12);
  assert.equal(packet.execution_waves.flat().length, packet.tasks.length);
});

test('5k EN formal design input uses same Case Graph contract', () => {
  const row = byId('known-clean-ai-en-5k');
  const prepared = preparedWithTasks(row.input, [broadFallback(row.input)], { language: 'en', overall_status: 'PARTIAL' });
  const out = applyUniversalCaseGraph(prepared, { question: row.input, language: 'en' });
  const model = out.analysis_task_packet.case_model;
  assert.equal(model.schema, 'astera.case-graph.v2');
  assert.equal(model.compatibility_schema, 'astera.case-model.v1');
  assert.ok(model.request_count >= 12);
  assert.ok(model.judgment_requests.every((request) => request.source_origin === 'UNIVERSAL_SOURCE_GRAPH'));
});

test('noisy 1k input preserves mapped Parser tasks and recovers uncovered requests', () => {
  const row = byId('known-noisy-multi-ja-1k');
  const firstText = '投稿フォーム周りをもう一回確認してほしい';
  const start = row.input.indexOf(firstText);
  assert.ok(start >= 0);
  const task = {
    id: 'T03', action: 'verify', target: '投稿フォーム', objective: firstText, purpose: firstText,
    raw_text: firstText, source_span: { start, end: start + firstText.length, text: firstText }, depends_on: [],
    evidence_need: { required: false, queries: [], reasons: [] }
  };
  const prepared = preparedWithTasks(row.input, [task], { language: 'ja', overall_status: 'PARTIAL' });
  const out = applyUniversalCaseGraph(prepared, { question: row.input, language: 'ja' });
  const model = out.analysis_task_packet.case_model;
  assert.ok(model.request_count >= 10);
  assert.ok(model.parser_task_mapping.retained_task_ids.includes('T03'));
  assert.ok(model.parser_task_mapping.recovered_request_ids.length >= 8);
  assert.ok(out.analysis_task_packet.tasks.some((item) => item.id === 'T03' && /^R\d{2}$/.test(item.request_id)));
});

test('Request count is independent from internal Task count', () => {
  const input = '画面を確認して。必要なら原因を検証して。その後、表示を修正して。';
  const task = {
    id: 'T01', action: 'verify', raw_text: '画面を確認して。',
    source_span: { start: 0, end: '画面を確認して。'.length, text: '画面を確認して。' }, depends_on: [],
    evidence_need: { required: false, queries: [], reasons: [] }
  };
  const prepared = preparedWithTasks(input, [task], { language: 'ja', overall_status: 'PARTIAL' });
  const out = applyUniversalCaseGraph(prepared, { question: input, language: 'ja' });
  assert.ok(out.analysis_task_packet.case_model.request_count >= 3);
  assert.ok(out.analysis_task_packet.tasks.length >= 3);
  assert.ok(out.analysis_task_packet.tasks.some((item) => item.id === 'T01'));
});

test('explicit sequence creates dependency instead of unsafe same-wave execution', () => {
  const input = '現在仕様を確認して。その後、影響範囲を整理して。最後に修正案を検討して。';
  const prepared = preparedWithTasks(input, [], { language: 'ja', overall_status: 'PARTIAL', unresolved: ['NO_EXECUTABLE_ACTION'] });
  const out = applyUniversalCaseGraph(prepared, { question: input, language: 'ja' });
  const packet = out.analysis_task_packet;
  assert.ok(packet.case_model.request_count >= 3);
  assert.ok(packet.dependencies.length >= 2);
  assert.ok(packet.execution_waves.length >= 3);
  for (let index = 1; index < packet.execution_waves.length; index += 1) {
    assert.notDeepEqual(packet.execution_waves[index], packet.execution_waves[index - 1]);
  }
});

test('conditions, prohibitions and observations remain attached without becoming phantom Requests', () => {
  const input = [
    '画像投稿後の不要線を削除して。',
    'ただし必要なAttachment境界は残す。',
    'OptionがOFFの場合は対象Option名を案内すること。',
    '新しいDatabaseは追加しない。'
  ].join('\n');
  const prepared = preparedWithTasks(input, [], { language: 'ja', overall_status: 'PARTIAL', unresolved: ['NO_EXECUTABLE_ACTION'] });
  const out = applyUniversalCaseGraph(prepared, { question: input, language: 'ja' });
  const model = out.analysis_task_packet.case_model;
  assert.equal(model.request_count, 2);
  assert.ok(model.judgment_requests.some((request) => request.local_context.conditions.length >= 1));
  const prohibitions = [
    ...(model.global_context.prohibitions || []),
    ...model.judgment_requests.flatMap((request) => request.local_context.prohibitions || [])
  ];
  assert.ok(prohibitions.some((value) => value.includes('Database')));
});

test('user observation remains unverified in Case Graph', () => {
  const input = '画像投稿後に線が出ることがあるので原因を確認して。';
  const prepared = preparedWithTasks(input, [], { language: 'ja', overall_status: 'PARTIAL', unresolved: ['NO_EXECUTABLE_ACTION'] });
  const out = applyUniversalCaseGraph(prepared, { question: input, language: 'ja' });
  const observations = out.analysis_task_packet.case_model.observations;
  assert.ok(observations.length >= 1);
  assert.ok(observations.every((item) => item.truth_state === 'USER_REPORTED_UNVERIFIED'));
});

test('external evidence intent is source-backed and not inherited from parser search state', () => {
  const input = '表示を修正して。根拠も調査して確認して。';
  const prepared = preparedWithTasks(input, [
    { id: 'T01', action: 'improve', raw_text: '表示を修正して。', source_span: { start: 0, end: 8, text: '表示を修正して。' }, depends_on: [], evidence_need: { required: true, queries: ['x'], reasons: ['INTERNAL_VERIFY'] } }
  ], { language: 'ja', overall_status: 'PARTIAL' });
  const out = applyUniversalCaseGraph(prepared, { question: input, language: 'ja' });
  const requests = out.analysis_task_packet.case_model.judgment_requests;
  assert.ok(requests.length >= 2);
  assert.equal(requests[0].external_evidence_requested, false);
  assert.equal(requests[1].external_evidence_requested, true);
});

test('whole-document Parser task scores below local ownership threshold', () => {
  const whole = { start: 0, end: 5000 };
  const local = { start: 1000, end: 1200 };
  assert.equal(taskRequestScore(whole, local), 0);
});

test('topological wave builder is fail-closed on cycles', () => {
  const result = buildWaves([
    { id: 'T01', depends_on: ['T02'] },
    { id: 'T02', depends_on: ['T01'] }
  ]);
  assert.equal(result.valid, false);
  assert.deepEqual(new Set(result.cycle), new Set(['T01', 'T02']));
});
