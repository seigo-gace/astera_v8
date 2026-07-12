"use strict";
function decideAdmission({ evaluationComplete, scores, blocking, requirements, evidence }) {
  if (!evaluationComplete) return { status:"EVALUATION_FAILED", kb_eligible:false, reason:"採点処理が正常完了していない" };
  if (blocking.length > 0) return { status:"BLOCKED", kb_eligible:false, reason:`${blocking.length}件の重大阻止条件が存在する` };
  const eligible = scores.quality >= 95 && scores.completion >= 95 && requirements.totals.mandatory_failures === 0 && evidence.counts.invalid === 0;
  return eligible ? { status:"KB_ELIGIBLE", kb_eligible:true, reason:"品質・完成度がともに95点以上で、重大欠陥・未達要求・証拠不整合が存在しない" } : { status:"REVISION_REQUIRED", kb_eligible:false, reason:`品質${scores.quality}点、完成度${scores.completion}点。両方95点以上が必要` };
}
module.exports = { decideAdmission };
