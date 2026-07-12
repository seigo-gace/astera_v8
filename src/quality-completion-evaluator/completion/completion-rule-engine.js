"use strict";

const { loadJson } = require("../utils/load-config");
const { ratioToFive, roundHalf, clamp, weightedScore } = require("../utils/scoring");
const { hasSection } = require("../utils/text");

function criterion(id, score, weight, reason, evidenceRefs = [], deductions = [], requiredFixes = []) {
  const normalized = roundHalf(clamp(score, 0, 5));
  return {
    criterion_id: id,
    score_0_to_5: normalized,
    weight,
    weighted_score: weightedScore(normalized, weight),
    status: normalized >= 4.75 ? "passed" : "needs_revision",
    reason,
    evidence_refs: evidenceRefs,
    deductions,
    required_fixes: requiredFixes
  };
}

function sectionResult(content, configuredSections, analysisSections = {}) {
  const items = configuredSections.map((section) => {
    const explicit = analysisSections[section.id];
    const present = explicit === true || (explicit !== false && hasSection(content, section.aliases));
    return { id: section.id, present, aliases: section.aliases };
  });
  const present = items.filter((item) => item.present).length;
  return { items, ratio: items.length === 0 ? 1 : present / items.length, missing: items.filter((item) => !item.present) };
}

function requiredSectionScore(sectionCheck) {
  if (sectionCheck.missing.length === 0) return 5;
  return Math.min(3, ratioToFive(sectionCheck.ratio));
}

function evaluateCompletion(context) {
  const rubric = loadJson("completion/completion-rubric.v1.json");
  const weights = Object.fromEntries(rubric.criteria.map((item) => [item.criterion_id, item.weight]));
  const content = context.request.target.content;
  const analysisSections = context.request.analysis?.sections || {};
  const criteria = [];

  const coverageScore = ratioToFive(context.requirements.mandatory_fulfillment_ratio);
  criteria.push(criterion("completion.requirement_coverage", coverageScore, weights["completion.requirement_coverage"], coverageScore === 5 ? "すべての必須要求が充足している" : "必須要求に未達または部分対応がある", context.requirements.items.map((item) => item.requirement_id), coverageScore < 5 ? [{ points: weightedScore(5 - coverageScore, weights["completion.requirement_coverage"]), reason: "必須要求の未達" }] : [], context.requirements.failed_mandatory.map((item) => `${item.requirement_id}を完成させる`)));

  const artifact = sectionResult(content, context.profile.core_sections || [], analysisSections);
  const artifactScore = requiredSectionScore(artifact);
  criteria.push(criterion("completion.artifact_completion", artifactScore, weights["completion.artifact_completion"], artifact.missing.length === 0 ? "成果物種別に必要な中核構成がすべて存在する" : "成果物種別に必要な中核構成が不足している", artifact.items.filter((item) => item.present).map((item) => `section:${item.id}`), artifact.missing.map((item) => ({ points: 0.5, reason: `${item.id}が不足` })), artifact.missing.map((item) => `${item.id}章を追加する`)));

  let verificationScore = 5;
  if (!context.evidence.all_required_valid) verificationScore = 3;
  if (context.evidence.invalid_items.length) verificationScore = Math.min(verificationScore, 2);
  if (context.evidence.failed_tests.length) verificationScore = 0;
  criteria.push(criterion("completion.verification_completion", verificationScore, weights["completion.verification_completion"], verificationScore === 5 ? "成果物種別および宣言状態に必要な証拠がすべて有効" : "必要証拠の不足、不整合、またはTest失敗がある", context.evidence.items.filter((item) => item.status === "VALID").map((item) => item.evidence_id).filter(Boolean), [...context.evidence.missing_required.map((kind) => ({ points: 2, reason: `${kind}証拠が不足` })), ...context.evidence.invalid_items.map((item) => ({ points: 3, reason: item.reason }))], [...context.evidence.missing_required.map((kind) => `${kind}の有効な証拠を追加する`), ...context.evidence.invalid_items.map((item) => `${item.kind}:${item.evidence_id || "unknown"}を再取得・再検証する`)]));

  const operation = sectionResult(content, context.profile.operation_sections || [], analysisSections);
  const operationScore = requiredSectionScore(operation);
  criteria.push(criterion("completion.operation_recovery", operationScore, weights["completion.operation_recovery"], operation.missing.length === 0 ? "運用・障害・復旧に必要な定義が揃っている" : "運用・障害・復旧に必要な定義が不足している", operation.items.filter((item) => item.present).map((item) => `section:${item.id}`), operation.missing.map((item) => ({ points: 0.5, reason: `${item.id}が不足` })), operation.missing.map((item) => `${item.id}章を追加する`)));

  const handoff = sectionResult(content, context.profile.handoff_sections || [], analysisSections);
  const handoffScore = requiredSectionScore(handoff);
  criteria.push(criterion("completion.documentation_handoff", handoffScore, weights["completion.documentation_handoff"], handoff.missing.length === 0 ? "Version・変更履歴・制限・再評価方法が揃っている" : "引継ぎ・再評価に必要な情報が不足している", handoff.items.filter((item) => item.present).map((item) => `section:${item.id}`), handoff.missing.map((item) => ({ points: 0.5, reason: `${item.id}が不足` })), handoff.missing.map((item) => `${item.id}章を追加する`)));

  return { rubric_version: rubric.rubric_version, criteria };
}

module.exports = { evaluateCompletion };
