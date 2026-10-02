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
    assert.equal(packet.multi_judgment_recovery?.resulting_task_count, 3);
    assert.match(packet.tasks[0].purpose, /見せるもの/);
    assert.match(packet.tasks[0].purpose, /見せないもの/);
    assert.match(packet.tasks[1].purpose, /オプション/);
    assert.match(packet.tasks[1].purpose, /オンにしてください/);
    assert.match(packet.tasks[2].purpose, /画像/);
    assert.match(packet.tasks[2].purpose, /線/);
    assert.ok((packet.case_model.observations || []).some((item) => /画像/.test(item.text) && /線/.test(item.text)));
    const [r1, r2, r3] = packet.case_model.judgment_requests;
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
    assert.match(rendered, /3件[^\n]*判断要求|判断要求[^\n]*3件/u);
    assert.match(rendered, /R01[^\n]*見せるもの/);
    assert.match(rendered, /R02[^\n]*オプション/);
    assert.match(rendered, /R02[^\n]*オンにしてください/);
    assert.match(rendered, /R03[^\n]*画像/);
    assert.match(rendered, /R03[^\n]*線/);
    assert.match(rendered, /判断要求R##|各判断要求/u);
    assert.match(rendered, /利用者報告・外部未検証/);
    assert.match(rendered, /要求ごとに根拠状態を分離/u);
    assert.match(sections[2], /O01:[^\n]*画像[^\n]*線[^\n]*利用者報告・外部未検証/u);
    assert.match(sections[2], /R03:\s*確認済み事実として追加できる材料はまだない。/u);
    assert.doesNotMatch(sections[2], /R03:\s*画像を投稿した/u);
    assert.match(sections[4], /R01[\s\S]*必要情報まで隠さない/u);
    assert.match(sections[4], /R02[\s\S]*OFF・失敗・未設定/u);
    assert.match(sections[4], /R03[\s\S]*原因を残していない/u);
    assert.match(sections[5], /R01[\s\S]*判断に必要な確認材料/u);
    assert.match(sections[5], /R02[\s\S]*実装箇所・接続点/u);
    assert.match(sections[5], /R03[\s\S]*正確な再現条件/u);
    assert.match(sections[7], /R01[\s\S]*現在状態/u);
    assert.match(sections[7], /R02[\s\S]*実装箇所・接続点/u);
    assert.match(sections[7], /R03[\s\S]*正確な再現条件/u);
    assert.ok(sections[7].indexOf('R03:') < sections[7].indexOf('ある判断要求が未確認'), sections[7]);
    assert.ok(sections[7].indexOf('正確な再現条件') < sections[7].indexOf('ある判断要求が未確認'), sections[7]);
    assert.doesNotMatch(rendered, /Alternative evidence angle|の(?:完了|合格|受入)(?:・(?:完了|合格|受入))*条件を明示する|反例\s*条件不成立\s*例外|肯定形|否定形/u);
    assert.doesNotMatch(rendered, /INSUFFICIENT_TRADE_OFF_MATERIAL|confirmed_claim_ids|support_evidence_refs|Task Wave|SearchExecution=|EvidenceQuality=|PARSER_|NO_EXECUTABLE_ACTION/u);
  } finally {
    await engine.destroy();
  }
});
