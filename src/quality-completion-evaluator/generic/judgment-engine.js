 "use strict";

function decideGenericJudgment(profile, metricEvaluation, blocking) {
  if (blocking.length > 0) {
    return { status: "BLOCKED", passed: false, reason: `${blocking.length} hard blocking condition(s) detected` };
  }
  const minimumTotal = Number(profile.judgment?.minimum_total_score ?? 0);
  const failedDimensions = metricEvaluation.dimensions.filter((item) => item.score < item.minimum_score);
  if (metricEvaluation.total < minimumTotal || failedDimensions.length > 0) {
    return {
      status: "REVISION_REQUIRED",
      passed: false,
      reason: `total=${metricEvaluation.total}, required=${minimumTotal}, failed_dimensions=${failedDimensions.map((item) => item.dimension_id).join(",") || "none"}`
    };
  }
  return { status: "PASSED", passed: true, reason: `total=${metricEvaluation.total} and all dimension thresholds passed` };
}

module.exports = { decideGenericJudgment };
