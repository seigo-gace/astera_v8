'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { createMockJapaneseParserClient, mockJapaneseParserResult } = require('./helpers/japanese-parser-mcp-mock');

const silentLogger = { write() {}, async flush() {} };

const QUESTION = [
  '他にもあるはずだから、userに見せるもの、見せないものを徹底的に見直して検討しろ。',
  'またオプションのトグルをオフにしたらそもそもページ内での投稿でformないの＋のタッチした時の表示はタッチしてたら、オプション名をオンにしてください。の表示を入れるようにしろ。',
  'また画像を投稿したが、formないにいらない線がはいるのをなくせ'
].join('');

function collapsedParser(text) {
  const first = text.indexOf('検討しろ');
  return mockJapaneseParserResult(text, {
    overall_status: 'PARTIAL',
    execution_allowed: true,
    blocked_reasons: [],
    meaning_graph: {
      semantic_hash: 'multi-judgment-collapsed-parser',
      graph_version: 'mock-v1',
      propositions: [{
        proposition_id: 'P1',
        intent_type: 'consider',
        predicate: '検討する',
        value: 'userに見せるもの、見せないもの',
        source_span: { start: 0, end: first + '検討しろ'.length + 1, source_text: text.slice(0, first + '検討しろ'.length + 1) }
      }],
      unresolved: [],
      reading_analysis: { predicate_frames: [], scope_operators: [] }
    },
    task_graph: {
      graph_version: 'mock-v1',
      tasks: [{
        task_id: 'A-001',
        intent_type: 'consider',
        action: '検討する',
        target: 'userに見せるもの、見せないもの',
        status: 'RESOLVED',
        original_span: { start: 0, end: first + '検討しろ'.length + 1, source_text: text.slice(0, first + '検討しろ'.length + 1) },
        dependencies: [],
        external_action: false,
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

test('one post with multiple requested judgment materials is not collapsed into one template task', async () => {
  const parserClient = createMockJapaneseParserClient({ resolveResult: collapsedParser });
  const engine = new AsteraEngine({ japaneseParserClient: parserClient, evidenceSearchClient: null, logger: silentLogger, poolSize: 4 });
  try {
    const out = await engine.process({ question: QUESTION, language: 'ja' }, { id: 'multi-judgment-request-contract' });
    const packet = out.result.analysis_task_packet;
    assert.equal(packet.case_model?.multi_judgment, true);
    assert.equal(packet.case_model?.request_count, 3, JSON.stringify(packet.case_model, null, 2));
    assert.equal(packet.tasks.length, 3, JSON.stringify(packet.tasks, null, 2));
    assert.deepEqual(packet.execution_waves, [['T01', 'T02', 'T03']]);
    assert.equal(packet.universal_case_graph?.applied, true, JSON.stringify(packet.universal_case_graph, null, 2));
    assert.equal(packet.universal_case_graph?.request_count, 3);
    assert.equal(packet.universal_case_graph?.retained_parser_tasks, 1);
    assert.deepEqual(new Set(packet.universal_case_graph?.recovered_requests || []), new Set(['R02', 'R03']));
    assert.match(packet.tasks[0].purpose, /見せるもの/);
    assert.match(packet.tasks[0].purpose, /見せないもの/);
    assert.match(packet.tasks[1].purpose, /オプション/);
    assert.match(packet.tasks[1].purpose, /オンにしてください/);
    assert.match(packet.tasks[2].purpose, /画像/);
    assert.match(packet.tasks[2].purpose, /線/);
    assert.ok((packet.case_model.observations || []).some((item) => /画像/.test(item.text) && /線/.test(item.text)));
    const [r1, r2, r3] = packet.case_model.judgment_requests;
    assert.deepEqual([r1.external_evidence_requested, r2.external_evidence_requested, r3.external_evidence_requested], [false, false, false]);
    assert.ok((r2.local_context?.conditions || []).some((item) => /オフ/.test(item)), JSON.stringify(r2.local_context, null, 2));
    assert.ok(!(r1.local_context?.conditions || []).some((item) => /オフ/.test(item)), JSON.stringify(r1.local_context, null, 2));
    assert.ok(!(r3.local_context?.conditions || []).some((item) => /オフ/.test(item)), JSON.stringify(r3.local_context, null, 2));
    assert.ok(!(packet.case_model.global_context?.conditions || []).some((item) => /オフ/.test(item)), JSON.stringify(packet.case_model.global_context, null, 2));
    assert.equal(out.result.five_stage.tasks.length, 3);
    assert.deepEqual(out.result.five_stage.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    const rendered = String(out.material.main8_text || out.material.text || '');
    const sections = rendered.split('\n---\n');
    assert.equal((rendered.match(/^---$/gm) || []).length, 7, rendered);
    assert.equal(sections.length, 8, rendered);
    for (const section of sections) {
      assert.match(section, /R01/u, section);
      assert.match(section, /R02/u, section);
      assert.match(section, /R03/u, section);
    }
    assert.match(sections[0], /3件/u);
    assert.match(sections[0], /見せるもの/u);
    assert.match(sections[0], /オプション/u);
    assert.match(sections[0], /線/u);
    assert.match(sections[2], /画像を投稿/u);
    assert.match(sections[2], /利用者報告/u);
    assert.match(sections[2], /R03[^\n]*確認済み事実として追加できる材料はまだない/u);
    assert.match(sections[4], /R01[^\n]*見せる\/見せない境界/u);
    assert.match(sections[4], /R02[^\n]*ON\/OFF/u);
    assert.match(sections[4], /R03[^\n]*症状だけを隠す/u);
    assert.match(sections[5], /R01[^\n]*現状[^\n]*対象範囲[^\n]*利用者影響/u);
    assert.match(sections[5], /R02[^\n]*実装箇所[^\n]*イベント\/操作経路[^\n]*ON\/OFF/u);
    assert.match(sections[5], /R03[^\n]*再現条件[^\n]*発生源[^\n]*component\/CSS\/style\/layout/u);
    assert.match(sections[6], /R01[^\n]*外部Evidenceを明示要求していない/u);
    assert.match(sections[6], /R02[^\n]*外部Evidenceを明示要求していない/u);
    assert.match(sections[6], /R03[^\n]*外部Evidenceを明示要求していない/u);
    assert.doesNotMatch(sections[6], /R0[123][^\n]*外部根拠は成立していない/u);
    assert.match(sections[7], /R01[^\n]*境界[^\n]*整理|R01[^\n]*全体を点検/u);
    assert.match(sections[7], /R02[^\n]*OFF[^\n]*表示確認/u);
    assert.match(sections[7], /R03[^\n]*不要線[^\n]*回帰確認/u);
    assert.ok(sections[7].indexOf('R03') < sections[7].indexOf('共通:'), sections[7]);
    assert.doesNotMatch(rendered, /Alternative evidence angle|completion=未取得|完了条件=未取得|response content|Parser subtask|外部根拠を検索し、採用可否を確認/u);
    assert.doesNotMatch(rendered, /T01|T02|T03|Task Wave|SearchExecution|EvidenceQuality|confirmed_claim_ids|support_evidence_refs|PARSER_/u);
    assert.equal(out.material.consumer_scope, 'HUMAN_AND_AI_SAME_MATERIAL');
  } finally {
    await engine.destroy();
  }
});

test('explicit request sequence produces deterministic dependency waves and does not copy first-task material to later requests', async () => {
  const sequenceQuestion = 'UI状態を確認して。その後、OFF時の案内文を実装して。最後に画像投稿後の線が消えたか検証して。';
  const parserClient = createMockJapaneseParserClient({ resolveResult: collapsedParser });
  const engine = new AsteraEngine({ japaneseParserClient: parserClient, evidenceSearchClient: null, logger: silentLogger, poolSize: 4 });
  try {
    const prepared = await engine.prepareRequest({ question: sequenceQuestion, language: 'ja' });
    assert.equal(prepared.analysis_task_packet.case_model?.request_count, 3, JSON.stringify(prepared.analysis_task_packet.case_model, null, 2));
    assert.deepEqual(prepared.analysis_task_packet.execution_waves, [['T02'], ['T03'], ['T04']]);
    const purposes = prepared.analysis_task_packet.tasks.map((task) => task.purpose);
    assert.match(purposes[0], /UI状態/);
    assert.match(purposes[1], /OFF時/);
    assert.doesNotMatch(purposes[1], /UI状態を確認/u);
    assert.match(purposes[2], /画像投稿後/);
    assert.doesNotMatch(purposes[2], /UI状態を確認|OFF時の案内文/u);
  } finally {
    await engine.destroy();
  }
});

test('independent requests share one wave instead of being serialized by source order', async () => {
  const independentQuestion = 'ヘッダーを確認して。フッターを確認して。';
  const parserClient = createMockJapaneseParserClient({ resolveResult: collapsedParser });
  const engine = new AsteraEngine({ japaneseParserClient: parserClient, evidenceSearchClient: null, logger: silentLogger, poolSize: 4 });
  try {
    const prepared = await engine.prepareRequest({ question: independentQuestion, language: 'ja' });
    assert.equal(prepared.analysis_task_packet.case_model?.request_count, 2, JSON.stringify(prepared.analysis_task_packet.case_model, null, 2));
    assert.deepEqual(prepared.analysis_task_packet.execution_waves, [['T02', 'T03']]);
  } finally {
    await engine.destroy();
  }
});