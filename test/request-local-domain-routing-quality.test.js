'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { routeDomainTemplates } = require('../src/domain-template-router');
const { compileLensPlan } = require('../src/lens-plan');

test('user-facing application error-boundary request is software-owned even when examples mention credits or purchases', () => {
  const question = 'それからユーザーに見せるエラーと見せなくていい内部エラーがごちゃまぜになってる感じがするので、system側の通信失敗とか内部API名とかstack traceみたいなのは見せず、利用回数上限、クレジット不足、購入失敗、権限不足みたいにユーザー自身が対処できるものだけ分かる文章にしてほしい。';
  const route = routeDomainTemplates({ question, context: '' });
  const diagnostic = JSON.stringify({
    primary: route.primary && { id: route.primary.id, matched_signals: route.primary.matched_signals, score: route.primary.score },
    secondary: (route.secondary || []).map((item) => ({ id: item.id, matched_signals: item.matched_signals, score: item.score }))
  });
  assert.equal(route.primary?.id, 'G29', 'request must remain software-owned: ' + diagnostic);
});


test('engineering cross-domain routing preserves strong G25 ownership evidence into LensPlan provenance', () => {
  const question = '機械製造の材料強度と品質工学を検証する。';
  const route = routeDomainTemplates({ question, context: '' });
  const plan = compileLensPlan(route);
  const designer = (plan.channels.multi || []).find((entry) => entry.value === 'Designer');
  assert.ok(designer, JSON.stringify({ primary: route.primary?.id, secondary: route.secondary?.map((x) => x.id), plan }));
  const sources = designer.sources || [];
  assert.ok(sources.some((source) =>
    source.lens_id === 'G25'
    && (source.tier === 'PRIMARY' || (source.tier === 'SECONDARY' && (source.matched_signals || []).length >= 2))
  ), JSON.stringify({ primary: route.primary, secondary: route.secondary, designer }));
});
