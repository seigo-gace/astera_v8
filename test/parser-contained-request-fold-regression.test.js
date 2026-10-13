'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeMultiJudgmentCase, isSmallParserSubtask } =
  require('../src/runtime/multi-judgment-case-normalizer');

test('short nested Japanese parser imperative is not a third user request', () => {
  const source = 'Node.js 22の公式サポート状況を確認し、事実と未確認事項を区別してください。';
  const first = 'Node.js 22の公式サポート状況を確認し';
  const second = '事実と未確認事項を区別してください';
  const nested = '区別してください';
  function request(id, text, origin) {
    const start = source.indexOf(text);
    assert.ok(start >= 0);
    return {
      id, request_text: text, source_origin: origin,
      source_span: { start, end: start + text.length, text }
    };
  }
  const r1 = request('R01', first, 'SOURCE_REQUEST_SPAN');
  const r2 = request('R02', second, 'SOURCE_REQUEST_SPAN');
  const r3 = request('R03', nested, 'PARSER_TASK_GRAPH');
  assert.equal(isSmallParserSubtask(r2, r3), true);
  assert.equal(isSmallParserSubtask(r1, r3), false);

  const model = { request_count: 3, judgment_requests: [r1, r2, r3],
    observations: [], request_relations: [] };
  const task = (id, request_id) => ({
    id, request_id, evidence_need: { required: false, reasons: [], queries: [] }
  });
  const prepared = {
    analysis_task_packet: {
      case_model: model, tasks: [task('T01', 'R01'), task('T02', 'R02'), task('T03', 'R03')]
    }
  };
  const out = normalizeMultiJudgmentCase(prepared, { question: source });
  const next = out.analysis_task_packet;
  assert.equal(next.case_model.request_count, 2);
  assert.deepEqual(next.case_model.judgment_requests.map((r) => r.request_text),
    [first, second]);
  assert.deepEqual(next.tasks.map((t) => t.request_id), ['R01', 'R02', 'R02']);
  assert.deepEqual(next.case_model.request_task_ids, { R01: ['T01'], R02: ['T02', 'T03'] });
  assert.deepEqual(next.case_model.normalization.parser_subtasks_folded_into_source_requests, ['R03']);
});
