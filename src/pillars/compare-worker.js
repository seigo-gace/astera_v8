'use strict';

const { normalizeEvidencePacket, unique } = require('../judgment-materials-analyzer');

const WEIGHTS = Object.freeze({ objectiveFit: 0.30, evidenceFit: 0.25, riskControl: 0.20, constraintFit: 0.15, reversibility: 0.10 });

function scoreMetrics(metrics = {}) {
  return Math.max(0, Math.min(100, Math.round(Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + Number(metrics[key] || 0) * weight, 0))));
}

function compareCandidates(candidates = []) {
  return candidates.map((candidate) => {
    const score = scoreMetrics(candidate.metrics);
    return { id: candidate.id, label: candidate.label, angle: candidate.angle, thesis: candidate.thesis, score, answer_line_distance: 100 - score, metrics: candidate.metrics || {}, weights: WEIGHTS, rationale: candidate.rationale || '', strengths: candidate.strengths || [], failure_modes: candidate.failure_modes || [], required_checks: candidate.required_checks || [], rule_ids: candidate.rule_ids || [] };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function detectContradictions({ facts = {}, risks = {}, inquiry = {}, evidence, ranking = [], task = {} }) {
  const contradictions = [];
  if ((facts.confirmed?.length || 0) === 0 && (facts.unconfirmed?.length || 0) > 0) contradictions.push({ key: 'fact_gap', note: '確認済みFactがなく入力由来の未確認主張が残る。' });
  if (task.evidence_need?.required && evidence.state !== 'VALID') contradictions.push({ key: 'required_evidence_not_valid', note: `Evidence必須Taskだがstate=${evidence.state} / status=${evidence.source_status || '-'}。` });
  if (evidence.state === 'REJECTED') contradictions.push({ key: 'evidence_rejected', note: `Evidence Search=${evidence.source_status}。${(evidence.eligibility_reasons || []).join(' / ')}` });
  if (evidence.conflict_detected) contradictions.push({ key: 'evidence_conflict', note: 'Source Conflictが未解消。' });
  if (risks.level === 'high' && ranking[0]?.metrics?.riskControl < 80) contradictions.push({ key: 'risk_control_gap', note: '最高候補でも高Riskへの制御力が不足。' });
  if (inquiry.problem_health && !inquiry.problem_health.healthy) contradictions.push({ key: 'premise_gap', note: inquiry.problem_health.reason });
  if ((task.prohibitions || []).some((item) => (task.replace || []).some((other) => item.includes(other) || other.includes(item)))) contradictions.push({ key: 'hard_constraint_conflict', note: '禁止対象と変更対象が重複する可能性。' });
  if ((task.hard_blockers || []).length) contradictions.push({ key: 'hard_blocker', note: `Hard Blocker=${task.hard_blockers.join(' / ')}` });
  if (ranking[0]?.id === 'bad_hand') contradictions.push({ key: 'bad_hand_rank_anomaly', note: '悪手案が首位。採点Invariant違反。' });
  return contradictions;
}

async function run({ question = '', facts = {}, risks = {}, multi = {}, inquiry = {}, dialectic = {}, domain = {}, task = null, evidence_packet = null, dependency_state = {} }) {
  const t = task || { id: null, target: '対象', objective: question, action: 'analyze', constraints: [], prohibitions: [], preserve: [], replace: [], depends_on: [], hard_blockers: [] };
  const evidence = normalizeEvidencePacket(evidence_packet);
  const evidenceRequired = Boolean(t.evidence_need?.required);
  const evidenceValid = evidence.state === 'VALID';
  const ranking = compareCandidates(Array.isArray(dialectic.candidates) ? dialectic.candidates : []);
  const selectable = ranking.filter((item) => item.id !== 'bad_hand');
  const selected = selectable[0] || null;
  const contradictions = detectContradictions({ facts, risks, inquiry, evidence, ranking, task: t });
  const dependencyBlockers = (t.depends_on || []).filter((id) => !['recommend', 'recommend_with_caution'].includes(dependency_state[id]?.decision));
  if (dependencyBlockers.length) contradictions.push({ key: 'dependency_blocked', note: `未成立Dependency=${dependencyBlockers.join(',')}` });
  const hardBlockers = unique(t.hard_blockers || []);
  const score = selected?.score || 0;
  const answerLineDistance = 100 - score;

  let decision = 'recommend';
  const gates = [];
  if (!selected || score < 60) { decision = 'hold_and_clarify'; gates.push('COMPARE-GATE-SCORE-LT60'); }
  if (score >= 60 && (score < 80 || contradictions.length)) { decision = 'recommend_with_caution'; gates.push('COMPARE-GATE-CAUTION'); }
  if (evidenceRequired && !evidenceValid) { decision = 'hold_and_clarify'; gates.push('COMPARE-GATE-REQUIRED-EVIDENCE-NOT-VALID'); }
  if (evidenceRequired && evidenceValid && Number(evidence.quality_score_bp || 0) < 9500) { decision = 'hold_and_clarify'; gates.push('COMPARE-GATE-EVIDENCE-BELOW-95'); }
  if (dependencyBlockers.length) { decision = 'hold_and_clarify'; gates.push('COMPARE-GATE-DEPENDENCY'); }
  if (hardBlockers.length) { decision = 'hold_and_clarify'; gates.push('COMPARE-GATE-HARD-BLOCKER'); }
  if ((t.prohibitions || []).length && selected?.id === 'bad_hand') { decision = 'hold_and_clarify'; gates.push('COMPARE-GATE-PROHIBITION'); }

  const runnerUp = selectable.filter((item) => item.id !== selected?.id)[0] || null;
  const margin = selected && runnerUp ? selected.score - runnerUp.score : null;
  const evidenceReason = evidenceRequired
    ? `Evidence=${evidence.state}/${evidence.source_status || '-'}:${evidence.quality_score_bp ?? '-'}bp, reinforcement=${evidence.reinforcement_attempt_count || 0}, corroboration=${evidence.new_corroboration_count || 0}`
    : `Evidence=${evidence.state}`;
  const rationale = selected
    ? `${selected.label}をTask ${t.id || '-'}の首位候補とする。目的適合=${selected.metrics.objectiveFit ?? '-'}、Evidence適合=${selected.metrics.evidenceFit ?? '-'}、Risk制御=${selected.metrics.riskControl ?? '-'}、Constraint適合=${selected.metrics.constraintFit ?? '-'}、Rollback性=${selected.metrics.reversibility ?? '-'}。${evidenceReason}。${runnerUp ? `次点${runnerUp.label}との差=${margin}。` : ''}${hardBlockers.length ? ` ただしHard Blocker=${hardBlockers.join(' / ')}のため確定禁止。` : ''}${evidenceRequired && !evidenceValid ? ' 必須Evidence未成立のためScoreに関係なくHold。' : ''}`
    : '比較可能な候補がない。';

  return {
    pillar: 'compare',
    task_id: t.id || null,
    score,
    answer_line_distance: answerLineDistance,
    score_model: { formula: 'objectiveFit*0.30 + evidenceFit*0.25 + riskControl*0.20 + constraintFit*0.15 + reversibility*0.10', weights: WEIGHTS },
    score_breakdown: selected ? Object.entries(WEIGHTS).map(([key, weight]) => ({ key, weight, raw: selected.metrics[key] ?? 0, contribution: Number(((selected.metrics[key] || 0) * weight).toFixed(2)) })) : [],
    contradictions,
    dependency_blockers: dependencyBlockers,
    hard_blockers: hardBlockers,
    selected_candidate: selected,
    candidate_ranking: ranking,
    rejected_candidates: ranking.filter((candidate) => candidate.id !== selected?.id).map((candidate) => ({ id: candidate.id, label: candidate.label, score: candidate.score, reason: candidate.id === 'bad_hand' ? '意図的悪手のため採用対象外。' : `首位との差=${selected ? selected.score - candidate.score : '-'} / failure=${candidate.failure_modes?.[0] || '明示なし'}` })),
    evidence_gate: {
      required: evidenceRequired,
      passed: !evidenceRequired || evidenceValid,
      state: evidence.state,
      source_status: evidence.source_status,
      eligibility_reasons: evidence.eligibility_reasons || [],
      quality_score_bp: evidence.quality_score_bp,
      quality_gate_bp: evidence.quality_gate_bp,
      coverage_state: evidence.coverage_state,
      role_counts: evidence.role_counts || {},
      distinct_authority_count: evidence.distinct_authority_count || 0,
      distinct_source_family_count: evidence.distinct_source_family_count || 0,
      reinforcement_attempt_count: evidence.reinforcement_attempt_count || 0,
      new_corroboration_count: evidence.new_corroboration_count || 0
    },
    uncertainty: {
      evidence_state: evidence.state,
      evidence_quality_score_bp: evidence.quality_score_bp,
      evidence_eligibility_reasons: evidence.eligibility_reasons || [],
      evidence_authority_count: evidence.distinct_authority_count || 0,
      evidence_source_family_count: evidence.distinct_source_family_count || 0,
      evidence_new_corroboration_count: evidence.new_corroboration_count || 0,
      unresolved_fact_count: facts.unconfirmed?.length || 0,
      missing_field_count: inquiry.missing_fields?.length || 0,
      selection_margin: margin
    },
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name, compare_lens: domain.primary.compare_lens || [] } : null,
    authority: {
      stage: 'compare',
      owns: ['score', 'candidate_ranking', 'selected_candidate', 'rejected_candidates', 'uncertainty', 'decision']
    },
    verdict: { decision, angle: selected?.angle || 'balanced', reason: rationale, objective: t.objective, gate_rule_ids: unique(gates) }
  };
}

module.exports = { run, WEIGHTS };
