'use strict';

// Lossless, deterministic structural understanding for arbitrary judgment-seeking text.
// Original source is preserved exactly as received by JavaScript. Normalization is carried
// separately. This layer does not establish truth and does not make final decisions.

const REQUEST_JA = /(?:判断材料(?:が欲しい|を(?:示して|出して|返して|まとめて))|してください|してくれ|してほしい|しろ|せよ|するように|ようにしろ|なくせ|なくして|消して|削除して|除去して|外して|直して|見直して|改善して|修正して|調整して|検討して|確認して|調査して|比較して|整理して|表示して|示して|入れて|付けて|追加して|実装して|対応して|レビューして|作成して|構築して|分離して|保持して|測定して|検証して|確認すること|維持すること|保持すること|分離すること|対応すること|確認できること|できるようにする|確認する[。！？!?]?$|(?:か)?(?:見|み)て(?:ほしい)?(?:けど)?[。！？!?]?$)/u;
const REQUEST_EN = /(?:\bplease\b|\bI\s+need\b|\bwe\s+need\b|\bmust\b|\bshall\b|\bshould\b|\bneed(?:s)?\s+to\b|\brequired\s+to\b|\bensure\b|\bverify\b|\breview\b|\bcheck\b|\bidentify\b|\bstate\b|\bprovide\b|\breturn\b|\bimplement\b|\badd\b|\bremove\b|\bfix\b|\bpreserve\b|\bseparate\b|\bsupport\b|\bmeasure\b|\bshow\b|\bdo\s+not\b|\bnever\b)/iu;
const OBJECTIVE_JA = /(?:^|[【\s])(第?[一二三四五六七八九十0-9]+(?:の)?目的|目的[A-Za-z0-9一二三四五六七八九十]*)(?:は|:|：)/u;
const OBJECTIVE_EN = /\b(?:objective|goal|purpose|requirement)\s*(?:[a-z]+|\d+)?\s*(?::|\bis\s+to\b)/iu;
const FORMAL_REQUIREMENT_JA = /(?:必須|必要|要件|要求|求める|受入条件|完了条件|合格条件)[^。！？!?]{0,140}(?:する|である|こと)/u;
const FORMAL_REQUIREMENT_EN = /(?:\bis required\b|\brequires?\b|\bacceptance criteria\b|\bcompletion criteria\b|\bpass criteria\b)/iu;
const FORMAL_REQUEST_TAIL_JA = /(?:する|できる)こと[。！？!?]?$/u;
const PURE_PROHIBITION = /(?:(?:追加|変更|削除|作成|導入|公開|実行|使用|出力|表示|保存|送信|採用|決定|推奨|選定)しない(?:こと)?[。！？!?]?$|(?:混同|流用)しない(?:こと)?[。！？!?]?$|(?:出さ|漏らさ)ない(?:こと)?[。！？!?]?$|しないこと|するな|してはいけない|禁止)|(?:最終判断|最終結論|推奨|採用|選定)[^。！？!?]{0,80}(?:しない|しないで|禁止|せず|出さない)|(?:^|[.;:!?]\s*)(?:must\s+not|do\s+not|never)\b/iu;
const MATERIAL_SHAPING_JA = /(?:現在分かっている事実|確認済み(?:の)?事実|未確認(?:事項|項目|点)?|未解決(?:事項|項目|点)?|主要(?:な)?(?:危険|リスク)|反対側から確認すべき条件|反証条件|失格条件|比較に必要な軸|比較軸|評価軸|必要な根拠|根拠(?:の)?成立状態|根拠状態|次に確認する(?:材料|事項|項目))/u;
const MATERIAL_SHAPING_EN = /(?:known facts?|confirmed facts?|unresolved (?:items?|issues?|questions?)|material risks?|disconfirming conditions?|falsification conditions?|comparison dimensions?|comparison criteria|evaluation criteria|evidence requirements?|evidence status|what should be verified next|what to verify next)/iu;
const MATERIAL_DIRECTIVE = /(?:分け|区別|整理|示|列挙|明示|確認|\bseparate\b|\bdistinguish\b|\bidentify\b|\bstate\b|\blist\b|\bshow\b|\bprovide\b|\bindicate\b|\bsay\b|\bverify\b)/iu;

function normalized(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
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
  const node = {
    id: `S${String(nodes.length + 1).padStart(5, '0')}`,
    kind,
    order,
    source_span: { start, end },
    text,
    normalized_text: normalized(text),
    parent_id: parentId || null,
    ...extra
  };
  nodes.push(node);
  return node;
}

function lineSpans(source) {
  const spans = [];
  let cursor = 0;
  while (cursor < source.length) {
    const nl = source.indexOf('\n', cursor);
    const endWithNl = nl < 0 ? source.length : nl + 1;
    let contentEnd = nl < 0 ? source.length : nl;
    if (contentEnd > cursor && source[contentEnd - 1] === '\r') contentEnd -= 1;
    spans.push({ start: cursor, end: contentEnd, line_end: endWithNl, text: source.slice(cursor, contentEnd) });
    cursor = endWithNl;
  }
  return spans;
}

function classifyBlock(text) {
  const value = String(text || '').trim();
  if (!value) return 'blank';
  if (/^(?:#{1,6}\s+|【[^】]+】|(?:第?[一二三四五六七八九十0-9]+(?:章|節|項|の目的)|Objective\s+\w+|Requirement\s+\w*)\s*(?::|：|is\s+to)?)/iu.test(value)) return 'heading';
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
  const source = String(input ?? '');
  const language = detectLanguage(source, languageHint);
  const nodes = [];
  const root = source.length ? pushNode(nodes, 'document', 0, source.length, source, null, 0, { language }) : null;
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
      let clauseOrder = 0;
      for (const clause of clauseSpansInRange(source, sentence)) {
        pushNode(nodes, 'clause', clause.start, clause.end, clause.text, sentenceNode.id, ++clauseOrder, { language });
      }
    }
  }

  return {
    schema: 'astera.source-graph.v1',
    language,
    source_length: source.length,
    source,
    normalized_source: normalized(source),
    root_id: root?.id || null,
    nodes
  };
}

function operationFor(text) {
  const value = normalized(text);
  if (/(?:比較|比べ|compare|versus|\bvs\.?\b)/iu.test(value)) return 'compare';
  if (/(?:削除|除去|なくす|なくせ|なくして|消す|消して|外す|外して|remove|delete|eliminate)/iu.test(value)) return 'remove';
  if (/(?:検証|事実確認|確認|調査|監査|verify|validate|research|investigate|audit|check)/iu.test(value)) return 'verify';
  if (/(?:追加|実装|作成|構築|表示|implement|build|create|add|display|show)/iu.test(value)) return 'implement';
  if (/(?:改善|修正|見直|直す|調整|整理|improve|fix|refactor|adjust|organize)/iu.test(value)) return 'improve';
  if (/(?:計画|plan|roadmap)/iu.test(value)) return 'plan';
  if (/(?:判断|決める|decide|decision)/iu.test(value)) return 'decide';
  return 'analyze';
}

function objectiveCue(value) {
  return OBJECTIVE_JA.test(value)
    || OBJECTIVE_EN.test(value)
    || /(?:本当の目的|最終的に欲しい状態|the\s+goal\s+is|the\s+objective\s+is)/iu.test(value);
}

function isRequestText(text) {
  const value = normalized(text);
  if (!value) return false;
  if (objectiveCue(value)) return true;
  if (FORMAL_REQUIREMENT_JA.test(value) || FORMAL_REQUIREMENT_EN.test(value)) return true;
  if (PURE_PROHIBITION.test(value) && !/(?:判断材料|decision\s+material|review|verify|check|fix|remove|implement)/iu.test(value)) return false;
  if (FORMAL_REQUEST_TAIL_JA.test(value)) return true;
  return REQUEST_JA.test(value) || REQUEST_EN.test(value);
}

function atomTypesFor(text) {
  const value = normalized(text);
  const out = [];
  if (objectiveCue(value)) out.push('OBJECTIVE');
  if (isRequestText(value)) out.push('REQUEST');
  if (/(?:必須|必要|要求|要件|求める|\bmust\b|\bshall\b|\brequired\b|\brequires\b)/iu.test(value)) out.push('OBLIGATION');
  if (/(?:(?:追加|変更|削除|作成|導入|公開|実行|使用|出力|表示|保存|送信|採用|決定|推奨|選定)しない(?:こと)?[。！？!?]?$|(?:混同|流用)しない(?:こと)?[。！？!?]?$|(?:出さ|漏らさ)ない(?:こと)?[。！？!?]?$|禁止|してはいけない|しないこと|勝手に[^。！？!?]{0,40}(?:しない|するな)|(?:最終判断|最終結論|推奨|採用|選定)[^。！？!?]{0,80}(?:しない|しないで|せず|禁止|出さない)|\bmust\s+not\b|\bdo\s+not\b|\bnever\b)/iu.test(value)) out.push('PROHIBITION');
  if (/(?:許可|してよい|可能|\bmay\b|\bpermitted\b|\ballowed\b)/iu.test(value)) out.push('PERMISSION');
  if (/(?:維持|保持|残す|壊さない|変えない|\bpreserve\b|\bretain\b|\bkeep\b|without\s+changing|do\s+not\s+break)/iu.test(value)) out.push('PRESERVE');
  if (/(?:場合|なら|ならば|とき|たら|れば|\bif\b|\bwhen\b|\bunless\b|provided\s+that)/iu.test(value)) out.push('CONDITION');
  if (/(?:ただし|例外|\bexcept\b|\bexcepting\b|\bhowever\b)/iu.test(value)) out.push('EXCEPTION');
  if (/(?:受入条件|完了条件|合格条件|Acceptance\s+Criteria|completion\s+criteria|pass\s+criteria)/iu.test(value)) out.push('ACCEPTANCE_CRITERION');
  if (/(?:根拠|出典|Evidence|source|事実確認|ファクトチェック|裏取り|\bverify\b|\bvalidation\b)/iu.test(value)) out.push('EVIDENCE_REQUIREMENT');
  if (/(?:観測|報告|ように見える|ことがある|発生した|エラー|不具合|seems|appears|sometimes|observed|reported|failure|error)/iu.test(value)) out.push('OBSERVATION');
  if (/(?:仮定|想定|おそらく|推測|assume|assumption|probably|likely)/iu.test(value)) out.push('ASSUMPTION');
  if (/[?？]$/u.test(value) || /(?:何|なぜ|どの|どれ|どう|\bwhat\b|\bwhy\b|\bwhich\b|\bhow\b)/iu.test(value)) out.push('QUESTION');
  if (/(?:比較軸|評価軸|criterion|criteria|dimension)/iu.test(value)) out.push('COMPARISON_CRITERION');
  if (/(?:候補|案A|案B|option\s+[A-Z0-9]|candidate)/iu.test(value)) out.push('COMPARISON_CANDIDATE');
  if (/(?:期限|締切|納期|までに|deadline|due\s+date|\bby\s+\d|\bby\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))/iu.test(value)) out.push('DEADLINE');
  if (/(?:依存|前提として|depends?\s+on)/iu.test(value)) out.push('DEPENDENCY');
  if (/(?:その後|次に|最後に|\bafter\b|\bbefore\b|\bthen\b|\bfinally\b)/iu.test(value)) out.push('SEQUENCE');
  if (/(?:管轄|jurisdiction|法域|地域|\bscope\b|範囲)/iu.test(value)) out.push('SCOPE');
  if (/(?:stakeholder|利害関係者|利用者|顧客|患者|住民|従業員)/iu.test(value)) out.push('STAKEHOLDER');
  if (/\d+(?:\.\d+)?\s*(?:%|％|件|人|回|日|時間|分|秒|円|万円|台|個|社|本|枚|ms|s\b)/iu.test(value)) out.push('QUANTITATIVE_VALUE');
  if (/(?:危険|リスク|\brisk\b|\bharm\b|failure\s+mode|故障)/iu.test(value)) out.push('RISK_SIGNAL');
  if (/(?:未確認|未確定|未成立|未完了|未終了|未解決|不明|まだ[^。！？!?]{0,80}(?:終わっていない|完了していない|済んでいない|終了していない|解決していない|確定していない|確認できていない)|\bunknown\b|\bunresolved\b|not\s+yet|\bpending\b|(?:has|have)\s+not\s+been\s+(?:finished|completed|resolved|confirmed|verified)|(?:is|are)\s+not\s+(?:finished|complete|completed|resolved|confirmed|verified))/iu.test(value)) out.push('UNRESOLVED');
  if (/(?:上記|前述|それ|これ|同じ|\bprevious\b|\babove\b|\bthat\b|\bthose\b)/iu.test(value)) out.push('REFERENCE');
  if (!out.includes('OBSERVATION') && /(?:である|です|だった|\bwas\b|\bis\b|\bare\b)/iu.test(value) && !isRequestText(value)) out.push('CLAIM');
  return [...new Set(out)];
}

function coalesceDependentRequestAtoms(requests, source) {
  const sorted = [...requests].sort((a, b) => a.source_span.start - b.source_span.start || a.source_span.end - b.source_span.end);
  const out = [];
  for (const atom of sorted) {
    const previous = out[out.length - 1];
    const value = normalized(atom.text);
    const directlyContinuesPrevious = previous
      && atom.source_span.start === previous.source_span.end
      && /^の/u.test(value);
    if (!directlyContinuesPrevious) {
      out.push(atom);
      continue;
    }
    const start = previous.source_span.start;
    const end = atom.source_span.end;
    const text = source.slice(start, end);
    out[out.length - 1] = {
      ...previous,
      operation: atom.operation || previous.operation,
      source_span: { start, end },
      text,
      normalized_text: normalized(text),
      merged_source_atom_ids: [...new Set([...(previous.merged_source_atom_ids || [previous.id]), atom.id])]
    };
  }
  return out;
}

function hasIndependentMaterialSubject(text) {
  const value = normalized(text);
  if (/\b(?:for|in|about|regarding)\s+(?!the\s+(?:decision|answer|output|material|evidence|case)\b)[a-z0-9][^,.;!?]{2,}/iu.test(value)) return true;
  if (/(?:について|に関する|における)[^。！？!?]{0,40}(?:リスク|危険|比較軸|評価軸|根拠)/u.test(value)) return true;
  if (/[^。！？!?]{2,40}の(?:リスク|危険|比較軸|評価軸|根拠)/u.test(value)) return true;
  return false;
}

function isMaterialShapingDirective(text) {
  const value = normalized(text);
  if (!value) return false;
  if (!(MATERIAL_SHAPING_JA.test(value) || MATERIAL_SHAPING_EN.test(value))) return false;
  return !hasIndependentMaterialSubject(value);
}

function partitionMaterialShapingRequests(requests) {
  const sorted = [...requests].sort((a, b) => a.source_span.start - b.source_span.start || a.source_span.end - b.source_span.end);
  const actual = [];
  const material = [];
  for (const atom of sorted) {
    const owner = actual[actual.length - 1] || null;
    if (owner && isMaterialShapingDirective(atom.text)) {
      material.push({
        ...atom,
        type: 'MATERIAL_REQUIREMENT',
        material_requirement_owner_atom_id: owner.id
      });
      continue;
    }
    actual.push(atom);
  }
  return { actual, material };
}

function buildSemanticAtoms(sourceGraph) {
  const source = sourceGraph?.source || '';
  const candidateNodes = (sourceGraph?.nodes || []).filter((node) => ['clause', 'sentence', 'heading', 'list_item'].includes(node.kind));
  const atoms = [];
  const seen = new Set();
  let order = 0;

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
        const contained = atoms.filter((atom) => atom.type === 'REQUEST'
          && atom.source_span.start >= node.source_span.start
          && atom.source_span.end <= node.source_span.end);
        if (contained.length === 1 && node.kind === 'sentence') {
          const existing = contained[0];
          existing.operation = operationFor(node.text);
          existing.source_node_id = node.id;
          existing.source_span = { ...node.source_span };
          existing.text = source.slice(node.source_span.start, node.source_span.end);
          existing.normalized_text = node.normalized_text;
          continue;
        }
        if (contained.length) continue;
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

  const coalesced = coalesceDependentRequestAtoms(
    atoms.filter((atom) => atom.type === 'REQUEST'),
    source
  );
  const { actual: requests, material } = partitionMaterialShapingRequests(coalesced);
  const materialOwnerByAtomId = new Map();
  for (const item of material) {
    for (const atomId of item.merged_source_atom_ids || [item.id]) {
      materialOwnerByAtomId.set(atomId, item.material_requirement_owner_atom_id);
    }
  }
  const semanticAtoms = atoms.map((atom) => {
    const ownerAtomId = atom.type === 'REQUEST' ? materialOwnerByAtomId.get(atom.id) : null;
    return ownerAtomId
      ? { ...atom, type: 'MATERIAL_REQUIREMENT', operation: null, material_requirement_owner_atom_id: ownerAtomId }
      : atom;
  });
  return {
    schema: 'astera.semantic-atom-graph.v1',
    language: sourceGraph.language,
    atoms: semanticAtoms,
    request_atoms: requests.map((atom, index) => ({ ...atom, request_id: `R${String(index + 1).padStart(2, '0')}` })),
    counts: semanticAtoms.reduce((acc, atom) => { acc[atom.type] = (acc[atom.type] || 0) + 1; return acc; }, {})
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
  isMaterialShapingDirective,
  operationFor
};