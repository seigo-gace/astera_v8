'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { createMockJapaneseParserClient, mockJapaneseParserResult } = require('./helpers/japanese-parser-mcp-mock');

const silentLogger = { write() {}, async flush() {} };

function textOf(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

test('partial Japanese parser projection cannot collapse full purpose/comparison material into final prohibition only', async () => {
  const question = [
    '来週金曜までにFAQへ新しい問い合わせ例を追加するための判断材料を整理して。',
    '公開済みの返金ポリシー文言は変えない。',
    '法務確認はまだ終わっていない。',
    'A案は問い合わせ例を3件追加、B案は10件追加。',
    'A案とB案を作業時間と法務リスクと利用者理解で比較して。',
    '最終判断や推奨はしないで。'
  ].join('');
  const parserClient = createMockJapaneseParserClient({
    resolveResult: (text) => {
      const finalSentence = '最終判断や推奨はしないで。';
      const start = text.lastIndexOf(finalSentence);
      return mockJapaneseParserResult(text, {
        overall_status: 'PARTIAL',
        execution_allowed: false,
        blocked_reasons: ['NO_EXECUTABLE_ACTION'],
        meaning_graph: {
          semantic_hash: 'mock-partial-prohibition-only',
          graph_version: 'mock-v1',
          propositions: [{
            proposition_id: 'P1',
            intent_type: 'prohibition',
            predicate: '禁止する',
            value: '最終判断や推奨はしないで',
            source_span: { start, end: text.length, source_text: finalSentence }
          }],
          unresolved: [],
          reading_analysis: { predicate_frames: [], scope_operators: [] }
        },
        task_graph: {
          graph_version: 'mock-v1',
          tasks: [{
            task_id: 'A-001',
            intent_type: 'prohibition',
            action: '禁止する',
            target: '最終判断や推奨は',
            status: 'RESOLVED',
            original_span: { start, end: text.length, source_text: finalSentence },
            dependencies: [],
            external_action: true,
            constraints: [],
            completion_criteria: [],
            verification_criteria: [],
            structured_constraints: []
          }],
          edges: [],
          constraints: []
        }
      });
    }
  });
  const engine = new AsteraEngine({ japaneseParserClient: parserClient, evidenceSearchClient: null, logger: silentLogger, poolSize: 5 });
  const canonicalExecutor = engine.getCanonicalTaskExecutor();
  const stageExecutor = canonicalExecutor.fiveStageExecutor;
  const originalStageExec = stageExecutor.exec.bind(stageExecutor);
  let observedLaneExecution = null;
  stageExecutor.exec = async (...args) => {
    const projected = await originalStageExec(...args);
    observedLaneExecution = projected.lane_execution;
    return projected;
  };

  try {
    const out = await engine.process({ question, language: 'ja' }, { id: 'partial-parser-material-recovery' });
    assert.equal(out.result.type, 'cognitive_map');
    const packet = out.result.analysis_task_packet;
    assert.equal(packet.parser_projection_recovery?.applied, true);
    assert.equal(packet.parser_projection_recovery?.replaced_partial_projection, true);
    assert.equal(packet.parser_projection_recovery?.external_evidence_requested, false);
    assert.ok(packet.parser_projection_recovery.task_union_coverage_ratio < 0.75);
    assert.equal(packet.tasks.length, 1);
    assert.equal(packet.tasks[0].action, 'compare');
    assert.equal(packet.tasks[0].evidence_need?.required, false);
    assert.match(packet.user_goal, /FAQ/);
    assert.match(packet.user_goal, /問い合わせ例/);
    assert.match(packet.user_goal, /追加/);
    assert.ok(packet.preserve.some((item) => /返金ポリシー/.test(item) && /変えない/.test(item)));
    assert.ok(packet.deadlines.some((item) => /来週金曜/.test(item)));
    assert.ok(packet.unresolved.some((item) => /法務確認/.test(item)));
    assert.deepEqual(packet.observable_material.candidates, ['A案', 'B案']);
    assert.ok((packet.hard_blockers || []).some((item) => /NO_EXECUTABLE_ACTION|PARSER_ACTION_GUARD_BLOCKED/.test(String(item))), 'parser tension must remain traceable');

    assert.deepEqual(out.result.five_stage.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    assert.equal(observedLaneExecution?.mode, 'FIVE_STAGE_PARALLEL_WORKER_THREADS');
    assert.equal(observedLaneExecution?.lane_count, 5);
    assert.equal(new Set((observedLaneExecution?.telemetry || []).map((item) => item.thread_id)).size, 5);
    const task = out.result.task_results[0];
    assert.ok(task);
    assert.equal(task.evidence?.search_state, 'NOT_REQUIRED');
    assert.ok((task.comparison?.comparison_candidates || []).includes('A案'));
    assert.ok((task.comparison?.comparison_candidates || []).includes('B案'));
    assert.ok(!(task.comparison?.comparison_candidates || []).includes('A案とB案'));
    for (const dimension of ['作業時間', '法務リスク', '利用者理解']) {
      assert.ok((task.comparison?.dimensions || []).includes(dimension), `missing dimension: ${dimension}`);
    }
    assert.match(textOf(task.risks), /法務|返金|Policy|禁止|未確認/);
    assert.ok((task.multi?.perspectives || []).length >= 2);
    assert.match(textOf(task.inquiry), /法務確認|未|unresolved/i);

    const judgment = out.result.judgment;
    assert.equal(judgment.order.length, 8);
    assert.match(textOf(judgment['01_purpose']), /FAQ/);
    assert.match(textOf(judgment['01_purpose']), /問い合わせ例/);
    assert.match(textOf(judgment['02_premise']), /返金ポリシー/);
    assert.match(textOf(judgment['02_premise']), /来週金曜/);
    assert.match(textOf(judgment['02_premise']), /法務確認/);
    assert.match(textOf(judgment['03_facts']), /3件/);
    assert.match(textOf(judgment['03_facts']), /10件/);
    assert.match(textOf(judgment['04_crisis']), /法務|返金|Policy|未確認/);
    assert.match(textOf(judgment['06_comparison']), /A案/);
    assert.match(textOf(judgment['06_comparison']), /B案/);
    assert.doesNotMatch(textOf(judgment['06_comparison'].comparison_candidates), /A案とB案/);
    assert.match(textOf(judgment['06_comparison']), /作業時間/);
    assert.match(textOf(judgment['06_comparison']), /法務リスク/);
    assert.match(textOf(judgment['06_comparison']), /利用者理解/);
    assert.match(textOf(judgment['08_reinstruction']), /返金ポリシー|変えない|維持/);

    const rendered = String(out.material.text || '');
    const sections = rendered.split('\n---\n');
    assert.equal(sections.length, 8, rendered);
    assert.match(sections[0], /FAQ/);
    assert.match(sections[0], /問い合わせ例/);
    assert.match(sections[1], /返金ポリシー/);
    assert.match(sections[1], /来週金曜/);
    assert.match(sections[1], /法務確認/);
    assert.match(sections[1], /未確定|未確認|未完了/);
    assert.match(sections[2], /3件/);
    assert.match(sections[2], /10件/);
    assert.match(sections[2], /未検証/);
    assert.match(sections[5], /A案/);
    assert.match(sections[5], /B案/);
    assert.doesNotMatch(sections[5], /candidates:[^\n]*A案とB案/);
    assert.match(sections[5], /作業時間/);
    assert.match(sections[5], /法務リスク/);
    assert.match(sections[5], /利用者理解/);
    assert.match(sections[6], /NOT_REQUIRED|UNDETERMINED/);
    assert.match(sections[7], /返金ポリシー/);
    assert.equal((rendered.match(/^---$/gm) || []).length, 7);
    assert.equal(out.result.no_normative_decision_generated, true);
  } finally {
    await engine.destroy();
  }
});
