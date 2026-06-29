'use strict';

function detectContradictions({ facts = {}, risks = {}, inquiry = {}, dialectic = {} }) {
  const contradictions = [];
  if ((facts.confirmed?.length || 0) === 0 && (facts.unconfirmed?.length || 0) >= 3) {
    contradictions.push({ key: 'fact_gap', note: '確認候補が少なく、未確認情報が多い。' });
  }
  if ((risks.risk_count || 0) >= 2 && inquiry.problem_health?.healthy) {
    contradictions.push({ key: 'healthy_but_risky', note: '問いは成立しているが、運用・公開リスクが高い。' });
  }
  const selected = dialectic.selected;
  if (selected && selected.id === 'bad_hand') {
    contradictions.push({ key: 'bad_hand_selected', note: '悪手案が最高点になっている。採点ルールを要確認。' });
  }
  return contradictions;
}

async function run({ question = '', mood = {}, facts = {}, risks = {}, multi = {}, inquiry = {}, dialectic = {} }) {
  const deductions = [];
  const riskPenalty = (risks.risk_count || 0) * 10;
  if (riskPenalty) deductions.push({ key: 'risk', points: riskPenalty, why_bad: '検出リスク数に比例して減点。' });
  const unconfirmedPenalty = (facts.unconfirmed?.length || 0) * 6;
  if (unconfirmedPenalty) deductions.push({ key: 'unconfirmed', points: unconfirmedPenalty, why_bad: '未確認情報が多いほど判断の線が遠くなる。' });
  if (inquiry.problem_health && !inquiry.problem_health.healthy) deductions.push({ key: 'question_health', points: 15, why_bad: '問いの前提・成功条件が不足。' });
  if (mood.score < 0) deductions.push({ key: 'mood', points: Math.abs(mood.score) * 5, why_bad: '焦り・不調時は判断ミスが増える前提で減点。' });

  const dialecticSelected = dialectic.selected || null;
  if (dialecticSelected && dialecticSelected.score < 70) {
    deductions.push({ key: 'dialectic_weak_best', points: 10, why_bad: '多重案競争の最高案でも70点未満。前提の追加確認が必要。' });
  }

  const score = Math.max(0, 100 - deductions.reduce((sum, item) => sum + item.points, 0));
  const answerLineDistance = 100 - score;
  let decision = 'recommend';
  if (score < 60) decision = 'hold_and_clarify';
  else if (score < 80) decision = 'recommend_with_caution';

  const contradictions = detectContradictions({ facts, risks, inquiry, dialectic });
  if (contradictions.length && decision === 'recommend') decision = 'recommend_with_caution';

  return {
    pillar: 'compare',
    score,
    answer_line_distance: answerLineDistance,
    score_breakdown: deductions,
    contradictions,
    selected_candidate: dialecticSelected ? {
      id: dialecticSelected.id,
      label: dialecticSelected.label,
      angle: dialecticSelected.angle,
      score: dialecticSelected.score,
      answer_line_distance: dialecticSelected.answer_line_distance
    } : null,
    candidate_ranking: Array.isArray(dialectic.candidates)
      ? dialectic.candidates.map((c) => ({ id: c.id, label: c.label, angle: c.angle, score: c.score, answer_line_distance: c.answer_line_distance }))
      : [],
    verdict: {
      decision,
      angle: dialecticSelected?.angle || multi.recommended || 'balanced',
      reason: `原点100からの減点方式。answer線距離=${answerLineDistance}。Hyperion候補=${dialecticSelected?.label || 'なし'}`
    }
  };
}

module.exports = { run };
