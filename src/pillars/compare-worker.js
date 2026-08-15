'use strict';

const { analyzeRequest, normalizeEvidencePacket } = require('../judgment-materials-analyzer');

const WEIGHTS = Object.freeze({
  objectiveFit: 0.30,
  evidenceFit: 0.25,
  riskControl: 0.20,
  constraintFit: 0.15,
  reversibility: 0.10
});

function scoreMetrics(metrics = {}) {
  return Math.max(0, Math.min(100, Math.round(
    Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + Number(metrics[key] || 0) * weight, 0)
  )));
}

function compareCandidates(candidates = []) {
  return candidates.map((candidate) => {
    const score = scoreMetrics(candidate.metrics);
    return {
      id: candidate.id,
      label: candidate.label,
      angle: candidate.angle,
      thesis: candidate.thesis,
      score,
      answer_line_distance: 100 - score,
      metrics: candidate.metrics || {},
      rationale: candidate.rationale || '',
      strengths: candidate.strengths || [],
      failure_modes: candidate.failure_modes || [],
      required_checks: candidate.required_checks || []
    };
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function detectContradictions({ facts = {}, risks = {}, inquiry = {}, evidence, ranking = [] }) {
  const contradictions = [];
  if ((facts.confirmed?.length || 0) === 0 && (facts.unconfirmed?.length || 0) > 0) {
    contradictions.push({ key: 'fact_gap', note: '確認済みFactがなく、入力由来の未確認主張だけが残る。' });
  }
  if (evidence.state === 'REJECTED') {
    contradictions.push({ key: 'evidence_rejected', note: `Evidence Search=${evidence.source_status}。根拠確定として扱えない。` });
  }
  if (evidence.conflict_detected) {
    contradictions.push({ key: 'evidence_conflict', note: 'Source Conflictが未解消。' });
  }
  if (risks.level === 'high' && ranking[0]?.metrics?.riskControl < 80) {
    contradictions.push({ key: 'risk_control_gap', note: '最高候補でも高Riskへの制御力が不足する。' });
  }
  if (inquiry.problem_health && !inquiry.problem_health.healthy) {
    contradictions.push({ key: 'premise_gap', note: inquiry.problem_health.reason });
  }
  if (ranking[0]?.id === 'bad_hand') {
    contradictions.push({ key: 'bad_hand_selected', note: '悪手案が首位。採点異常として停止する。' });
  }
  return contradictions;
}

async function run({ question = '', facts = {}, risks = {}, multi = {}, inquiry = {}, dialectic = {}, domain = {}, task = null, evidence_packet = null }) {
  const request = task || analyzeRequest({ question: question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const ranking = compareCandidates(Array.isArray(dialectic.candidates) ? dialectic.candidates : []);
  const selected = ranking.find((item) => item.id !== 'bad_hand') || null;
  const contradictions = detectContradictions({ facts, risks, inquiry, evidence, ranking });
  const score = selected?.score || 0;
  const answerLineDistance = 100 - scor;

  let decision = 'recommend';
  if (!selected || score < 60) decision = 'hold_and_clarify';
  else if (score < 80 || contradictions.length || evidence.state !== 'VALID') decision = 'recommend_with_caution';
  if (evidence.state === 'REJECTED' && (facts.confirmed?.length || 0) === 0) decision = 'hold_and_clarify';

  const runnerUp = ranking.filter((item) => item.id !== 'bad_hand' && item.id !== selected?.id)[0] || null;
  const margin = selected && runnerUp ? selected.score - runnerUp.score : null;
  const rationale = selected
    ? `${selected.label}を首位とする。目的適合=${selected.metrics.objectiveFit ?? '-'}、Evidence適合=${selected.metrics.evidenceFit ?? '-'}、Risk制御=${selected.metrics.riskControl ?? '-'}、Constraint適合=${selected.metrics.constraintFit ?? '-'}、Rollback性=${selected.metrics.reversibility ?? '-'}。${runnerUp ? `次点${runnerUp.label}との差=${margin}。` : ''}`
    : '比較可能な候補がない。';

  return {
    pillar: 'compare',
    score,
    answer_line_distance: answerLineDistance,
    score_breakdown: selected ? Object.entries(WEIGHTS).map(([key, weight]) => ({
      key,
      weight,
      raw: selected.metrics[key] ?? 0,
      contribution: Number(((selected.metrics[key] || 0) * weight).toFixed(2))
    })) : [],
    contradictions,
    selected_candidate: selected,
    candidate_ranking: ranking,
    rejected_candidates: ranking.filter((candidate) => candidate.id !== selected?.id).map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      score: candidate.score,
      reason: candidate.id === 'bad_hand'
        ? '意図的悪手のため採用対象外。'
        : `首位との差=${selected ? selected.score - candidate.score : '-'} / failure=${candidate.failure_modes?.[0] || '明示なし'}`
    })),
    uncertainty: {
      evidence_state: evidence.state,
      evidence_quality_score_bp: evidence.quality_score_bp,
      unresolved_fact_count: facts.unconfirmed?.length || 0,
      missing_field_count: inquiry.missing_fields?.length || 0,
      selection_margin: margin
    },
    domain_template: domain.primary ? {
      id: domain.primary.id,
      name: domain.primary.name,
      compare_lens: domain.primary.compare_lens || []
    } : null,
    verdict: {
      decision,
      angle: selected?.angle || multi.recommended || 'balanced',
      reason: rationale,
      objective: request.objective
    }
  };
}

module.exports = { run };
