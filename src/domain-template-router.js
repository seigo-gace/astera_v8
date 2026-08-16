'use strict';

const { TAXONOMY_VERSION, GENRE_LENSES } = require('./all-domain-lens-catalog');

function rx(pattern) {
  return new RegExp(pattern, 'i');
}

const OVERLAYS = Object.freeze([
  {
    id: 'high_stakes_legal',
    name: 'High-Stakes Legal Overlay',
    signals: [rx('訴訟|解雇|逮捕|違法|損害賠償|契約解除|harassment|termination|lawsuit|criminal|liability')],
    risk_lens: ['権利・責任Risk', '法域固有結論の誤り', '期限・手続Risk'],
    evidence_to_collect: ['法域', '当事者', 'Timeline', '文書', '期限'],
    safety_gate: ['断定的な法的結論を避ける', '重大判断は有資格専門家確認を要求する']
  },
  {
    id: 'medical_safety',
    name: 'Medical Safety Overlay',
    signals: [rx('救急|自殺|自傷|胸痛|呼吸|意識|大量出血|心筋梗塞|emergency|suicide|self.?harm|chest pain')],
    risk_lens: ['Emergency Harm', '受診遅延', '危険な自己治療'],
    evidence_to_collect: ['Red Flag', '緊急性', '医療者関与', '現在の治療・薬'],
    safety_gate: ['Red Flagがある場合は緊急対応を優先する', '診断を断定しない']
  },
  {
    id: 'current_information',
    name: 'Current-Information Overlay',
    signals: [rx('最新|現在|今日|昨日|今年|料金|価格|法改正|現行|current|latest|today|price|pricing|law change')],
    risk_lens: ['古い情報', '変更済みのRule・価格・状態', '未検証の現在事実'],
    evidence_to_collect: ['日付', 'Source', '法域・市場', '最終確認日時'],
    safety_gate: ['現在情報を確認してから断定する']
  },
  {
    id: 'evidence_strict',
    name: 'Evidence-Strict Overlay',
    signals: [rx('根拠|エビデンス|証拠|正確|検証|調査|引用|fact.?check|evidence|source|verify|accurate')],
    risk_lens: ['根拠なしの主張', '弱いSource', '矛盾', 'Source Laundering'],
    evidence_to_collect: ['一次Source', 'Source品質', 'Confidence', '矛盾'],
    safety_gate: ['根拠と不足を分離して出力する']
  },
  {
    id: 'safety_abuse',
    name: 'Safety / Abuse Overlay',
    signals: [rx('ハッキング|侵入|詐欺|偽造|回避|マルウェア|攻撃|hack|malware|phishing|exploit|bypass|fraud')],
    risk_lens: ['Harm Enablement', 'Evasion', 'Exploitation', 'Fraud'],
    evidence_to_collect: ['正当なContext', '想定される害', '防御目的'],
    safety_gate: ['有害な手順を避け、防御目的へ限定する']
  }
]);

const DOMAIN_SAFETY_GATES = Object.freeze({
  G08: ['法域と文書を確認せず断定的な法的結論を出さない'],
  G11: ['個別の会計・税務・金融判断は適用基準と専門家確認を分離する'],
  G23: ['診断を断定しない', 'Emergency Red Flagでは緊急対応を優先する'],
  G31: ['攻撃実行手順を生成せず防御・復旧へ限定する', '検証前に安全と断定しない'],
  G34: ['生命・現場安全とEvidence保全を優先する'],
  G35: ['法・民間保護・Escalation Riskを必ず確認する']
});

const OVERLAY_PRIMARY_FALLBACKS = Object.freeze({
  medical_safety: 'G23'
});

const MIN_CONTROLLED_PRIMARY_SCORE = 6;
const MIN_TEXT_PRIMARY_SCORE = 8;
const MIN_SECONDARY_SCORE = 6;

function cleanLine(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[・/（）()—―,:;|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ngrams(value, n = 3) {
  const text = normalize(value).replace(/\s+/g, '');
  if (!text) return new Set();
  if (text.length < n) return new Set([text]);
  const out = new Set();
  for (let i = 0; i <= text.length - n; i += 1) out.add(text.slice(i, i + n));
  return out;
}

function removeAsteraTemplateBlock(text) {
  const source = String(text || '');
  const markerMatch = /01\s+(本当の目的|True Objective)\s*(?:\n|$|[:：])/i.exec(source);
  if (!markerMatch) return { text: source.trim(), removed: 0 };
  const marker = markerMatch.index;
  const after = source.slice(marker);
  const looksLikeAsteraTemplate = /08\s+(主役AIへの再指示|Re-instruction to Main AI)/i.test(after)
    && /(回答がどう強くなるか|How This Improves the Answer)/i.test(after);
  if (!looksLikeAsteraTemplate) return { text: source.trim(), removed: 0 };
  return { text: source.slice(0, marker).trim(), removed: 1 };
}

function normalizeInput({ question = '', context = '' } = {}) {
  const q = removeAsteraTemplateBlock(question);
  const c = removeAsteraTemplateBlock(context);
  const originalQuestion = String(question || '').trim();
  const cleanQuestion = q.removed ? q.text : (q.text || originalQuestion);
  const cleanContext = c.text;
  const core = cleanQuestion || cleanContext || (q.removed || c.removed ? '' : String(question || context || '').trim());
  const analysisText = [core, cleanContext && cleanContext !== core ? `[context]\n${cleanContext}` : '']
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return {
    core_request: core,
    analysis_text: analysisText,
    context_length: String(context || '').length,
    normalized_context_length: cleanContext.length,
    removed_meta_blocks: q.removed + c.removed,
    removed_meta: Boolean(q.removed + c.removed)
  };
}

function scoreGenre(genre, text) {
  const normalizedText = normalize(text);
  const queryTokens = new Set(normalizedText.split(' ').filter(Boolean));
  const queryNgrams = ngrams(normalizedText);
  const anchor = normalize(genre.anchor_title);
  let score = normalizedText.includes(anchor) ? 1000 : 0;
  let exactHits = normalizedText.includes(anchor) ? 1 : 0;
  const matched = [];

  for (const rawTerm of genre.terms || []) {
    const term = normalize(rawTerm);
    if (!term) continue;
    const shortAsciiToken = /^[a-z0-9.+#-]{1,3}$/.test(term);
    const exactMatch = shortAsciiToken ? queryTokens.has(term) : normalizedText.includes(term);
    if (exactMatch) {
      const compactLength = term.replace(/\s/g, '').length;
      score += compactLength >= 10 ? 16 : compactLength >= 6 ? 10 : compactLength >= 3 ? 6 : 2;
      exactHits += 1;
      matched.push(rawTerm);
      continue;
    }
    if (!term.includes(' ') && queryTokens.has(term)) {
      score += 3;
      matched.push(rawTerm);
    }
  }

  const termNgrams = ngrams([genre.name, genre.anchor_title, ...(genre.terms || [])].join(' '));
  const overlap = [...queryNgrams].filter((item) => termNgrams.has(item)).length;
  const denominator = Math.max(1, new Set([...queryNgrams, ...termNgrams]).size);
  const similarity = overlap / denominator;
  score += similarity * 8;

  return {
    genre,
    score,
    exact_hits: exactHits,
    similarity,
    matched_signals: [...new Set(matched.map(cleanLine))]
  };
}

function publicGenre(item) {
  const genre = item.genre;
  const gate = DOMAIN_SAFETY_GATES[genre.id] || [];
  return {
    id: genre.id,
    name: genre.name,
    taxonomy_version: TAXONOMY_VERSION,
    classification: {
      specialized_genre: { id: genre.id, name: genre.name },
      lens_anchor_path: genre.anchor_path,
      path_resolution: 'GENRE_LENS_ANCHOR'
    },
    classification_basis: item.classification_basis,
    confidence: item.confidence,
    taxonomy_review_required: item.taxonomy_review_required,
    score: Number(item.score.toFixed(6)),
    matched_signals: item.matched_signals,
    fact_lens: genre.fact_lens,
    risk_lens: genre.risk_lens,
    multi_lens: genre.multi_lens,
    inquiry_lens: genre.inquiry_lens,
    compare_lens: genre.compare_lens,
    evidence_to_collect: genre.evidence_to_collect,
    safety_gate: [...new Set([...(genre.safety_gate || []), ...gate])]
  };
}

function classifyScores(scored) {
  const best = scored[0];
  const hasControlledTerm = best.exact_hits > 0;
  const strongScore = best.score >= MIN_TEXT_PRIMARY_SCORE;
  const basis = hasControlledTerm
    ? 'CONTROLLED_TERM_MATCH'
    : strongScore
      ? 'TEXT_SCORE_MATCH'
      : 'HYPOTHESIS_LAST_RESORT';
  const confidence = basis === 'HYPOTHESIS_LAST_RESORT'
    ? Math.max(0.2, Math.min(0.49, 0.2 + best.similarity * 0.5))
    : Math.min(0.99, 0.55 + Math.tanh(best.score / 20) * 0.44);
  return {
    classification_basis: basis,
    confidence: Number(confidence.toFixed(6)),
    taxonomy_review_required: basis === 'HYPOTHESIS_LAST_RESORT' || confidence < 0.72
  };
}

function qualifiedScore(item, secondary = false) {
  const minimum = secondary ? MIN_SECONDARY_SCORE : MIN_CONTROLLED_PRIMARY_SCORE;
  return (item.exact_hits > 0 && item.score >= minimum) || item.score >= MIN_TEXT_PRIMARY_SCORE;
}

function applyOverlayScores(text) {
  return OVERLAYS
    .map((overlay) => {
      const matched = [];
      for (const signal of overlay.signals || []) {
        const hit = String(text).match(signal);
        if (hit) matched.push(hit[0]);
      }
      return { overlay, score: matched.length, matched_signals: [...new Set(matched.map(cleanLine))] };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.overlay.id.localeCompare(b.overlay.id))
    .map((item) => ({
      id: item.overlay.id,
      name: item.overlay.name,
      score: item.score,
      matched_signals: item.matched_signals,
      risk_lens: item.overlay.risk_lens,
      evidence_to_collect: item.overlay.evidence_to_collect,
      safety_gate: item.overlay.safety_gate
    }));
}

function buildLensText(primary, overlays, classificationBasis = null, confidence = 0, taxonomyReviewRequired = true) {
  const lines = [
    '[all_domain_lens]',
    `taxonomy_version=${TAXONOMY_VERSION}`
  ];
  if (primary) {
    const anchor = primary.classification?.lens_anchor_path?.path_key || '-';
    lines.push(
      `primary=${primary.id} (${primary.name})`,
      `lens_anchor_path=${anchor}`,
      `classification_basis=${primary.classification_basis}`,
      `confidence=${primary.confidence}`,
      `taxonomy_review_required=${primary.taxonomy_review_required}`,
      `fact_lens=${primary.fact_lens.join(' / ')}`,
      `risk_lens=${primary.risk_lens.join(' / ')}`,
      `multi_lens=${primary.multi_lens.join(' / ')}`,
      `inquiry_lens=${primary.inquiry_lens.join(' / ')}`,
      `compare_lens=${primary.compare_lens.join(' / ')}`,
      `evidence_to_collect=${primary.evidence_to_collect.join(' / ')}`,
      `safety_gate=${primary.safety_gate.join(' / ')}`
    );
  } else {
    lines.push(
      'primary=ABSTAIN',
      'lens_anchor_path=-',
      `classification_basis=${classificationBasis || 'ABSTAIN_LOW_SIGNAL'}`,
      `confidence=${confidence}`,
      `taxonomy_review_required=${taxonomyReviewRequired}`
    );
  }
  if (overlays.length) {
    lines.push(`overlays=${overlays.map((overlay) => overlay.id).join(' / ')}`);
    for (const overlay of overlays) {
      lines.push(`overlay.${overlay.id}.risk_lens=${overlay.risk_lens.join(' / ')}`);
      lines.push(`overlay.${overlay.id}.evidence_to_collect=${overlay.evidence_to_collect.join(' / ')}`);
      lines.push(`overlay.${overlay.id}.safety_gate=${overlay.safety_gate.join(' / ')}`);
    }
  }
  return lines.join('\n');
}

function overlayPrimaryFallback(scored, overlays) {
  for (const overlay of overlays) {
    const genreId = OVERLAY_PRIMARY_FALLBACKS[overlay.id];
    if (!genreId) continue;
    const scoredGenre = scored.find((item) => item.genre.id === genreId);
    if (!scoredGenre) continue;
    return {
      ...scoredGenre,
      classification_basis: 'SAFETY_OVERLAY_FALLBACK',
      confidence: 0.9,
      taxonomy_review_required: false,
      matched_signals: [...new Set([...(scoredGenre.matched_signals || []), ...(overlay.matched_signals || [])])]
    };
  }
  return null;
}

function routeDomainTemplates({ question = '', context = '' } = {}) {
  const normalized = normalizeInput({ question, context });
  const routeText = normalized.core_request.trim();
  if (!normalize(routeText)) {
    return {
      router: 'all_domain_lens_router_v2',
      taxonomy_version: TAXONOMY_VERSION,
      user_selection_required: false,
      input_valid: false,
      input_error: 'ASTERA_LENS_INPUT_REQUIRED',
      classification_basis: null,
      confidence: 0,
      taxonomy_review_required: true,
      primary: null,
      secondary: [],
      overlays: [],
      normalized,
      lens_text: '',
      analysis_text: normalized.analysis_text
    };
  }

  const scored = GENRE_LENSES
    .map((genre) => scoreGenre(genre, routeText))
    .sort((a, b) => b.score - a.score || b.exact_hits - a.exact_hits || a.genre.id.localeCompare(b.genre.id));
  const overlays = applyOverlayScores(routeText).slice(0, 5);
  const best = scored[0];

  if (!qualifiedScore(best)) {
    const fallback = overlayPrimaryFallback(scored, overlays);
    if (fallback) {
      const primary = publicGenre(fallback);
      return {
        router: 'all_domain_lens_router_v2',
        taxonomy_version: TAXONOMY_VERSION,
        user_selection_required: false,
        input_valid: true,
        input_error: null,
        classification_basis: primary.classification_basis,
        confidence: primary.confidence,
        taxonomy_review_required: primary.taxonomy_review_required,
        primary,
        secondary: [],
        overlays,
        normalized,
        lens_text: buildLensText(primary, overlays),
        analysis_text: normalized.analysis_text
      };
    }
    const confidence = Math.max(0.1, Math.min(0.49, 0.15 + best.similarity * 0.5));
    return {
      router: 'all_domain_lens_router_v2',
      taxonomy_version: TAXONOMY_VERSION,
      user_selection_required: false,
      input_valid: true,
      input_error: null,
      classification_basis: 'ABSTAIN_LOW_SIGNAL',
      confidence: Number(confidence.toFixed(6)),
      taxonomy_review_required: true,
      primary: null,
      secondary: [],
      overlays,
      normalized,
      lens_text: buildLensText(null, overlays, 'ABSTAIN_LOW_SIGNAL', Number(confidence.toFixed(6)), true),
      analysis_text: normalized.analysis_text
    };
  }

  const classification = classifyScores(scored);
  const primary = publicGenre({ ...best, ...classification });
  const secondary = scored.slice(1)
    .filter((item) => qualifiedScore(item, true))
    .slice(0, 3)
    .map((item) => {
      const meta = classifyScores([item]);
      return publicGenre({ ...item, ...meta });
    });

  return {
    router: 'all_domain_lens_router_v2',
    taxonomy_version: TAXONOMY_VERSION,
    user_selection_required: false,
    input_valid: true,
    input_error: null,
    classification_basis: primary.classification_basis,
    confidence: primary.confidence,
    taxonomy_review_required: primary.taxonomy_review_required,
    primary,
    secondary,
    overlays,
    normalized,
    lens_text: buildLensText(primary, overlays),
    analysis_text: normalized.analysis_text
  };
}

module.exports = {
  routeDomainTemplates,
  TEMPLATES: GENRE_LENSES,
  GENRE_LENSES,
  OVERLAYS,
  normalizeInput,
  scoreGenre
};
