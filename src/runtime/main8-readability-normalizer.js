'use strict';

function clean(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function deadlinePhrase(value) {
  const text = clean(value);
  const patterns = [
    /((?:今週|来週|再来週)(?:の)?(?:月|火|水|木|金|土|日)曜(?:日)?まで)/u,
    /((?:今日|明日|明後日|今週|来週|再来週|今月|来月)まで)/u,
    /((?:\d{4}年)?\d{1,2}月\d{1,2}日まで)/u,
    /(\d{4}-\d{2}-\d{2}まで)/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[1];
  }
  return text;
}

function prohibitionScore(value) {
  const text = clean(value);
  let score = 0;
  if (/しないで|しないこと|してはいけない|禁止/u.test(text)) score += 4;
  if (/[。.!！]$/u.test(text)) score += 1;
  if (/はを/u.test(text)) score -= 4;
  if (text.length >= 8 && text.length <= 100) score += 1;
  return score;
}

function normalizePremiseSection(block) {
  const lines = String(block || '').split('\n');
  const prohibitionIndexes = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*-\s*禁止条件\s*:/u.test(lines[index])) prohibitionIndexes.push(index);
    if (/^\s*-\s*期限\s*:/u.test(lines[index])) {
      const [prefix, ...rest] = lines[index].split(':');
      const normalized = deadlinePhrase(rest.join(':'));
      if (normalized) lines[index] = `${prefix}: ${normalized}`;
    }
  }
  if (prohibitionIndexes.length > 1) {
    const candidates = prohibitionIndexes.map((index) => ({
      index,
      line: lines[index],
      value: clean(lines[index].replace(/^\s*-\s*禁止条件\s*:\s*/u, '')),
    }));
    candidates.sort((a, b) => prohibitionScore(b.value) - prohibitionScore(a.value) || b.value.length - a.value.length || a.index - b.index);
    const chosen = candidates[0];
    const keepIndex = Math.min(...prohibitionIndexes);
    lines[keepIndex] = `  - 禁止条件: ${chosen.value.replace(/はを禁止する/u, 'を禁止する')}`;
    return lines.filter((_, index) => index === keepIndex || !prohibitionIndexes.includes(index)).join('\n');
  }
  return lines.join('\n');
}

function looksLikeRequestInstruction(value) {
  const text = clean(value).replace(/^[\-・]\s*/u, '');
  return /(?:してください|して下さい|してほしい|してくれ|お願いします|教えてください|整理して|比較して|確認して|検証して|調査して)[。.!！]?$/u.test(text);
}

function requestTarget(value) {
  const text = clean(value).replace(/^[\-・]\s*/u, '').replace(/[。.!！]+$/u, '');
  const evidenceRequest = /^(.+?)を[、,]?(?:公式根拠|根拠)[^。]{0,120}?(?:確認|検証|調査)[^。]{0,120}?(?:判断材料として)?整理(?:してください|して下さい|して|してくれ)?$/u.exec(text);
  if (evidenceRequest?.[1]) return clean(evidenceRequest[1]);
  const materialRequest = /^(.+?)を(?:判断材料として)?整理(?:してください|して下さい|して|してくれ)?$/u.exec(text);
  if (materialRequest?.[1]) return clean(materialRequest[1]);
  return text;
}

function normalizeFactsSection(block) {
  const lines = String(block || '').split('\n');
  const filtered = [];
  let removedRequest = false;
  for (const line of lines) {
    const content = line.replace(/^\s*-\s*/u, '');
    if (/^\s{2,}-\s+/u.test(line) && looksLikeRequestInstruction(content)) {
      removedRequest = true;
      continue;
    }
    if (removedRequest && /^\s*-\s*区別\s*:/u.test(line) && /上記/u.test(line)) continue;
    filtered.push(line);
  }
  const hasConcreteBullet = filtered.some((line) => /^\s{2,}-\s+\S/u.test(line));
  const headerIndex = filtered.findIndex((line) => /^\s*-\s*入力で与えられた具体材料\s*:/u.test(line));
  if (removedRequest && headerIndex >= 0 && !hasConcreteBullet) {
    filtered.splice(headerIndex, 1, '- 利用者の依頼文そのものは事実として数えない。現時点で、外部確認済みの具体事実はまだ成立していない。');
  }
  return filtered.join('\n');
}

function normalizeVerificationTarget(block) {
  const lines = String(block || '').split('\n');
  return lines.map((line) => {
    const match = /^(\s*-\s*(?:確認対象|根拠状態を判定する対象になっている入力材料|根拠確認の対象)\s*:\s*)(.+)$/u.exec(line);
    if (!match || !looksLikeRequestInstruction(match[2])) return line;
    return `${match[1]}${requestTarget(match[2])}`;
  }).map((line, index, all) => {
    if (!/^\s{2,}-\s+/u.test(line) || !looksLikeRequestInstruction(line.replace(/^\s{2,}-\s*/u, ''))) return line;
    const previous = all[index - 1] || '';
    if (!/根拠状態を判定する対象になっている入力材料/u.test(previous)) return line;
    return `  - ${requestTarget(line.replace(/^\s{2,}-\s*/u, ''))}`;
  }).join('\n');
}

function quantityByCandidate(fullText) {
  const map = new Map();
  for (const match of String(fullText || '').matchAll(/([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,16}案)\s*=\s*([0-9０-９]+(?:[.．][0-9０-９]+)?\s*(?:件|人|回|日|時間|分|秒|円|万円|台|個|社|本|枚|%|％))/gu)) {
    if (!map.has(match[1])) map.set(match[1], match[2]);
  }
  return map;
}

function normalizeCandidateMaterial(block, quantities) {
  if (!quantities.size) return block;
  return String(block || '').split('\n').map((line) => {
    for (const [candidate, quantity] of quantities.entries()) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const patterns = [
        new RegExp(`^(\\s*-\\s*${escaped}\\s+について現在ある材料\\s*:\\s*).+$`, 'u'),
        new RegExp(`^(\\s{2,}-\\s*${escaped}\\s*:\\s*).+$`, 'u'),
      ];
      for (const pattern of patterns) {
        const match = pattern.exec(line);
        if (match) return `${match[1]}${candidate}について入力で確認できる数量は${quantity}。他の観点は別材料で確認する。`;
      }
    }
    return line;
  }).join('\n');
}

function normalizeUnifiedMain8Text(value) {
  const text = String(value || '');
  const blocks = text.split('\n---\n');
  if (blocks.length !== 8) return text;
  const quantities = quantityByCandidate(text);
  blocks[1] = normalizePremiseSection(blocks[1]);
  blocks[2] = normalizeFactsSection(blocks[2]);
  blocks[4] = normalizeCandidateMaterial(normalizeVerificationTarget(blocks[4]), quantities);
  blocks[5] = normalizeCandidateMaterial(blocks[5], quantities);
  blocks[6] = normalizeVerificationTarget(blocks[6]);
  return blocks.join('\n---\n');
}

function normalizeUnifiedMain8Material(material = {}) {
  const normalized = normalizeUnifiedMain8Text(material.text);
  return { ...material, text: normalized };
}

module.exports = {
  normalizeUnifiedMain8Text,
  normalizeUnifiedMain8Material,
  deadlinePhrase,
  looksLikeRequestInstruction,
  requestTarget
};