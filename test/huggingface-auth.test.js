'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getHuggingFaceToken,
  requireHuggingFaceToken,
  buildHuggingFaceAuthHeaders
} = require('../src/huggingface/auth');

const SAMPLE_TOKEN = 'hf_test_secret_token_value_12345';

test('getHuggingFaceToken trims HF_TOKEN', () => {
  assert.equal(getHuggingFaceToken({ HF_TOKEN: `  ${SAMPLE_TOKEN}  ` }), SAMPLE_TOKEN);
});

test('getHuggingFaceToken returns empty string when unset', () => {
  assert.equal(getHuggingFaceToken({}), '');
  assert.equal(getHuggingFaceToken({ HF_TOKEN: '' }), '');
  assert.equal(getHuggingFaceToken({ HF_TOKEN: '   ' }), '');
});

test('requireHuggingFaceToken throws 503 when unset', () => {
  assert.throws(() => requireHuggingFaceToken({}), (err) => {
    assert.equal(err.status, 503);
    assert.match(err.message, /HF_TOKEN is not set/);
    assert.doesNotMatch(err.message, /hf_/);
    return true;
  });
});

test('requireHuggingFaceToken returns trimmed token without leaking it in errors', () => {
  const token = requireHuggingFaceToken({ HF_TOKEN: `  ${SAMPLE_TOKEN}  ` });
  assert.equal(token, SAMPLE_TOKEN);
});

test('buildHuggingFaceAuthHeaders adds Authorization and preserves extra headers', () => {
  const headers = buildHuggingFaceAuthHeaders(
    { HF_TOKEN: SAMPLE_TOKEN },
    { 'Content-Type': 'application/json', Accept: 'application/json' }
  );
  assert.equal(headers.Authorization, `Bearer ${SAMPLE_TOKEN}`);
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Accept, 'application/json');
});

test('buildHuggingFaceAuthHeaders overrides Authorization in extraHeaders', () => {
  const headers = buildHuggingFaceAuthHeaders(
    { HF_TOKEN: SAMPLE_TOKEN },
    { Authorization: 'Bearer stale' }
  );
  assert.equal(headers.Authorization, `Bearer ${SAMPLE_TOKEN}`);
});

test('buildHuggingFaceAuthHeaders throws 503 when unset without token in message', () => {
  assert.throws(() => buildHuggingFaceAuthHeaders({}), (err) => {
    assert.equal(err.status, 503);
    assert.match(err.message, /HF_TOKEN is not set/);
    assert.doesNotMatch(err.message, /hf_/);
    return true;
  });
});
