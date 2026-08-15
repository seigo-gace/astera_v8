'use strict';

const ACTIONS = Object.freeze([
  { id: 'improve', re: /改善|改良|修正|直(?:す|せ|し)|最適化|強化|精度.{0,8}(?:上げ|向上)|improv|optimi[sz]e|fix|refactor/i },
  { id: 'compare', re: /比較|比べ|選択肢|compare|versus|\bvs\b/i },
  { id: 'decide', re: /判断|選定|選ぶ|決め|採用|decid|select|choose|recommend/i },
  { id: 'implement', re: /実装|作成|構築|開発|組み立て|implement|build|create|develop/i },
  { id: 'verify', re: /検証|確認|監査|調査|分析|解析|評価|verify|validate|audit|investigat|analy[sz]|evaluate/i },
  { id: 'integrate', re: /統合|接続|連携|組み込|当てはめ|integrat|connect|link|incorporat/i },
  { id: 'migrate', re: /移行|置換|切替|入れ替|migrat|replace|switch/i },
  { id: 'remove', re: /削除|除去|外す|remove|delete|eliminate/i },
  { id: 'explain', re: /説明|教え|解説|explain|describe|tell me/i }
]);

const STOP_TERMS = new Set([
  'これ', 'それ', 'あれ', 'ここ', 'そこ', 'もの', 'こと', 'ため', 'よう', 'について', 'として',
  'する', 'した', 'して', 'いる', 'ある', 'ない', 'です', 'ます', 'the', 'and', 'for', 'with', 'from',
  'this', 'that', 'what', 'how', 'please', 'into', 'using', 'use'
]);

function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function splitSentences(value) {
  return normalizeText(value)
    .split(/(?<=[。！？!?])|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function detectLanguage(text) {
  return /[ぁ-んァ-ヶ一-龠々]/.test(String(text || '')) ? 'ja' : 'en';
}

function cleanClause(value) {
  return normalizeText(value)
    .replace(/^[「『\s]+|[」』\s]+$/g, '')
    .replace(/^(?:まず|次に|さらに|あと|そして|また|please|could you|can you)\s*/i, '')
    .replace(/[。！？!?]+$/g, '')
    .trim();
}

function extractAction(text) {
  for (const action of ACTIONS) {
    const match = action.re.exec(text);
    if (match) return { id: action.id, match: match[0], index: match.index };
  }
  return { id: 'analyze', match: '', index: -1 };
}

function extractTerms(text) {
  const normalized = normalizeText(text);
  const latin = normalized.match(/[A-Za-z][A-Za-z0-9_.:/-]{1,}|\d+(?:\.\d+){0,3}/g) || [];
  const japanese = normalized.match(/[一-龠々ァ-ヶぁ-ん]{2,18}/g) || [];
  return unique([...latin, ...japanese])
    .map((term) => term.toLowerCase())
    .filter((term) => !STOP_TERMS.has(term) && term.length >= 2)
    .slice(0, 48);
}

function explicitTarget(text) {
  const patterns = [
    /(?:対象|target)(?:は|:|=)\s*([^。！？!?\n]{1,100})/i,
    /([^。！？!?\n]{2,100}?)(?:を|について|に対して)(?:徹底的に|詳しく|詳細に)?\s*(?:改善|改良|修正|分析|解析|比較|検証|確認|実装|統合|接続|移行|判断)/i
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const target = cleanClause(match[1])
      .replace(/^(?:これ|それ|あれ)$/u, '')
      .replace(/(?:全体)?(?:から|で)$/u, '')
      .trim();
    if (target.length >= 2) return target.slice(0, 120);
  }
  return '';
}

function fallbackTarget(text, action, domain) {
  const first = splitSentences(text)[0] || text;
  if (action.index > 0) {
    const prefix = cleanClause(first.slice(0, action.index))
      .replace(/(?:を|について|に対して|から|で|の)$/u, '')
      .replace(/^(?:これ|それ|あれ)(?:を|について)?$/u, '')
      .trim();
    if (prefix.length >= 2 && prefix.length <= 100) return prefix;
  }
  const terms = extractTerms(text).filter((term) => !ACTIONS.some((item) => item.re.test(term)));
  if (terms.length) return terms.slice(0, 3).join('・');
  return String(domain?.primary?.name || '入力対象').trim();
}

function extractClauses(text, patterns) {
  const values = [];
  for (const sentence of splitSentences(text)) {
    if (patterns.some((pattern) => pattern.test(sentence))) values.push(cleanClause(sentence));
  }
  return unique(values);
}

function explicitSuccessCriteria(text) {
  const values = [];
  const patterns = [
    /(?:成功条件|完了条件|合格条件|acceptance(?: criteria)?|success(?: criteria)?)(?:は|:|=)\s*([^。！？!?\n]+)/ig,
    /(?:必ず|must|without|〜ずに|せずに)[^。！？!?\n]*/ig
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) values.push(cleanClause(match[1] || match[0]));
  }
  return unique(values);
}

function extractConstraints(text) {
  return extractClauses(text, [
    /禁止|しない|するな|使わない|残す|守る|維持|必ず|のみ|限定|別Module|分離|変更せず|非AI|without|must|must not|do not|keep|preserve|separate/i
  ]).slice(0, 12);
}

function buildObjective({ target, action, language }) {
  const t = target || (language === 'ja' ? '対象' : 'the target');
  if (language === 'en') {
    const templates = {
      improve: `Identify the current defects in ${t}, define the improved state, and make the change conditions explicit.`,
      compare: `Compare the viable options for ${t} under the same criteria and make the adoption conditions explicit.`,
      decide: `Clarify the decision criteria, uncertainty, and selection rationale for ${t}.`,
      implement: `Turn ${t} into an implementable plan that satisfies the stated requirements and acceptance conditions.`,
      verify: `Verify the facts, uncertainty, and risks around ${t} until a defensible decision can be made.`,
      integrate: `Integrate ${t} while preserving responsibility boundaries, constraints, and failure handling.`,
      migrate: `Move ${t} to the intended state without losing required behavior or rollback ability.`,
      remove: `Remove the identified part of ${t} without breaking required behavior or dependencies.`,
      explain: `Explain ${t} in a way that exposes the actual mechanism, constraints, and decision implications.`,
      analyze: `Turn ${t} into decision-ready material by separating facts, uncertainty, risks, and alternatives.`
    };
    return templates[action.id] || templates.analyze;
  }
  const templates = {
    improve: `${t}の現状問題を特定し、改善後の状態・変更条件・検証条件を明確にする。`,
    compare: `${t}の選択肢を同一基準で比較し、採用条件と不採用理由を明確にする。`,
    decide: `${t}について判断基準・不確実性・選択根拠を整理し、判断可能な状態にする。`,
    implement: `${t}を要求条件と合格条件を満たす実装可能な状態へ落とし込む。`,
    verify: `${t}の事実・未確認・Riskを検証し、根拠付きで判断できる状態にする。`,
    integrate: `${t}の責務境界・制約・失敗時処理を保ったまま統合可能な状態にする。`,
    migrate: `${t}の必要機能とRollback可能性を維持しながら目的状態へ移行する。`,
    remove: `${t}の必要動作と依存を壊さず、対象要素を除去できる状態にする。`,
    explain: `${t}の実際の仕組み・制約・判断への影響が分かる形で説明する。`,
    analyze: `${t}について事実・未確認・Risk・代替案を分離し、判断材料として成立させる。`
  };
  return templates[action.id] || templates.analyze;
}

function analyzeRequest({ question = '', context = '', domain = {} } = {}) {
  const normalizedQuestion = normalizeText(question);
  const normalizedContext = normalizeText(context);
  const language = detectLanguage(normalizedQuestion);
  const action = extractAction(normalizedQuestion);
  const target = explicitTarget(normalizedQuestion) || fallbackTarget(normalizedQuestion, action, domain);
  const successCriteria = explicitSuccessCriteria(normalizedQuestion);
  const constraints = extractConstraints(normalizedQuestion);
  const terms = extractTerms(`${normalizedQuestion}\n${normalizedContext}`).slice(0, 48);
  return Object.freeze({
    schema_version: 'astera.request-model.v1',
    language,
    normalized_question: normalizedQuestion,
    target,
    target_confidence: explicitTarget(normalizedQuestion) ? 'high' : (target && target !== domain?.primary?.name ? 'medium' : 'low'),
    action: action.id,
    objective: buildObjective({ target, action, language }),
    success_criteria: Object.freeze(successCriteria),
    constraints: Object.freeze(constraints),
    query_terms: Object.freeze(terms),
    context_present: Boolean(normalizedContext),
    context_length: normalizedContext.length
  });
}

function evidenceClaim(item) {
  return cleanClause(item?.fields?.claim || item?.excerpt || item?.title || item?.canonical_record_id || '');
}

function normalizeEvidencePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    return Object.freeze({
      schema_version: 'astera.evidence-packet.compact.v1',
      state: 'NOT_PROVIDED',
      source_status: null,
      quality_score_bp: null,
      coverage_state: 'UNKNOWN',
      conflict_detected: false,
      evidence: Object.freeze([]),
      provider_failures: Object.freeze([])
    });
  }
  const source = packet.result && packet.schema_version === 'astera.evidence-search.module-response.v1'
    ? packet.result
    : packet;
  const sourceStatus = String(source.status || 'UNKNOWN');
  const qualityFinal = source.quality?.final || {};
  const qualityText = JSON.stringify(qualityFinal).toUpperCase();
  const evidence = (Array.isArray(source.evidence) ? source.evidence : []).map((item) => Object.freeze({
    id: String(item.candidate_id || item.canonical_record_id || ''),
    claim: evidenceClaim(item),
    source_role: String(item.source_role || '').toUpperCase(),
    authority_id: String(item.authority_id || item.publisher?.id || ''),
    source_id: String(item.source_id || item.provider_id || ''),
    url: item.canonical_locator?.url || null,
    replayable: item.canonical_locator?.replayable === true,
    updated_at: item.updated_at || item.published_at || null,
    version: item.version || null,
    fields: Object.freeze({ ...(item.fields || {}) })
  })).filter((item) => item.claim || item.id);
  const initialExec = source.provider_execution?.initial || [];
  const reinforcementExec = source.provider_execution?.reinforcement || [];
  const failures = [...initialExec, ...reinforcementExec]
    .filter((entry) => entry.status && entry.status !== 'FULFILLED')
    .map((entry) => ({ provider_id: entry.provider_id || '', error_code: entry.error_code || 'PROVIDER_FAILED' }));
  return Object.freeze({
    schema_version: 'astera.evidence-packet.compact.v1',
    state: sourceStatus === 'FINAL_VALID' ? 'VALID' : sourceStatus.startsWith('REJECTED') ? 'REJECTED' : 'PARTIAL',
    source_status: sourceStatus,
    quality_score_bp: Number.isInteger(qualityFinal.score_bp) ? qualityFinal.score_bp : null,
    coverage_state: String(source.coverage?.discovery_scope_state || source.coverage?.registry_coverage_state || 'UNKNOWN'),
    conflict_detected: /CONFLICT/.test(qualityText),
    effective_as_of: source.effective_as_of || null,
    evidence: Object.freeze(evidence),
    provider_failures: Object.freeze(failures)
  });
}

function tokenOverlap(left, right) {
  const a = new Set(extractTerms(left));
  const b = new Set(extractTerms(right));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const token of a) if (b.has(token)) hit += 1;
  return hit / Math.max(1, Math.min(a.size, b.size));
}

function matchingEvidence(text, packet, threshold = 0.25) {
  const items = packet?.evidence || [];
  return items
    .map((item) => ({ item, overlap: tokenOverlap(text, item.claim) }))
    .filter((entry) => entry.overlap >= threshold)
    .sort((a, b) => b.overlap - a.overlap);
}

module.exports = {
  analyzeRequest,
  normalizeEvidencePacket,
  normalizeText,
  splitSentences,
  extractTerms,
  matchingEvidence,
  tokenOverlap,
  unique
};
