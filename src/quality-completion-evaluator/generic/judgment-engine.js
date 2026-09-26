"use strict";

function decideGenericJudgment(profile, metricEvaluation, blocking) {
  if (blocking.length > 0) {
    return {
      status: "BLOCKED",
      passed: false,
      reason_code: "HARD_BLOCKED",
      reason: `${blocking.length} hard blocking condition(s) detected`,
      blocking_rule_ids: blocking.map((item) => item.block_id).filter(Boolean),
      failed_dimension_ids: []
    };
  }
  const minimumTotal = Number(profile.judgment?.minimum_total_score ?? 0);
  const failedDimensions = metricEvaluation.dimensions.filter((item) => item.score < item.minimum_score);
  if (metricEvaluation.total < minimumTotal || failedDimensions.length > 0) {
    return {
      status: "REVISION_REQUIRED",
      passed: false,
      reason_code: "PROFILE_THRESHOLD_NOT_MET",
      reason: `total=${metricEvaluation.total}, required=${minimumTotal}, failed_dimensions=${failedDimensions.map((item) => item.dimension_id).join(",") || "none"}`,
      blocking_rule_ids: [],
      failed_dimension_ids: failedDimensions.map((item) => item.dimension_id),
      minimum_total_score: minimumTotal
    };
  }
  return {
    status: "PASSED",
    passed: true,
    reason_code: "PROFILE_PASSED",
    reason: `total=${metricEvaluation.total} and all dimension thresholds passed`,
    blocking_rule_ids: [],
    failed_dimension_ids: [],
    minimum_total_score: minimumTotal
  };
}

module.exports = { decideGenericJudgment };
