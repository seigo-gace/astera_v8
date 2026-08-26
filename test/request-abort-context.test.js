'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createRequestAbortContext } = require('../src/request-abort-context');

function pair() {
  const req = new EventEmitter();
  const res = new EventEmitter();
  res.writableEnded = false;
  return { req, res };
}

test('request aborted becomes a generic AbortSignal', () => {
  const { req, res } = pair();
  const context = createRequestAbortContext(req, res);
  req.emit('aborted');
  assert.equal(context.signal.aborted, true);
  context.dispose();
});

test('response close before finish aborts', () => {
  const { req, res } = pair();
  const context = createRequestAbortContext(req, res);
  res.emit('close');
  assert.equal(context.signal.aborted, true);
  context.dispose();
});

test('response finish marks completion and later close does not abort', () => {
  const { req, res } = pair();
  const context = createRequestAbortContext(req, res);
  res.writableEnded = true;
  res.emit('finish');
  res.emit('close');
  assert.equal(context.signal.aborted, false);
  context.dispose();
});

test('dispose removes boundary listeners', () => {
  const { req, res } = pair();
  const context = createRequestAbortContext(req, res);
  context.dispose();
  req.emit('aborted');
  res.emit('close');
  assert.equal(context.signal.aborted, false);
});
