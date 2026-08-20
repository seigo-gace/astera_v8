'use strict';
// 目的: scoreGenre の includes() 部分一致を廃止する代替。
// トークン列に対し「単一トークン完全一致」または「連続トークンの連結一致」
// のみをヒットとする。部分一致(材料 ⊂ 判断材料)は構造的に成立しない。
// 非AI・決定論: 文字列比較のみ。

function buildIndex(tokens) {
  return tokens.map(t => ({ surface: t.surface, normalized: t.normalized || t.surface }));
}

const MAX_SPAN = 4;

function matchTerm(term, index) {
  const n = index.length;
  for (let i = 0; i < n; i++) {
    if (index[i].surface === term || index[i].normalized === term) return true;
    let concat = index[i].surface;
    if (concat.length >= term.length && concat !== term) continue;
    for (let span = 1; span < MAX_SPAN && i + span < n; span++) {
      concat += index[i + span].surface;
      if (concat === term) return true;
      if (concat.length > term.length) break;
    }
  }
  return false;
}

module.exports = { buildIndex, matchTerm };
