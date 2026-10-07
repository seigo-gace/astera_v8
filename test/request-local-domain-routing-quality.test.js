'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { routeDomainTemplates } = require('../src/domain-template-router');

test('user-facing application error-boundary request is software-owned even when examples mention credits or purchases', () => {
  const question = 'それからユーザーに見せるエラーと見せなくていい内部エラーがごちゃまぜになってる感じがするので、system側の通信失敗とか内部API名とかstack traceみたいなのは見せず、利用回数上限、クレジット不足、購入失敗、権限不足みたいにユーザー自身が対処できるものだけ分かる文章にしてほしい。';
  const route = routeDomainTemplates({ question, context: '' });
  const diagnostic = JSON.stringify({
    primary: route.primary && { id: route.primary.id, matched_signals: route.primary.matched_signals, score: route.primary.score },
    secondary: (route.secondary || []).map((item) => ({ id: item.id, matched_signals: item.matched_signals, score: item.score }))
  });
  assert.equal(route.primary?.id, 'G29', 'request must remain software-owned: ' + diagnostic);
});
