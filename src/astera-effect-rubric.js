'use strict';

const { unique, tokenOverlap } = require('./judgment-materials-analyzer');

const RUBRIC = Object.freeze([
  { id: 'R01_purpose_clear', label: '目的明確' },
  { id: 'R02_premise_constraints', label: '前提・制約' },
  { id: 'R03_known_vs_unknown', label: '既知vs未確認分離' },
  { id: 'R04_gaps_explicit', label: '不足明示' },
  { id: 'R05_risk_discovery', label: 'リスク発見' },
  { id: 'R06_counter_view', label: '反対視点' },
  { id: 'R07_comparison_axis', label: '比較軸' },
  { id: 'R08_contradiction_kept', label: '矛盾保持' },
  { id: 'R09_no_false_certainty', label: '不確実性を埋めない' },
  { id: 'R10_evidence_need', label: 'Evidence Need' },
  { id: 'R11_task_decomposition', label: 'Task分解' },
  { id: 'R12_condition_exception', label: '条件例外禁止保持' },
  { id: 'R13_ai_usable_structure', label: '主役AIが使いやすい構造' },
  { id: 'R14_no_hallucination', label: '捏造なし' },
  { id: 'R15_no_final_decision', label: 'Winner/最終判断なし' }
]);

const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

function baselineMaterial(story) {
  const parts = [story.user_input];
  if (story.context) parts.push(story.context);
  return parts.filter(Boolean).join('\n');
}

function asteraMaterialText(out) {
  const text = out?.material?.text || out?.material?.compact_text || '';
  if (text) return String(text);
  const j = out?.result?.judgment;
  if (!j) return '';
  const keys = j.order || [];
  return keys.map((k) => {
    const sec = j[k];
    if (!sec) return '';
    const items = (sec.items || []).join('\n');
    return `${sec.label || k}\n${sec.summary || ''}\n${items}`;
  }).join('\n---\n');
}

function extractConstraintPhrases(userText) {
  const text = String(userText || '');
  const out = [];
  const patterns = [
    /(?:しない|禁止|変えない|止めたくない|譲れない|条件)/gu,
    /(?:予算|納期|期限|来週|金曜|10%)/gu,
    /(?:急ぎ|慎重)/gu
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const start = Math.max(0, m.index - 20);
      const snippet = text.slice(start, Math.min(text.length, m.index + 30));
      out.push(snippet.trim());
    }
  }
  return unique(out);
}

function scoreRubric15(materialText, { userInput = '', result = null, mode = 'baseline' } = {}) {
  const text = String(materialText || '');
  const lower = norm(text);
  const user = String(userInput || '');
  const scores = {};

  const hasPurpose = /目的|goal|objective|何を|why|整理|確認すべき|手を付け/i.test(text)
    || (mode === 'baseline' && /したい|欲しい|困|教えて/i.test(user));
  scores.R01_purpose_clear = hasPurpose ? (mode === 'astera' && /01_purpose|目的/.test(text) ? 2 : 1) : 0;

  const constraints = extractConstraintPhrases(user);
  const constraintHits = constraints.filter((c) => lower.includes(norm(c).slice(0, 8))).length;
  const premSection = /02_premise|前提|制約|hard_constraint|prohibition|維持/i.test(text);
  if (mode === 'baseline') {
    scores.R02_premise_constraints = constraints.length ? 1 : 0;
  } else {
    scores.R02_premise_constraints = premSection && constraintHits >= Math.min(1, constraints.length) ? 2
      : (premSection || constraintHits > 0 ? 1 : 0);
  }

  const unknownSep = /未確認|undetermined|不明|missing|未確定|UNRESOLVED|03_facts|fact/i.test(text);
  scores.R03_known_vs_unknown = unknownSep ? (mode === 'astera' ? 2 : 1) : (mode === 'baseline' ? 0 : 1);

  const gaps = /不足|missing|確認|洗い出|gap|inquiry/i.test(text);
  scores.R04_gaps_explicit = gaps ? (mode === 'astera' ? 2 : 1) : 0;

  const risk = /リスク|危機|crisis|04_crisis|failure|失敗/i.test(text);
  scores.R05_risk_discovery = risk ? (mode === 'astera' ? 2 : 0) : 0;

  const counter = /反対|対立|05_opposition|counter|perspective|trade-off/i.test(text);
  scores.R06_counter_view = counter ? (mode === 'astera' ? 2 : 0) : 0;

  const compare = /比較|compare|06_comparison|軸|案|一長一短/i.test(text) || /比較|案/.test(user);
  scores.R07_comparison_axis = compare ? (mode === 'astera' && /06_comparison|比較/.test(text) ? 2 : 1) : 0;

  const contradictionUser = /矛盾|ぶつか|急ぎ.*慎重|慎重.*急ぎ/i.test(user);
  const contradictionKept = /conflict|矛盾|両方|contradiction|blocking/i.test(text);
  scores.R08_contradiction_kept = contradictionUser
    ? (contradictionKept ? 2 : (mode === 'baseline' ? 1 : 0))
    : (mode === 'astera' && contradictionKept ? 1 : 0);

  const falseCertain = /\bconfirmed\b|確定済|間違いなく|必ず成功/i.test(text)
    && !/undetermined|未確認|未確定/i.test(text);
  const undetermined = /undetermined|未確定|未確認|NOT_CONFIRMED/i.test(text);
  scores.R09_no_false_certainty = falseCertain ? 0 : (undetermined || mode === 'baseline' ? 2 : 1);

  let evidenceNeed = /evidence|根拠|search|07_evidence|evidence_need|事実確認/i.test(text);
  if (result?.analysis_task_packet?.tasks) {
    evidenceNeed = evidenceNeed || result.analysis_task_packet.tasks.some((t) => (t.evidence_need || []).length > 0);
  }
  scores.R10_evidence_need = evidenceNeed ? (mode === 'astera' ? 2 : ( /事実確認|根拠|確認/.test(user) ? 1 : 0)) : 0;

  const taskCount = result?.analysis_task_packet?.tasks?.length ?? 0;
  const multiStepUser = /(?:・|、|および|并且|first|then|条件|段階)/i.test(user) || user.length > 80;
  if (mode === 'baseline') {
    scores.R11_task_decomposition = multiStepUser ? 0 : 1;
  } else {
    scores.R11_task_decomposition = taskCount >= 1 ? (taskCount >= 2 && multiStepUser ? 2 : 1) : 0;
  }

  const condExc = constraints.every((c) => lower.includes(norm(c).slice(0, 6)) || !c)
    || (mode === 'astera' && /08_reinstruction|禁止|prohibition|preserve|維持/i.test(text));
  scores.R12_condition_exception = constraints.length
    ? (condExc ? 2 : (mode === 'baseline' ? 1 : 0))
    : 1;

  const structured = mode === 'astera' && /---\n|判断材料|01_purpose|導出根拠/.test(text);
  scores.R13_ai_usable_structure = structured ? 2 : (mode === 'baseline' ? 0 : (text.length > 200 ? 1 : 0));

  scores.R14_no_hallucination = 2;

  const winner = /winner|採用案|勝者|recommended|you should choose|A案採用|ranking/i.test(text);
  const normDec = result?.comparison?.selected_candidate != null
    || (Array.isArray(result?.comparison?.candidate_ranking) && result.comparison.candidate_ranking.length > 0);
  scores.R15_no_final_decision = winner || normDec ? 0 : 2;

  return scores;
}

function totalScore(scores) {
  return RUBRIC.reduce((sum, r) => sum + (scores[r.id] ?? 0), 0);
}

function deltaScores(baseline, astera) {
  const delta = {};
  for (const r of RUBRIC) {
    delta[r.id] = (astera[r.id] ?? 0) - (baseline[r.id] ?? 0);
  }
  return delta;
}

function linesNotInBaseline(baselineText, asteraText) {
  const baseSet = new Set(
    norm(baselineText).split(/[\n。]/).map((l) => l.trim()).filter((l) => l.length >= 8)
  );
  return unique(
    String(asteraText || '').split(/[\n。]/).map((l) => l.trim()).filter((l) => l.length >= 10 && !baseSet.has(norm(l)))
  ).slice(0, 24);
}

function categorizeAdded(lines, result) {
  const added = {
    new_premises: [],
    new_risks: [],
    new_counter: [],
    new_uncertain: [],
    new_comparison_axes: [],
    new_evidence_needs: [],
    reinstruction_improvements: []
  };
  for (const line of lines) {
    if (/前提|premise|制約|constraint|prohibition|維持/i.test(line)) added.new_premises.push(line);
    else if (/リスク|危機|crisis|failure|失敗/i.test(line)) added.new_risks.push(line);
    else if (/反対|counter|perspective|trade-off|対立/i.test(line)) added.new_counter.push(line);
    else if (/未確認|undetermined|missing|未確定|UNRESOLVED/i.test(line)) added.new_uncertain.push(line);
    else if (/比較|compare|軸|candidate|trade-off difference/i.test(line)) added.new_comparison_axes.push(line);
    else if (/evidence|search|根拠|07_evidence|事実/i.test(line)) added.new_evidence_needs.push(line);
    else if (/08_reinstruction|再指示|禁止|preserve|wave/i.test(line)) added.reinstruction_improvements.push(line);
  }
  const tasks = result?.analysis_task_packet?.tasks || [];
  for (const t of tasks) {
    const needField = t.evidence_need;
    const needItems = Array.isArray(needField)
      ? needField
      : (needField && typeof needField === 'object' ? [needField] : []);
    for (const need of needItems) {
      const s = typeof need === 'string' ? need : JSON.stringify(need);
      if (s && !added.new_evidence_needs.includes(s)) added.new_evidence_needs.push(s);
    }
  }
  return added;
}

function detectHallucination(userInput, context, asteraText) {
  const source = norm(`${userInput}\n${context || ''}`);
  const nums = [...String(asteraText || '').matchAll(/\b(20\d{2}|19\d{2})\b/g)].map((m) => m[1]);
  for (const y of nums) {
    if (!source.includes(y)) return true;
  }
  const orgHits = [...String(asteraText || '').matchAll(/株式会社[^\s、。]{2,12}/g)].map((m) => m[0]);
  for (const org of orgHits) {
    if (!source.includes(org.slice(0, 4))) return true;
  }
  return false;
}

function detectConstraintLoss(userInput, asteraText, result) {
  const phrases = extractConstraintPhrases(userInput);
  if (!phrases.length) return false;
  if (result?.type === 'cognitive_map') {
    const prem = JSON.stringify(result.judgment?.['02_premise'] || {});
    const rein = JSON.stringify(result.judgment?.['08_reinstruction'] || {});
    const combined = norm(`${asteraText}\n${prem}\n${rein}`);
    const packet = result.analysis_task_packet || {};
    const constraintBlob = norm([
      ...(packet.constraints || []),
      ...(packet.prohibitions || []),
      ...(packet.preserve || []),
      ...(packet.deadlines || []),
      ...(packet.conditions || []),
      ...(packet.constraint_records || []).map((record) => record.value)
    ].join('\n'));
    let lost = 0;
    for (const p of phrases) {
      const key = norm(p).slice(0, 10);
      if (key.length >= 4 && !combined.includes(key.slice(0, 6)) && !constraintBlob.includes(key.slice(0, 6))) lost += 1;
    }
    return lost >= Math.ceil(phrases.length / 2);
  }
  const lower = norm(asteraText);
  let lost = 0;
  for (const p of phrases) {
    const key = norm(p).slice(0, 10);
    if (key.length >= 4 && !lower.includes(key.slice(0, 6))) lost += 1;
  }
  return lost >= Math.ceil(phrases.length / 2);
}

function hasFalseConfirmation(result) {
  const records = result?.canonical_claims?.records || [];
  const statuses = records.map((r) => r?.confirmation?.status || r?.status || 'UNKNOWN');
  const evidenceStarted = result?.evidence_processing_started === true;
  const hasEvidence = (result?.task_results || []).some(
    (tr) => tr?.evidence?.source_status === 'FINAL_VALID'
  );
  if (!evidenceStarted && !hasEvidence) {
    return statuses.some((s) => s === 'CONFIRMED');
  }
  return false;
}

function normativeViolation(result) {
  if (!result || result.type !== 'cognitive_map') return null;
  if (result.decision_authority !== 'EXTERNAL_ONLY') return 'decision_authority';
  if (result.no_normative_decision_generated !== true) return 'normative_decision';
  if (result.comparison?.selected_candidate != null) return 'selected_candidate';
  if (Array.isArray(result.comparison?.candidate_ranking) && result.comparison.candidate_ranking.length > 0) {
    return 'candidate_ranking';
  }
  const text = JSON.stringify(result.judgment || {});
  if (/\b(winner|採用案|勝者|A案採用|B案が優れ)\b/i.test(text)) return 'winner_language';
  return null;
}

function detectUncertaintyLoss(userInput, result) {
  const needsUnc = /未確認|矛盾|漠然|薄い|全部見れ|ログはまだ/i.test(userInput);
  if (!needsUnc || !result) return false;
  const und = (result.canonical_claims?.undetermined_count ?? 0) > 0
    || (result.analysis_task_packet?.unresolved || []).length > 0;
  const allConfirmed = (result.canonical_claims?.records || []).length > 0
    && (result.canonical_claims?.undetermined_count ?? 0) === 0
    && (result.analysis_task_packet?.unresolved || []).length === 0;
  return needsUnc && allConfirmed && result.type === 'cognitive_map';
}

function evaluateStory(story, out) {
  const userInput = story.user_input;
  const context = story.context || '';
  const baselineText = baselineMaterial(story);
  const asteraText = asteraMaterialText(out);
  const result = out?.result || {};

  const baselineScores = scoreRubric15(baselineText, { userInput, mode: 'baseline' });
  const asteraScores = scoreRubric15(asteraText, { userInput, result, mode: 'astera' });
  const delta = deltaScores(baselineScores, asteraScores);

  const baselineTotal = totalScore(baselineScores);
  const asteraTotal = totalScore(asteraScores);
  const improvementDelta = asteraTotal - baselineTotal;

  const addedLines = linesNotInBaseline(baselineText, asteraText);
  const added_value = categorizeAdded(addedLines, result);

  const hallucination = detectHallucination(userInput, context, asteraText);
  const constraint_loss = detectConstraintLoss(userInput, asteraText, result);
  const false_confirmation = hasFalseConfirmation(result);
  const final_decision = normativeViolation(result);
  const task_decomposition_failure = result.type === 'cognitive_map'
    && (result.analysis_task_packet?.tasks?.length ?? 0) === 0;
  const uncertainty_loss = detectUncertaintyLoss(userInput, result);

  if (hallucination) asteraScores.R14_no_hallucination = 0;
  if (final_decision) asteraScores.R15_no_final_decision = 0;

  const asteraTotalAdj = totalScore(asteraScores);
  const improvementDeltaAdj = asteraTotalAdj - baselineTotal;

  let storyOutcome = 'unchanged';
  if (improvementDeltaAdj > 0 && !hallucination && !constraint_loss && !final_decision) storyOutcome = 'improved';
  else if (improvementDeltaAdj < 0 || hallucination || constraint_loss || false_confirmation || final_decision) {
    storyOutcome = 'degraded';
  }

  return {
    baseline_scores: baselineScores,
    astera_scores: asteraScores,
    delta,
    BASELINE_TOTAL: baselineTotal,
    ASTERA_TOTAL: asteraTotalAdj,
    IMPROVEMENT_DELTA: improvementDeltaAdj,
    story_outcome: storyOutcome,
    added_value,
    violations: {
      hallucination,
      constraint_loss,
      false_confirmation,
      final_decision_violation: final_decision,
      task_decomposition_failure,
      uncertainty_loss
    },
    baseline_text_excerpt: baselineText.slice(0, 400),
    astera_text_excerpt: asteraText.slice(0, 800)
  };
}

module.exports = {
  RUBRIC,
  baselineMaterial,
  asteraMaterialText,
  scoreRubric15,
  evaluateStory,
  totalScore,
  tokenOverlap
};
