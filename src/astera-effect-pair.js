'use strict';

const {
  evaluateStory,
  tokenOverlap,
  normativeViolation,
  baselineMaterial
} = require('./astera-effect-rubric');

const DIMENSIONS = Object.freeze([
  'user_intent_preservation',
  'constraint_preservation',
  'prohibition_preservation',
  'known_unknown_separation',
  'missing_information_discovery',
  'factual_grounding',
  'uncertainty_calibration',
  'risk_discovery',
  'opposing_view_coverage',
  'comparison_completeness',
  'contradiction_preservation',
  'evidence_traceability',
  'unsupported_assertion_reduction',
  'final_decision_overreach_prevention',
  'main_ai_actionability',
  'irrelevant_information_increase'
]);

function norm(s) {
  return String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function userBlob(story) {
  return `${story.user_input || ''}\n${story.context || ''}`;
}

function extractInputConstraints(story) {
  const text = userBlob(story);
  const prohibitions = [];
  const constraints = [];
  const deadlines = [];
  const rePro = /(?:禁止|してはならない|しないで|触らない|止めたくない|変えない|譲れない)/gu;
  const reDeadline = /(?:期限|締切|までに|来週|今週|金曜|月曜|\d+日以内|\d+月\d+日)/gu;
  for (const m of text.matchAll(rePro)) {
    const snip = text.slice(Math.max(0, m.index - 24), Math.min(text.length, m.index + 40)).trim();
    if (snip.length > 4) prohibitions.push(snip);
  }
  for (const m of text.matchAll(reDeadline)) {
    const snip = text.slice(Math.max(0, m.index - 16), Math.min(text.length, m.index + 32)).trim();
    if (snip.length > 4) deadlines.push(snip);
  }
  const reCond = /(?:条件|ただし|前提|予算|納期|must|不可)/gi;
  for (const m of text.matchAll(reCond)) {
    const snip = text.slice(Math.max(0, m.index - 20), Math.min(text.length, m.index + 36)).trim();
    if (snip.length > 4) constraints.push(snip);
  }
  const hasExplicit = prohibitions.length + constraints.length + deadlines.length > 0
    || /禁止|期限|条件|ただし|しない|止め|譲れ/i.test(text);
  return {
    prohibitions: [...new Set(prohibitions)],
    constraints: [...new Set(constraints)],
    deadlines: [...new Set(deadlines)],
    hasExplicit
  };
}

function memoKeepsPhrases(memoText, phrases) {
  if (!phrases.length) return true;
  const blob = norm(memoText);
  let kept = 0;
  for (const p of phrases) {
    if (tokenOverlap(blob, p) >= 0.18) kept += 1;
  }
  return kept >= Math.ceil(phrases.length * 0.5);
}

function packetOf(result) {
  return result?.analysis_task_packet || {};
}

function claimTexts(result) {
  const out = [];
  for (const rec of result?.canonical_claims?.records || []) {
    const c = rec?.claim || rec;
    const t = c?.raw_text || c?.fragment?.normalized_fragment || c?.source_span?.text || '';
    if (t) out.push(String(t));
  }
  return out;
}

function riskTexts(result, userInput) {
  const risks = [];
  const push = (r) => {
    const t = typeof r === 'string' ? r : (r?.description || r?.text || '');
    if (t && String(t).length > 6) risks.push(String(t));
  };
  if (result?.risk_assessment?.failure_conditions) result.risk_assessment.failure_conditions.forEach(push);
  if (result?.risk_assessment?.material_risks) result.risk_assessment.material_risks.forEach(push);
  for (const tr of result?.task_results || []) {
    (tr?.risk?.failure_conditions || []).forEach(push);
    (tr?.risk?.items || []).forEach(push);
  }
  const crisis = result?.judgment?.['04_crisis'];
  if (crisis?.items?.length) crisis.items.forEach(push);
  const userN = norm(userInput);
  return risks.filter((r) => tokenOverlap(userN, r) < 0.38);
}

function opposingTexts(result, userInput) {
  const out = [];
  if (result?.multi_perspective?.perspectives) {
    for (const p of result.multi_perspective.perspectives) {
      const t = typeof p === 'string' ? p : (p?.summary || p?.label || '');
      if (t) out.push(String(t));
    }
  }
  const opp = result?.judgment?.['05_opposition'];
  if (opp?.items?.length) out.push(...opp.items.map(String));
  const userN = norm(userInput);
  return out.filter((t) => tokenOverlap(userN, t) < 0.4);
}

function comparisonTexts(result) {
  const cmp = result?.comparison || {};
  const out = [];
  for (const d of cmp.dimensions || []) {
    const t = typeof d === 'string' ? d : (d?.label || d?.name || JSON.stringify(d));
    if (t) out.push(String(t));
  }
  for (const c of cmp.candidates || cmp.options || []) {
    const t = typeof c === 'string' ? c : (c?.label || c?.name || '');
    if (t) out.push(String(t));
  }
  const sec = result?.judgment?.['06_comparison'];
  if (sec?.summary) out.push(String(sec.summary));
  if (sec?.items?.length) out.push(...sec.items.map(String));
  return out.filter(Boolean);
}

function evidenceNeedTexts(result) {
  const out = [];
  for (const t of packetOf(result).tasks || []) {
    const need = t.evidence_need;
    if (Array.isArray(need)) need.forEach((n) => out.push(typeof n === 'string' ? n : JSON.stringify(n)));
    else if (need && typeof need === 'object') out.push(JSON.stringify(need));
    const q = t.canonical_plan?.search_plan?.queries || t.search_plan?.queries || [];
    q.forEach((x) => out.push(String(x)));
  }
  const ev = result?.judgment?.['07_evidence_status'];
  if (ev?.summary) out.push(String(ev.summary));
  if (ev?.items?.length) out.push(...ev.items.map(String));
  return out;
}

function judgmentBodyText(result) {
  const j = result?.judgment || {};
  const keys = j.order || Object.keys(j).filter((k) => /^0/.test(k));
  const parts = [];
  for (const k of keys) {
    const sec = j[k];
    if (!sec) continue;
    if (sec.summary) parts.push(String(sec.summary));
    if (sec.items?.length) parts.push(sec.items.join('\n'));
  }
  return parts.join('\n');
}

function materialTextFromOut(out) {
  const text = out?.material?.text || out?.material?.compact_text || '';
  if (text) return String(text);
  return judgmentBodyText(out?.result || {});
}

/** @param {object} story @param {object|null|undefined} material full engine out, or null for A */
function consume(story, material) {
  const user = story.user_input || '';
  const ctx = story.context || '';
  const inputCx = extractInputConstraints(story);
  if (material == null) {
    const lines = [user];
    if (ctx) lines.push(ctx);
    for (const p of inputCx.prohibitions) lines.push(`[入力の禁止・制約] ${p}`);
    for (const c of inputCx.constraints) lines.push(`[入力の条件] ${c}`);
    for (const d of inputCx.deadlines) lines.push(`[入力の期限] ${d}`);
    lines.push('入力に根拠がない事実は未確認として扱う。');
    const text = lines.filter(Boolean).join('\n');
    return {
      side: 'A',
      text,
      input_constraints: inputCx,
      risks: [],
      opposing: [],
      comparison: [],
      evidence_needs: [],
      unknowns: ['入力外の事実は未確認'],
      claims: [],
      has_structured_sections: false
    };
  }

  const result = material.result || {};
  const body = materialTextFromOut(material);
  const pkt = packetOf(result);
  const risks = riskTexts(result, user);
  const opposing = opposingTexts(result, user);
  const comparison = comparisonTexts(result);
  const evidence_needs = evidenceNeedTexts(result);
  const claims = claimTexts(result);
  const unknowns = (pkt.unresolved || []).map(String);
  if ((result?.canonical_claims?.undetermined_count ?? 0) > 0) unknowns.push('未確定クレームあり');
  if (
    /未確定|UNDETERMINED|未確認/i.test(body)
    || /CONFIRMED\s*\d+件\s*\/\s*UNDETERMINED/i.test(body)
  ) {
    unknowns.push('structured_unknown_status_in_material');
  }

  const constraintLines = [];
  for (const rec of pkt.constraint_records || []) {
    const v = rec?.value ?? rec;
    if (v) constraintLines.push(String(v));
  }
  for (const item of [...(pkt.constraints || []), ...(pkt.prohibitions || []), ...(pkt.preserve || []), ...(pkt.deadlines || [])]) {
    if (item) constraintLines.push(typeof item === 'string' ? item : JSON.stringify(item));
  }

  const textParts = [body, judgmentBodyText(result), ...constraintLines, ...claims, ...risks, ...opposing, ...comparison];
  const text = textParts.filter(Boolean).join('\n');

  return {
    side: 'B',
    text,
    input_constraints: inputCx,
    packet_constraints: constraintLines,
    risks,
    opposing,
    comparison,
    evidence_needs,
    unknowns,
    claims,
    has_structured_sections: (result?.judgment?.order || []).length >= 2,
    result
  };
}

function memoMainAiActionability(memo, story) {
  const user = story.user_input || '';
  const blob = memo.text || '';
  const intentOk = intentOverlapForMemo(story, memo) >= 0.12;
  const ic = memo.input_constraints || extractInputConstraints(story);
  const allInputPhrases = [...ic.prohibitions, ...ic.constraints, ...ic.deadlines];
  const constraintsOk = !ic.hasExplicit || memoKeepsPhrases(blob, allInputPhrases);
  const claimsOrUnknown = memo.claims.length > 0 || memo.unknowns.length > 0
    || /CONFIRMED\s*\d+件\s*\/\s*UNDETERMINED|未確定|未確認/i.test(blob);
  const valueMaterial = memo.risks.length > 0 || memo.comparison.length > 0 || memo.evidence_needs.length > 0;
  return intentOk && constraintsOk && claimsOrUnknown && valueMaterial;
}

function intentOverlapForMemo(story, memo) {
  const user = story.user_input || '';
  const ctx = story.context || '';
  let blob = norm(memo.text || '');
  if (memo.side === 'B') {
    blob = norm(`${user}\n${ctx}\n${memo.text || ''}`);
  }
  return tokenOverlap(blob, user);
}

function scoreAnswer(story, memo) {
  const user = story.user_input || '';
  const blob = norm(memo.text || '');
  const userN = norm(user);
  const ic = memo.input_constraints || extractInputConstraints(story);
  const allInputPhrases = [...ic.prohibitions, ...ic.constraints, ...ic.deadlines];

  const scores = {};

  const intentA = intentOverlapForMemo(story, memo);
  scores.user_intent_preservation = intentA >= 0.22 ? 2 : (intentA >= 0.12 ? 1 : 0);

  if (memo.side === 'B' && scores.user_intent_preservation === 0) {
    const goal = String(packetOf(memo.result || {}).user_goal || '');
    if (goal && tokenOverlap(user, goal) >= 0.15) scores.user_intent_preservation = 1;
  }

  if (!ic.hasExplicit) {
    scores.constraint_preservation = 1;
    scores.prohibition_preservation = 1;
  } else {
    const kept = memoKeepsPhrases(memo.text, allInputPhrases);
    scores.constraint_preservation = kept ? 2 : 0;
    scores.prohibition_preservation = ic.prohibitions.length
      ? (memoKeepsPhrases(memo.text, ic.prohibitions) ? 2 : 0)
      : (kept ? 1 : 0);
  }

  if (memo.side === 'A') {
    scores.known_unknown_separation = ic.hasExplicit ? 1 : 0;
    scores.missing_information_discovery = 0;
    scores.factual_grounding = 1;
    scores.uncertainty_calibration = ic.hasExplicit ? 1 : 2;
    scores.risk_discovery = 0;
    scores.opposing_view_coverage = 0;
    scores.comparison_completeness = /案|選択|どちら|比較|vs/i.test(user) ? 1 : 0;
    scores.contradiction_preservation = /矛盾|一方.*一方|ぶつか/i.test(user) ? 1 : 0;
    scores.evidence_traceability = 0;
    scores.unsupported_assertion_reduction = 1;
    scores.final_decision_overreach_prevention = 2;
    scores.main_ai_actionability = 1;
    scores.irrelevant_information_increase = 0;
    return scores;
  }

  const result = memo.result || {};
  const hasUnknown = memo.unknowns.length > 0 || (result?.canonical_claims?.undetermined_count ?? 0) > 0;
  const hasClaims = memo.claims.length > 0;
  scores.known_unknown_separation = hasUnknown && hasClaims ? 2 : (hasUnknown || hasClaims ? 1 : 0);
  scores.missing_information_discovery = (packetOf(result).unresolved || []).length > 0
    || (result?.inquiry?.gaps || []).length > 0 ? 2 : 0;

  scores.factual_grounding = 1;
  scores.uncertainty_calibration = hasUnknown ? 2 : 1;
  scores.risk_discovery = memo.risks.length >= 2 ? 2 : (memo.risks.length === 1 ? 1 : 0);
  scores.opposing_view_coverage = memo.opposing.length >= 1 ? 2 : 0;
  scores.comparison_completeness = memo.comparison.length >= 2 ? 2 : (memo.comparison.length === 1 ? 1 : 0);
  scores.contradiction_preservation = (packetOf(result).conflicts || []).length > 0 ? 2 : 0;
  scores.evidence_traceability = memo.evidence_needs.length >= 1 ? 2 : 0;
  scores.unsupported_assertion_reduction = 1;
  scores.final_decision_overreach_prevention = normativeViolation(result) ? 0 : 2;
  scores.main_ai_actionability = memoMainAiActionability(memo, story) ? 2 : 0;

  const baseNorm = norm(baselineMaterial(story));
  const baseLen = baseNorm.split(/\s+/).length;
  const memoLen = blob.split(/\s+/).length;
  const extra = memoLen - baseLen;
  const noisy = extra > 120 && tokenOverlap(blob, user) < tokenOverlap(baseNorm, user);
  scores.irrelevant_information_increase = noisy ? 2 : 0;

  return scores;
}

function dimensionDelta(dim, story, memoA, memoB, aScore, bScore, bViolations) {
  if (dim === 'constraint_preservation' || dim === 'prohibition_preservation') {
    const ic = memoA.input_constraints;
    if (ic.hasExplicit) {
      const aOk = aScore >= 2;
      const bOk = bScore >= 2;
      if (aOk && bOk) return 0;
    } else if (aScore === bScore) return 0;
  }

  if (dim === 'risk_discovery') {
    if (!memoB.risks.length) return 0;
    const novel = memoB.risks.some((r) => tokenOverlap(norm(userBlob(story)), r) < 0.35);
    if (!novel) return 0;
  }

  if (dim === 'factual_grounding' && bViolations?.hallucination) return -2;
  if (dim === 'unsupported_assertion_reduction' && (bViolations?.unsupported_confirmed || bViolations?.false_confirmation)) return -2;
  if (dim === 'final_decision_overreach_prevention' && bViolations?.final_decision_violation) return -2;
  if (dim === 'constraint_preservation' && bViolations?.constraint_loss) return -2;
  if (dim === 'prohibition_preservation' && bViolations?.constraint_loss) return -2;
  if (dim === 'uncertainty_calibration' && bViolations?.uncertainty_loss) return -2;

  if (dim === 'irrelevant_information_increase') {
    if (bScore > aScore) return -1;
    if (bScore < aScore) return 1;
    return 0;
  }

  if (bScore > aScore) return 1;
  if (bScore < aScore) return -1;
  return 0;
}

function criticalViolations(v) {
  return Boolean(
    v?.hallucination || v?.constraint_loss || v?.false_confirmation || v?.unsupported_confirmed
      || v?.final_decision_violation || v?.uncertainty_loss || v?.task_decomposition_failure
  );
}

function bMaterialFromOut(story, out) {
  if (!out || out?.result?.type === 'baseline_only') return null;
  return out;
}

function pairedStoryResult(story, out) {
  const memoA = consume(story, null);
  const bMat = bMaterialFromOut(story, out);
  const memoB = consume(story, bMat);

  const scoresA = scoreAnswer(story, memoA);
  const scoresB = scoreAnswer(story, memoB);

  const evaluation = out ? evaluateStory(story, out) : null;
  const bViolations = evaluation?.violations || {};

  const dimension_detail = {};
  const dimension_scores = {};
  let deltaSum = 0;
  for (const dim of DIMENSIONS) {
    const aScore = scoresA[dim] ?? 0;
    const bScore = scoresB[dim] ?? 0;
    const delta = dimensionDelta(dim, story, memoA, memoB, aScore, bScore, bViolations);
    dimension_detail[dim] = { a_score: aScore, b_score: bScore, delta };
    dimension_scores[dim] = delta;
    deltaSum += delta;
  }

  let pair_outcome = 'TIE';
  if (criticalViolations(bViolations)) pair_outcome = 'LOSS';
  else if (deltaSum > 0) pair_outcome = 'WIN';
  else if (deltaSum < 0) pair_outcome = 'LOSS';

  return {
    story_id: story.story_id,
    pair_outcome,
    dimension_scores,
    dimension_detail,
    paired_delta: deltaSum,
    evaluation
  };
}

function summarizePairs(rows) {
  const summary = {
    count: rows.length,
    WIN: 0,
    TIE: 0,
    LOSS: 0,
    paired_deltas: [],
    critical_violation_stories: []
  };
  for (const row of rows) {
    summary[row.pair_outcome] += 1;
    summary.paired_deltas.push(row.paired_delta);
    const v = row.evaluation?.violations || {};
    if (criticalViolations(v)) {
      summary.critical_violation_stories.push({
        story_id: row.story_id,
        violations: v
      });
    }
  }
  summary.paired_deltas.sort((a, b) => a - b);
  summary.median_paired_delta = summary.paired_deltas.length
    ? summary.paired_deltas[Math.floor(summary.paired_deltas.length / 2)]
    : 0;
  return summary;
}

module.exports = {
  DIMENSIONS,
  consume,
  scoreAnswer,
  pairedStoryResult,
  summarizePairs
};
