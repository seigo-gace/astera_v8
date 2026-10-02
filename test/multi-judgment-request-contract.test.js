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
    assert.equal(out.result.five_stage.tasks.length, 3);
    assert.deepEqual(out.result.five_stage.order, ['fact', 'risk', 'multi', 'inquiry', 'compare']);
    const rendered = String(out.material.main8_text || out.material.text || '');
    assert.doesNotMatch(rendered, /INSUFFICIENT_TRADE_OFF_MATERIAL|confirmed_claim_ids|support_evidence_refs|Task Wave|SearchExecution=|EvidenceQuality=/u);
  } finally {
    await engine.destroy();
  }
});
