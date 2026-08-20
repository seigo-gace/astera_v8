'use strict';
// 目的: Sudachiが割った複合語/慣用句を1トークンに再結合し、
//       内部の単語(材料・鍵)が専門Lensの根拠に使われないようにする。
// シード最小。追加は運用ログのUNDETERMINED頻出のみ（推測で先回り登録しない）。

const PROTECTED = new Set([
  '判断材料', '比較材料', '検討材料',
  '長持ちの鍵', '成功の鍵', '解決の鍵', '改善の鍵',
  '改善の余地',
  '手入れ', '手を入れる',
  '話を詰める', '詰めが甘い',
]);

function applyProtection(tokens) {
  const out = [];
  let i = 0;
  const maxSpan = 4;
  while (i < tokens.length) {
    let matched = null;
    for (let span = Math.min(maxSpan, tokens.length - i); span >= 2; span--) {
      const surface = tokens.slice(i, i + span).map(t => t.surface).join('');
      if (PROTECTED.has(surface)) { matched = { surface, span }; break; }
    }
    if (matched) {
      out.push({ surface: matched.surface, pos: ['複合語'], normalized: matched.surface, protected: true });
      i += matched.span;
    } else {
      out.push(tokens[i]); i += 1;
    }
  }
  return out;
}

module.exports = { applyProtection, PROTECTED };
