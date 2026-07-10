'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { maskSecrets, parseJsonStrict } = require('../src/safe-json');
const StripeClient = require('../src/billing/stripe-client');
const KeyVault = require('../src/billing/key-vault');

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

test('KeyVault drops unknown LLM providers and falls back to null', () => {
  const vault = new KeyVault();
  const llm = vault.resolveRequestLLM({ llm: { chain: ['evil', 'anthropic'], apiKey: 'sk_test_xxx' } });
  assert.deepEqual(llm.chain, ['anthropic']);
  assert.equal(llm.apiKey, 'sk_test_xxx');
});

test('Stripe webhook verification accepts valid v1 signature over raw Buffer body', () => {
  const secret = 'whsec_test_secret';
  const body = Buffer.from(JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed', data: { object: { id: 'cs_test' } } }));
  const t = Math.floor(Date.now() / 1000);
  const signedPayload = Buffer.concat([Buffer.from(`${t}.`), body]);
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const client = new StripeClient({ webhookSecret: secret });
  const event = client.verifyWebhook(body, `t=${t},v1=${sig}`);
  assert.equal(event.id, 'evt_test');
});

test('Stripe webhook verification rejects invalid signature', () => {
  const client = new StripeClient({ webhookSecret: 'whsec_test_secret' });
  const body = Buffer.from('{"id":"evt_test"}');
  const t = Math.floor(Date.now() / 1000);
  assert.throws(() => client.verifyWebhook(body, `t=${t},v1=deadbeef`), /mismatch/);
});

const { readHumanState } = require('../src/hyperion-human-reader');

test('Hyperion human reader detects high pressure build mode', () => {
  const state = readHumanState('全部完璧にしてDL式で今すぐ出してくれ', { score: -1 });
  assert.equal(state.mode, 'high_pressure');
  assert.ok(state.likely_needs.includes('実行ファイル'));
  assert.ok(state.response_policy.some((x) => /問い返し/.test(x)));
});


test('Stripe webhook verification accepts one valid signature among multiple v1 signatures', () => {
  const secret = 'whsec_test_secret';
  const body = Buffer.from(JSON.stringify({ id: 'evt_multi', type: 'checkout.session.completed', data: { object: { id: 'cs_test' } } }));
  const t = Math.floor(Date.now() / 1000);
  const signedPayload = Buffer.concat([Buffer.from(`${t}.`), body]);
  const sig = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
  const client = new StripeClient({ webhookSecret: secret });
  const event = client.verifyWebhook(body, `t=${t},v1=deadbeef,v1=${sig}`);
  assert.equal(event.id, 'evt_multi');
});
