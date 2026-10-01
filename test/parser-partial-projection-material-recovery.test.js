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

test('partial Japanese parser projection becomes substantive unified human/AI Main8 material instead of template leakage', async () => {
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
    assert.ok((packet.hard_blockers || []).some((item) => /NO_EXECUTABLE_ACTION|PARSER_ACTION_GUARD_BLOCKED/.test(String(item))), 'parser tension must remain traceable internally');

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

    const rendered = String(out.material.text || '');
    const sections = rendered.split('\n---\n');
    assert.equal(sections.length, 8, rendered);
    assert.equal(out.material.consumer_scope, 'HUMAN_AND_AI_SAME_MATERIAL');
    assert.equal(out.prompt, rendered, 'human and AI consumers must receive the same semantic material');

    assert.match(sections[0], /FAQ/);
    assert.match(sections[0], /問い合わせ例/);
    assert.match(sections[0], /A案/);
    assert.match(sections[0], /B案/);
    assert.match(sections[0], /作業時間/);
    assert.match(sections[0], /法務リスク/);
    assert.match(sections[0], /利用者理解/);

    assert.match(sections[1], /返金ポリシー/);
    assert.match(sections[1], /来週金曜/);
    assert.match(sections[1], /法務確認/);
    assert.match(sections[1], /未確定|未確認|未完了/);

    assert.match(sections[2], /A案[^\n]*3件/);
    assert.match(sections[2], /B案[^\n]*10件/);
    assert.match(sections[2], /7件/);
    assert.match(sections[2], /3\.33倍|3\.3倍/);
    assert.match(sections[2], /利用者入力|入力で与えられた|入力材料/);

    assert.match(sections[3], /法務確認/);
    assert.match(sections[3], /返金|既存内容|変えない/);
    assert.match(sections[3], /件数|作業時間/);
    assert.match(sections[3], /断定|確定|未確認/);

    assert.match(sections[4], /A案/);
    assert.match(sections[4], /B案/);
    assert.match(sections[4], /反対|確認|未確認/);
    assert.match(sections[4], /単一指標|件数/);

    assert.match(sections[5], /A案/);
    assert.match(sections[5], /B案/);
    assert.match(sections[5], /作業時間/);
    assert.match(sections[5], /法務リスク/);
    assert.match(sections[5], /利用者理解/);
    assert.match(sections[5], /現在分かること/);
    assert.match(sections[5], /まだ言えないこと/);
    assert.match(sections[5], /追加で必要な材料/);
    assert.match(sections[5], /1件あたり作業時間/);
    assert.match(sections[5], /法務確認結果/);
    assert.match(sections[5], /理解度|網羅率|読みやすさ/);

    assert.match(sections[6], /外部検索を必要としない|外部根拠|確認済み/);
    assert.match(sections[6], /利用者入力として与えられた材料|利用者入力の条件|利用者が与えた条件/);

    assert.match(sections[7], /返金ポリシー|固定する条件/);
    assert.match(sections[7], /作業時間/);
    assert.match(sections[7], /法務リスク/);
    assert.match(sections[7], /利用者理解/);
    assert.match(sections[7], /未確定/);

    const leakedInternalTemplate = /candidate_id|material_state|comparison_state|confirmed_claim_ids|undetermined_claim_ids|support_evidence_refs|counter_evidence_refs|missing_evidence_refs|policy_notes|Task Wave|Lens=|SearchExecution=|EvidenceQuality=|PARSER_|NO_EXECUTABLE_ACTION|MATERIAL_ONLY|OBSERVABLE_UNVERIFIED_MATERIAL|INSUFFICIENT_COMPARISON_MATERIAL/u;
    assert.doesNotMatch(rendered, leakedInternalTemplate, rendered);
    for (const section of sections) assert.ok(section.length >= 120, `section is too thin to be useful: ${section}`);
    assert.equal((rendered.match(/^---$/gm) || []).length, 7);
    assert.equal(out.result.no_normative_decision_generated, true);
  } finally {
    await engine.destroy();
  }
});