'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCaseModel } = require('../src/runtime/multi-judgment-request-planner');

test('case model preserves N explicit judgment requests without a fixed request-count template', () => {
  const input = [
    '表示情報を見直してくれ。',
    '設定OFF時の案内を追加してくれ。',
    '画像投稿後の不要線をなくせ。',
    '履歴復元時の表示も確認してくれ。',
    '内部エラーが利用者へ見えていないか監査してくれ。'
  ].join('');
  const model = buildCaseModel(input);
  assert.equal(model.request_count, 5);
  assert.deepEqual(model.judgment_requests.map((item) => item.id), ['R01','R02','R03','R04','R05']);
  assert.match(model.judgment_requests[0].request_text, /表示情報/);
  assert.match(model.judgment_requests[4].request_text, /内部エラー/);
  assert.deepEqual(model.request_relations, []);
});

test('punctuation inside requested UI wording does not create a phantom judgment request', () => {
  const input = [
    'userに見せるもの、見せないものを見直して検討しろ。',
    'オプションをオフにしたら＋を押した時に、オプション名をオンにしてください。の表示を入れるようにしろ。',
    '画像投稿後に不要な線がはいるのをなくせ。'
  ].join('');
  const model = buildCaseModel(input);
  assert.equal(model.request_count, 3, JSON.stringify(model, null, 2));
  assert.match(model.judgment_requests[1].request_text, /オンにしてください/);
  assert.ok(model.global_context.conditions.some((item) => /オフ/.test(item)));
  assert.deepEqual(model.request_relations, [], 'toggle condition is request-local and must not become a dependency on the previous request');
});

test('explicit sequence cue becomes a request dependency instead of unsafe parallelization', () => {
  const model = buildCaseModel('現在仕様を確認してくれ。その後、影響範囲を整理してくれ。最後に修正案を検討してくれ。');
  assert.equal(model.request_count, 3);
  assert.deepEqual(model.request_relations.map((item) => [item.from_request_id, item.to_request_id]), [['R01','R02'],['R02','R03']]);
});

test('single request remains single instead of being expanded just to fill Main8', () => {
  const model = buildCaseModel('この仕様の公式根拠を確認して判断材料を整理して。');
  assert.equal(model.request_count, 1);
  assert.equal(model.multi_judgment, false);
});
