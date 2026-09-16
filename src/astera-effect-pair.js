'use strict';

const {
  baselineMaterial,
  asteraMaterialText,
  evaluateStory,
  tokenOverlap
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

function packet(result) {
  return result?.analysis_task_packet || {};
}

function scoreDimension(dim, story, baselineText, asteraText, result, evaluation) {
  const user = story.user_input || '';
  const ctx = story.context || '';
  const userBlob = norm(`${user}\n${ctx}`);
  const base = norm(baselineText);
  const ast = norm(asteraText);
  const v = evaluation?.violations || {};

  switch (dim) {
    case 'user_intent_preservation':
      return tokenOverlap(ast, user) >= tokenOverlap(base, user) ? 1 : -1;
    case 'constraint_preservation':
      return v.constraint_loss ? -2 : (tokenOverlap(ast, userBlob) >= tokenOverlap(base, userBlob) ? 1 : 0);
    case 'prohibition_preservation':
      return v.constraint_loss ? -2 : 1;
    case 'known_unknown_separation':
      return (evaluation?.astera_scores?.R03_known_vs_unknown ?? 0) > (evaluation?.baseline_scores?.R03_known_vs_unknown ?? 0) ? 1 : 0;
    case 'missing_information_discovery':
      return (evaluation?.astera_scores?.R04_gaps_explicit ?? 0) > 0 ? 1 : 0;
    case 'factual_grounding':
      return v.hallucination || v.false_confirmation ? -2 : 1;
    case 'uncertainty_calibration':
      return v.uncertainty_loss ? -2 : ((evaluation?.astera_scores?.R09_no_false_certainty ?? 0) >= 2 ? 1 : 0);
    case 'risk_discovery':
      return (evaluation?.astera_scores?.R05_risk_discovery ?? 0) > (evaluation?.baseline_scores?.R05_risk_discovery ?? 0) ? 1 : 0;
    case 'opposing_view_coverage':
      return (evaluation?.astera_scores?.R06_counter_view ?? 0) > 0 ? 1 : 0;
    case 'comparison_completeness':
      return (evaluation?.astera_scores?.R07_comparison_axis ?? 0) > (evaluation?.baseline_scores?.R07_comparison_axis ?? 0) ? 1 : 0;
    case 'contradiction_preservation':
      return (evaluation?.astera_scores?.R08_contradiction_kept ?? 0) > 0 ? 1 : 0;
    case 'evidence_traceability':
      return v.unsupported_confirmed ? -2 : ((evaluation?.astera_scores?.R10_evidence_need ?? 0) > 0 ? 1 : 0);
    case 'unsupported_assertion_reduction':
      return v.unsupported_confirmed || v.false_confirmation ? -2 : 1;
    case 'final_decision_overreach_prevention':
      return v.final_decision_violation ? -2 : 1;
    case 'main_ai_actionability':
      return (evaluation?.astera_scores?.R13_ai_usable_structure ?? 0) > (evaluation?.baseline_scores?.R13_ai_usable_structure ?? 0) ? 1 : 0;
    case 'irrelevant_information_increase': {
      const baseLen = base.split(/\s+/).length;
      const astLen = ast.split(/\s+/).length;
      const extra = astLen - baseLen;
      if (extra > 120 && tokenOverlap(ast, user) < tokenOverlap(base, user)) return -1;
      return 0;
    }
    default:
      return 0;
  }
}

function pairedStoryResult(story, out) {
  const baselineText = baselineMaterial(story);
  const asteraText = asteraMaterialText(out);
  const evaluation = evaluateStory(story, out);
  const dimension_scores = {};
  let deltaSum = 0;
  for (const dim of DIMENSIONS) {
    const s = scoreDimension(dim, story, baselineText, asteraText, out?.result || {}, evaluation);
    dimension_scores[dim] = s;
    deltaSum += s;
  }
  let pair_outcome = 'TIE';
  if (deltaSum > 0) pair_outcome = 'WIN';
  else if (deltaSum < 0) pair_outcome = 'LOSS';
  return {
    story_id: story.story_id,
    pair_outcome,
    dimension_scores,
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
    const critical = Boolean(
      v.hallucination || v.constraint_loss || v.false_confirmation || v.unsupported_confirmed
        || v.final_decision_violation || v.uncertainty_loss || v.task_decomposition_failure
    );
    if (critical) {
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
  pairedStoryResult,
  summarizePairs
};
