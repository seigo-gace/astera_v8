'use strict';
const assert = require('node:assert');
const { applyProtection } = require('../src/runtime/ja/protected-phrases');
const { buildIndex, matchTerm } = require('../src/runtime/ja/term-matcher');

// term-matcher: 部分一致が起きないこと
assert.strictEqual(
  matchTerm('材料', buildIndex([{ surface: '判断材料' }])), false,
  'NG: 材料が判断材料に部分一致した');

// term-matcher: 単一トークン完全一致
assert.strictEqual(
  matchTerm('材料', buildIndex([{ surface: '建築' }, { surface: '材料' }])), true,
  'NG: 単一トークン一致しない');

// term-matcher: 連結一致
assert.strictEqual(
  matchTerm('材料強度', buildIndex([{ surface: '材料' }, { surface: '強度' }])), true,
  'NG: 連結一致しない');

// protected: 判断/材料 が 判断材料 に再結合される
{
  const r = applyProtection([{ surface: '判断' }, { surface: '材料' }]);
  assert.strictEqual(r.length, 1, 'NG: 保護結合されていない');
  assert.strictEqual(r[0].surface, '判断材料', 'NG: 結合語が違う');
  assert.strictEqual(r[0].protected, true, 'NG: protectedフラグなし');
}

console.log('ja-unit: all assertions passed');
