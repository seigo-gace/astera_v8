'use strict';

// Universal, source-backed structural understanding for arbitrary judgment-seeking text.
// This module is deterministic and document-type agnostic. It preserves original spans first,
// then projects reusable semantic atoms. It does not decide truth or final outcomes.

const REQUEST_JA = /(?:してください|してくれ|してほしい|しろ|せよ|するように|ようにしろ|なくせ|なくして|消して|削除して|除去して|外して|直して|見直して|改善して|修正して|調整して|検討して|確認して|調査して|比較して|整理して|表示して|入れて|付けて|追加して|実装して|対応して|レビューして|作成して|構築して|分離して|保持して|測定して|検証して|確認すること|維持すること|保持すること|分離すること|対応すること|確認できること|できるようにする)/u;
const REQUEST_EN = /(?:\bplease\b|\bmust\b|\bshall\b|\bshould\b|\bneed(?:s)?\s+to\b|\brequired\s+to\b|\bensure\b|\bverify\b|\breview\b|\bcheck\b|\bimplement\b|\badd\b|\bremove\b|\bfix\b|\bpreserve\b|\bseparate\b|\bsupport\b|\bmeasure\b|\bdo\s+not\b|\bnever\b)/iu;
const OBJECTIVE_JA = /(?:^|[【\s])(第?[一二三四五六七八九十0-9]+(?:の)?目的|目的[A-Za-z0-9一二三四五六七八九十]*)(?:は|:|：)/u;
const OBJECTIVE_EN = /\b(?:objective|goal|purpose|requirement)\s*(?:[a-z]+|\d+)?\s*:/iu;
const FORMAL_REQUIREMENT_JA = /(?:必須|必要|要件|要求|求める|受入条件|完了条件|合格条件)[^。！？!?]{0,100}(?:する|である|こと)/u;
const FORMAL_REQUIREMENT_EN = /(?:\bis required\b|\brequires?\b|\bacceptance criteria\b|\bcompletion criteria\b)/iu;
const PURE_PROHIBITION = /(?:最終判断|最終結論|推奨|採用|選定)[^。！？!?]{0,80}(?:しない|禁止|せず|出さない)|(?:\bmust\s+not\b|\bdo\s+not\b|\bnever\b)/iu;

function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n');
}

function detectLanguage(text, hint = '') {
  const requested = String(hint || '').trim().toLowerCase();
  if (requested.startsWith('ja')) return 'ja';
  if (requested.startsWith('en')) return 'en';
  const value = String(text || '');
  const ja = (value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  const latin = (value.match(/[A-Za-z]/g) || []).length;
  if (ja === 0 && latin === 0) return 'und';
  return ja >= latin * 0.15 ? 'ja' : 'en';
}

function pushNode(nodes, kind, start, end, text, parentId, order, extra = {}) {
  if (!(Number.isFinite(start) && Number.isFinite(end) && end > start)) return null;
  const id = `S${String(nodes.length + 1).padStart(5, '0')}`;
  const node = {
    id,
    kind,
    order,
    source_span: { start, end },
    text,
    normalized_text: String(text || '').normalize('NFKC').trim(),
    parent_id: parentId || null,
    ...extra
  };
  nodes.push(node);
  return node;
}

function lineSpans(source) {
  const spans = [];
  let start = 0;
  const re = /.*(?:\n|$)/gu;
  for (const match of source.matchAll(re)) {
    if (!match[0]) continue;
    const raw = match[0];
    const end = start + raw.length;
    const text = raw.endsWith('\n') ? raw.slice(0, -1) : raw;
    spans.push({ start, end: start + text.length, text });
    start = end;
  }
  return spans;
}

function classifyBlock(text) {
  const value = String(text || '').trim();
  if (!value) return 'blank';
  if (/^(?:#{1,6}\s+|【[^】]+】|(?:第?[一二三四五六七八九十0-9]+(?:章|節|項|の目的)|Objective\s+\w+|Requirement\s+\w*)\s*[:：]?)/iu.test(value)) return 'heading';
  if (/^(?:[-*+•]|\d+[.)]|[一二三四五六七八九十]+[.)、]|[A-Za-z][.)])\s*/u.test(value)) return 'list_item';
  return 'paragraph';
}

function sentenceSpansInRange(source, range) {
  const text = source.slice(range.start, range.end);
  const spans = [];
  const re = /[^。！？!?\n]+(?:[。！？!?]+|$)/gu;
  for (const match of text.matchAll(re)) {
    const raw = match[0];
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    const start = range.start + Number(match.index || 0) + left;
    const end = range.start + Number(match.index || 0) + raw.length - right;
    if (end > start) spans.push({ start, end, text: source.slice(start, end) });
  }
  if (!spans.length && range.end > range.start) spans.push({ start: range.start, end: range.end, text: source.slice(range.start, range.end) });
  return spans;
}

function clauseSpansInRange(source, range) {
  const text = source.slice(range.start, range.end);
  const spans = [];
  let cursor = 0;
  for (const match of text.matchAll(/[、,;；]+/gu)) {
    const boundary = Number(match.index || 0);
    const raw = text.slice(cursor, boundary);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (boundary - right > cursor + left) {
      const start = range.start + cursor + left;
      const end = range.start + boundary - right;
      spans.push({ start, end, text: source.slice(start, end) });
    }
    cursor = boundary + match[0].length;
  }
  const raw = text.slice(cursor);
  const left = raw.length - raw.trimStart().length;
  const right = raw.length - raw.trimEnd().length;
  if (text.length - right > cursor + left) {
    const start = range.start + cursor + left;
    const end = range.start + text.length - right;
    spans.push({ start, end, text: source.slice(start, end) });
  }
  return spans.length > 1 ? spans : [];
}

function buildSourceGraph(input, languageHint = '') {
  const source = normalizeText(input);
  const language = detectLanguage(source, languageHint);
  const nodes = [];
  const root = pushNode(nodes, 'document', 0, source.length, source, null, 0, { language });
  const lines = lineSpans(source);
  let blockOrder = 0;
  let active = null;
  const blocks = [];

  for (const line of lines) {
    const role = classifyBlock(line.text);
    if (role === 'blank') {
      if (active) { blocks.push(active); active = null; }
      continue;
    }
    if (!active || role === 'heading' || role === 'list_item') {
      if (active) blocks.push(active);
      active = { start: line.start, end: line.end, text: source.slice(line.start, line.end), role };
      if (role === 'heading' || role === 'list_item') { blocks.push(active); active = null; }
    } else {
      active.end = line.end;
      active.text = source.slice(active.start, active.end);
    }
  }
  if (active) blocks.push(active);
  if (!blocks.length && source.length) blocks.push({ start: 0, end: source.length, text: source, role: 'paragraph' });

  for (const block of blocks) {
    const blockNode = pushNode(nodes, block.role, block.start, block.end, block.text, root?.id, ++blockOrder, { language });
    if (!blockNode) continue;
    const sentences = sentenceSpansInRange(source, block);
    let sentenceOrder = 0;
    for (const sentence of sentences) {
      const sentenceNode = pushNode(nodes, 'sentence', sentence.start, sentence.end, sentence.text, blockNode.id, ++sentenceOrder, { language });
      if (!sentenceNode) continue;
      const clauses = clauseSpansInRange(source, sentence);
      let clauseOrder = 0;
      for (const clause of clauses) pushNode(nodes, 'clause', clause.start, clause.end, clause.text, sentenceNode.id, ++clauseOrder, { language });
    }
  }

  return {
    schema: 'astera.source-graph.v1',
    language,
    source_length: source.length,
    source,
    root_id: root?.id || null,
    nodes
  };
}

function operationFor(text) {
  const value = String(text || '').normalize('NFKC');
  if (/(?:比較|比べ|compare|versus|\bvs\.?\b)/iu.test(value)) return 'compare';
  if (/(?:削除|除去|なくす|消す|外す|remove|delete|eliminate)/iu.test(value)) return 'remove';
  if (/(?:検証|事実確認|確認|調査|監査|verify|validate|research|investigate|audit|check)/iu.test(value)) return 'verify';
  if (/(?:追加|実装|作成|構築|表示|implement|build|create|add|display|show)/iu.test(value)) return 'implement';
  if (/(?:改善|修正|見直|直す|調整|整理|improve|fix|refactor|adjust|organize)/iu.test(value)) return 'improve';
  if (/(?:計画|plan|roadmap)/iu.test(value)) return 'plan';
  return 'analyze';
}

function isRequestText(text) {
  const value = String(text || '').normalize('NFKC').trim();
  if (!value) return false;
  const objective = OBJECTIVE_JA.test(value) || OBJECTIVE_EN.test(value);
  const formal = FORMAL_REQUIREMENT_JA.test(value) || FORMAL_REQUIREMENT_EN.test(value);
  if (objective || formal) return true;
  if (PURE_PROHIBITION.test(value) && !(REQUEST_JA.test(value) || REQUEST_EN.test(value))) return false;
  return REQUEST_JA.test(value) || REQUEST_EN.test(value);
}

function atomTypesFor(text) {
  const value = String(text || '').normalize('NFKC').trim();
  const out = [];
  if (OBJECTIVE_JA.test(value) || OBJECTIVE_EN.test(value) || /(?:本当の目的|最終的に欲しい状態|the\s+goal\s+is|the\s+objective\s+is)/iu.test(value)) out.push('OBJECTIVE');
  if (isRequestText(value)) out.push('REQUEST');
  if (/(?:必須|必要|要求|要件|求める|\bmust\b|\bshall\b|\brequired\b|\brequires\b)/iu.test(value)) out.push('OBLIGATION');
  if (/(?:禁止|してはいけない|しないこと|勝手に[^。！？!?]{0,40}(?:しない|するな)|\bmust\s+not\b|\bdo\s+not\b|\bnever\b)/iu.test(value)) out.push('PROHIBITION');
  if (/(?:許可|してよい|可能|\bmay\b|\bpermitted\b|\ballowed\b)/iu.test(value)) out.push('PERMISSION');
  if (/(?:維持|保持|残す|壊さない|変えない|\bpreserve\b|\bretain\b|\bkeep\b|without\s+changing|do\s+not\s+break)/iu.test(value)) out.push('PRESERVE');
  if (/(?:場合|なら|ならば|とき|たら|れば|\bif\b|\bwhen\b|\bunless\b|provided\s+that)/iu.test(value)) out.push('CONDITION');
  if (/(?:ただし|例外|\bexcept\b|\bexcepting\b|\bhowever\b)/iu.test(value)) out.push('EXCEPTION');
  if (/(?:受入条件|完了条件|合格条件|Acceptance\s+Criteria|completion\s+criteria|pass\s+criteria)/iu.test(value)) out.push('ACCEPTANCE_CRITERION');
  if (/(?:根拠|出典|Evidence|source|事実確認|ファクトチェック|裏取り|\bverify\b|\bvalidation\b)/iu.test(value)) out.push('EVIDENCE_REQUIREMENT');
  if (/(?:観測|報告|ように見える|ことがある|発生した|エラー|不具合|seems|appears|sometimes|observed|reported|failure|error)/iu.test(value)) out.push('OBSERVATION');
  if (/(?:期限|締切|納期|までに|deadline|due\s+date|\bby\s+\d|\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/iu.test(value)) out.push('DEADLINE');
  if (/(?:依存|前提として|その後|次に|最後に|depends?\s+on|after\b|before\b|then\b|finally\b)/iu.test(value)) out.push('DEPENDENCY');
  return [...new Set(out)];
}

function buildSemanticAtoms(sourceGraph) {
  const source = sourceGraph?.source || '';
  const candidateNodes = (sourceGraph?.nodes || []).filter((node) => node.kind === 'clause' || node.kind === 'sentence' || node.kind === 'heading' || node.kind === 'list_item');
  const atoms = [];
  const seen = new Set();
  let order = 0;

  // Prefer the smallest source-backed unit for request extraction. Parent sentence atoms remain
  // available for types not already represented by a child span.
  const sorted = [...candidateNodes].sort((a, b) => {
    const al = a.source_span.end - a.source_span.start;
    const bl = b.source_span.end - b.source_span.start;
    return al - bl || a.source_span.start - b.source_span.start;
  });

  for (const node of sorted) {
    const types = atomTypesFor(node.text);
    for (const type of types) {
      const key = `${type}:${node.source_span.start}:${node.source_span.end}`;
      if (seen.has(key)) continue;
      if (type === 'REQUEST') {
        const contained = atoms.find((atom) => atom.type === 'REQUEST'
          && atom.source_span.start >= node.source_span.start
          && atom.source_span.end <= node.source_span.end);
        if (contained) continue;
      }
      seen.add(key);
      atoms.push({
        id: `A${String(++order).padStart(5, '0')}`,
        type,
        operation: type === 'REQUEST' ? operationFor(node.text) : null,
        source_node_id: node.id,
        source_span: { ...node.source_span },
        text: source.slice(node.source_span.start, node.source_span.end),
        normalized_text: node.normalized_text,
        language: sourceGraph.language,
        truth_state: type === 'OBSERVATION' ? 'USER_REPORTED_UNVERIFIED' : 'NOT_APPLICABLE'
      });
    }
  }

  const requests = atoms.filter((atom) => atom.type === 'REQUEST').sort((a, b) => a.source_span.start - b.source_span.start || a.source_span.end - b.source_span.end);
  return {
    schema: 'astera.semantic-atom-graph.v1',
    language: sourceGraph.language,
    atoms,
    request_atoms: requests.map((atom, index) => ({ ...atom, request_id: `R${String(index + 1).padStart(2, '0')}` })),
    counts: atoms.reduce((acc, atom) => { acc[atom.type] = (acc[atom.type] || 0) + 1; return acc; }, {})
  };
}

function buildUniversalSourceUnderstanding(input, languageHint = '') {
  const source_graph = buildSourceGraph(input, languageHint);
  const semantic_atoms = buildSemanticAtoms(source_graph);
  return { source_graph, semantic_atoms };
}

module.exports = {
  buildSourceGraph,
  buildSemanticAtoms,
  buildUniversalSourceUnderstanding,
  detectLanguage,
  isRequestText,
  operationFor
};
