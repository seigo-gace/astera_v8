'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const inputUnderstanding = require('../src/input-understanding');
const { enrichRequest, buildGraph } = require('../src/deterministic-task-decomposer');

function understand(question, context = '') {
  return enrichRequest(inputUnderstanding.analyzeRequest({ question, context }), { question, context });
}

test('canonical Task decomposition applies context constraints only to the deterministically matched Task when target scope is explicit', () => {
  const request = understand(
    'APIを改善する。READMEを修正する。',
    'APIはmainを変更するな。READMEは現行構成を維持する。'
  );
  const api = request.analysis_task_packet.tasks.find((task) => /API/i.test(task.target));
  const readme = request.analysis_task_packet.tasks.find((task) => /README/i.test(task.target));
  assert.ok(api);
  assert.ok(readme);
  assert.ok(api.prohibitions.some((item) => /main/.test(item)));
  assert.equal(readme.prohibitions.some((item) => /main/.test(item)), false);
  assert.ok(readme.preserve.some((item) => /README/.test(item)));
  assert.equal(api.preserve.some((item) => /README/.test(item)), false);
  assert.ok(api.field_sources.prohibitions.some((item) => item.source === 'context' && item.scope === 'TASK'));
});

test('pronoun reference resolves to the immediately preceding unambiguous Task target with provenance', () => {
  const request = understand('APIサーバーを検証する。それを改善する。');
  assert.equal(request.analysis_task_packet.tasks.length, 2);
  const second = request.analysis_task_packet.tasks[1];
  assert.equal(second.target, 'APIサーバー');
  assert.equal(second.reference_resolution.kind, 'PREVIOUS');
  assert.deepEqual(second.reference_resolution.from_task_ids, ['T01']);
  assert.equal(second.field_sources.target[0].source, 'task_reference');
});

test('natural-language non-adjacent multi-parent dependency resolves both named prior Tasks', () => {
  const request = understand('API仕様を検証する。互換性を検証する。API仕様と互換性の検証完了後、移行を実装する。');
  const finalTask = request.analysis_task_packet.tasks.at(-1);
  assert.deepEqual(new Set(finalTask.depends_on), new Set(['T01', 'T02']));
  assert.ok(request.analysis_task_packet.dependencies.some((edge) => edge.from === 'T01' && edge.to === finalTask.id));
  assert.ok(request.analysis_task_packet.dependencies.some((edge) => edge.from === 'T02' && edge.to === finalTask.id));
});

test('conditional success/failure branches link to the condition Task without collapsing the branch into ordinary order', () => {
  const request = understand('APIを検証する。問題なければ移行を実装する。問題があれば報告書を作成する。');
  const groups = request.analysis_task_packet.branch_groups;
  assert.ok(groups.some((group) => group.condition_task_id === 'T01' && group.on_true.length >= 1 && group.on_false.length >= 1));
  const branchTasks = request.analysis_task_packet.tasks.filter((task) => task.execution_gate === 'CONDITIONAL');
  assert.ok(branchTasks.length >= 2);
  assert.ok(branchTasks.every((task) => task.depends_on.includes('T01')));
});

test('multiple actions in one sentence are split even without comma punctuation and keep source spans', () => {
  const request = understand('APIを検証して設定を修正する。');
  assert.equal(request.analysis_task_packet.tasks.length, 2);
  assert.equal(request.analysis_task_packet.tasks[0].action, 'verify');
  assert.equal(request.analysis_task_packet.tasks[1].action, 'improve');
  assert.equal(request.analysis_task_packet.tasks[1].depends_on.includes('T01'), true);
  assert.equal(request.analysis_task_packet.task_graph_validation.compound_split_count, 1);
  for (const task of request.analysis_task_packet.tasks) {
    assert.ok(Number.isInteger(task.source_span.start));
    assert.ok(Number.isInteger(task.source_span.end));
    assert.ok(task.source_span.end > task.source_span.start);
  }
});

test('decision-material wording remains a compare-material request instead of becoming a decision Task', () => {
  const request = understand('A案とB案を比較し、採用判断に必要な材料を出す。');
  assert.equal(request.analysis_task_packet.tasks.length, 1);
  const [task] = request.analysis_task_packet.tasks;
  assert.equal(task.action, 'compare');
  assert.equal(task.target, 'A案とB案');
  assert.equal(task.unresolved.includes('target'), false);
  assert.equal(request.analysis_task_packet.tasks.some((item) => item.action === 'decide'), false);
});

test('required Task contract fields and per-field provenance are retained in the canonical output', () => {
  const request = understand('APIを実装する。成功条件はRollback可能であること。検証はテストで行う。', '必ず互換性を維持する。');
  const task = request.analysis_task_packet.tasks[0];
  for (const field of ['id', 'source_span', 'action', 'target', 'purpose', 'premises', 'constraints', 'prohibitions', 'preserve', 'replace', 'conditions', 'exceptions', 'depends_on', 'parallel_group', 'deliverables', 'success_criteria', 'completion_criteria', 'verification', 'evidence_need', 'unresolved', 'field_sources']) {
    assert.ok(Object.hasOwn(task, field), `missing ${field}`);
  }
  for (const field of ['action', 'target', 'purpose', 'constraints', 'prohibitions', 'preserve', 'replace', 'conditions', 'exceptions', 'dependencies', 'parallel_group', 'deliverables', 'success_criteria', 'completion_criteria', 'verification', 'evidence_need', 'unresolved']) {
    assert.ok(Object.hasOwn(task.field_sources, field), `missing provenance ${field}`);
  }
});

test('cycle remains a hard blocker instead of falling through into an executable wave', () => {
  const tasks = [{ id: 'T01' }, { id: 'T02' }];
  const graph = buildGraph(tasks, [
    { from: 'T01', to: 'T02', type: 'TEST' },
    { from: 'T02', to: 'T01', type: 'TEST' }
  ]);
  assert.equal(graph.valid, false);
  assert.deepEqual(new Set(graph.cycle), new Set(['T01', 'T02']));
  assert.equal(graph.execution_waves.length, 0);
});
