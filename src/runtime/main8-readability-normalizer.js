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

function isEnglishMain8(text) {
  return /(?:^|\n)01 True Objective(?:\n|$)/u.test(String(text || ''));
}

function normalizeOppositionPublic(block, lang) {
  const lines = String(block || '').split('\n');
  const kept = [];
  let removedInternal = false;
  for (const line of lines) {
    if (/^\s*-\s*(?:id|focus|conditions|failure_conditions|status|dimensions|confirmed_claim_ids|undetermined_claim_ids|support_evidence_refs|counter_evidence_refs|missing_evidence_refs|policy_notes)\s*:/iu.test(line)) {
      removedInternal = true;
      continue;
    }
    if (/^\s*$/u.test(line)) continue;
    kept.push(line);
  }
  if (removedInternal && kept.length) {
    kept.splice(1, 0, lang === 'ja'
      ? '- 支持根拠だけでなく、反証・例外・失敗条件、対象バージョンや時点の不一致も確認する。'
      : '- Check counter-evidence, exceptions, failure conditions, mismatched version, and time scope before treating the claim as established.');
  }
  return kept.join('\n');
}

function normalizeEvidencePublic(block, lang) {
  const lines = String(block || '').split('\n');
  const out = [];
  let emittedState = false;
  for (const line of lines) {
    if (/SearchExecution=|EvidenceQuality=|ClaimConfirmation=/iu.test(line)) {
      if (!emittedState) {
        const notExecuted = /NOT_EXECUTED/iu.test(line);
        out.push(notExecuted
          ? (lang === 'ja'
            ? '- 外部検索は実行されておらず、外部事実としては未確認のまま。'
            : '- External search was not executed, so external factual status remains unresolved.')
          : (lang === 'ja'
            ? '- 外部根拠の成立状態は内部状態名ではなく、成立・未成立の区別として扱う。'
            : '- External evidence status is presented as established or unresolved rather than as an internal runtime state.'));
        emittedState = true;
      }
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

function normalizeReinstructionPublic(block, lang) {
  const lines = String(block || '').split('\n');
  const out = [];
  let emittedUnresolved = false;
  for (const line of lines) {
    if (/Task Wave|Lens=|SearchExecution=|EvidenceQuality=|MATERIAL_ONLY|INSUFFICIENT_/iu.test(line)) continue;
    const purpose = /^\s*-\s*T\d+\s*:\s*purpose=(.+)$/iu.exec(line);
    if (purpose) {
      out.push(`- ${lang === 'ja' ? '目的' : 'Purpose'}: ${clean(purpose[1])}`);
      continue;
    }
    if (/UNDETERMINED\s+Claim.*CONFIRMED|未確定.*確定/u.test(line)) {
      if (!emittedUnresolved) {
        out.push(lang === 'ja'
          ? '- 未確定の主張は、根拠が成立するまで未確定のまま保持し、確認済みへ推測昇格しない。'
          : '- Unresolved claims must remain unresolved rather than being promoted to confirmed without accepted evidence.');
        emittedUnresolved = true;
      }
      continue;
    }
    if (/^\s*-\s*Blocking条件/u.test(line) && /RETRIEVAL_FAILED|T\d+:/iu.test(line)) continue;
    out.push(line);
  }
  return out.join('\n');
}

function stripPublicInternalLines(block) {
  return String(block || '').split('\n').filter((line) => {
    if (/:lens-risk-\d+\[/iu.test(line)) return false;
    if (/candidate_id|material_state|comparison_state|confirmed_claim_ids|undetermined_claim_ids|support_evidence_refs|counter_evidence_refs|missing_evidence_refs/iu.test(line)) return false;
    if (/\bMATERIAL_ONLY\b|\bINSUFFICIENT_[A-Z0-9_]+\b/iu.test(line)) return false;
    if (/\bparser_overall_status\s*:/iu.test(line)) return false;
    if (/\btimeout:\d+:\s*\{[^}]*"(?:phase|status|elapsed_ms|hard_deadline_ms)"\s*:/iu.test(line)) return false;
    if (/\bunsupported:\d+:\s*\{[^}]*"(?:text|status)"\s*:/iu.test(line)) return false;
    return true;
  }).join('\n');
}

function normalizeUnifiedMain8Text(value) {
  const text = String(value || '');
  const blocks = text.split('\n---\n');
  if (blocks.length !== 8) return text;
  const quantities = quantityByCandidate(text);
  const lang = isEnglishMain8(text) ? 'en' : 'ja';
  blocks[1] = normalizePremiseSection(blocks[1]);
  blocks[2] = normalizeFactsSection(blocks[2]);
  blocks[4] = normalizeOppositionPublic(normalizeCandidateMaterial(normalizeVerificationTarget(blocks[4]), quantities), lang);
  blocks[5] = normalizeCandidateMaterial(blocks[5], quantities);
  blocks[6] = normalizeEvidencePublic(normalizeVerificationTarget(blocks[6]), lang);
  blocks[7] = normalizeReinstructionPublic(blocks[7], lang);
  for (let index = 0; index < blocks.length; index += 1) blocks[index] = stripPublicInternalLines(blocks[index]);
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