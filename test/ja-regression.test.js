'use strict';
const assert = require('node:assert');
const { routeDomainTemplates } = require('../src/domain-template-router');
function run(q){ return routeDomainTemplates({ question:q, context:'' }); }

{ const r = run('回答の判断材料を整理して改善して');
  assert.ok(!r.primary || r.primary.id !== 'G20', 'NG:判断材料で化学発火'); }
{ const r = run('カバンを長持ちさせる鍵は日々の手入れです');
  assert.ok(!r.primary || r.primary.id !== 'G31', 'NG:鍵で認証発火'); }
{ const r = run('革カバンの手入れと保管方法を教えて');
  assert.ok(!r.primary || r.primary.id !== 'G20', 'NG:カバン手入れで化学発火'); }
{ const r = run('それについて教えて');
  assert.ok(r.classification_basis === 'CLASSIFICATION_UNRESOLVED' || r.primary === null,
    'NG:低信頼で確定'); }
console.log('ja-regression: all assertions passed');
