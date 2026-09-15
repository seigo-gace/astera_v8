'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { maskSecrets, parseJsonStrict } = require('../src/safe-json');
const { resolveRequestLLM } = require('../src/llm-request');

test('safe-json masks keys and secret-looking values deeply', () => {
  const out = maskSecrets({
    nested: { apiKey: 'sk_test_abcdefghijklmnopqrstuvwxyz' },
    text: 'token kg_abcdefghijklmnop and whsec_abcdefghijklmnop'
  });
  assert.notEqual(out.nested.apiKey, 'sk_test_abcdefghijklmnopqrstuvwxyz');
  assert.doesNotMatch(out.text, /kg_abcdefghijklmnop/);
  assert.doesNotMatch(out.text, /whsec_abcdefghijklmnop/);
});

test('safe-json preserves repeated references while still marking real cycles', () => {
  const shared = { id: 'third_way', label: '第三案' };
  const cyclic = { id: 'cycle' };
  cyclic.self = cyclic;

  const out = maskSecrets({
    selected: shared,
    candidates: [shared],
    cyclic
  });

  assert.deepEqual(out.selected, { id: 'third_way', label: '第三案' });
  assert.deepEqual(out.candidates[0], { id: 'third_way', label: '第三案' });
  assert.equal(out.cyclic.self, '[Circular]');
});

test('parseJsonStrict returns HTTP 400 error metadata on bad JSON', () => {
  assert.throws(() => parseJsonStrict('{bad'), (err) => err.status === 400 && /Invalid JSON/.test(err.message));
});

test('resolveRequestLLM drops unknown LLM providers and falls back to null', () => {
  const llm = resolveRequestLLM({ llm: { chain: ['evil', 'anthropic'], apiKey: 'sk_test_xxx' } });
  assert.deepEqual(llm.chain, ['anthropic']);
  assert.equal(llm.apiKey, 'sk_test_xxx');
});

const { readHumanState } = require('../src/hyperion-human-reader');

test('Hyperion human reader detects high pressure build mode', () => {
  const state = readHumanState('全部完璧にしてDL式で今すぐ出してくれ', { score: -1 });
  assert.equal(state.mode, 'high_pressure');
  assert.ok(state.likely_needs.includes('実行ファイル'));
  assert.ok(state.response_policy.some((x) => /問い返し/.test(x)));
});
