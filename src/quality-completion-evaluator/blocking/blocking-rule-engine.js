"use strict";

const { detectSecrets } = require("../utils/text");

function block(blockId, category, issue, location, requiredFix, evidenceRefs = []) {
  return { block_id: blockId, category, severity: "critical", issue, location, required_fix: requiredFix, evidence_refs: evidenceRefs };
}

function evaluateBlocking(context, qualityResult, completionResult) {
  const blocks = [];
  const analysis = context.request.analysis || {};

  if (context.requirements.totals.mandatory_failures > 0) {
    blocks.push(block("KB-HB-001", "mandatory_requirement_unfulfilled", "必須Requirementが未対応または部分対応", "requirements", "未達Requirementを完成させ、対応位置または証拠を明示する", context.requirements.failed_mandatory.map((item) => item.requirement_id)));
  }
  if (analysis.root_instruction_conflict === true) {
    blocks.push(block("KB-HB-002", "root_instruction_conflict", "ユーザー指示または固定仕様との根本矛盾", "analysis.root_instruction_conflict", "根本矛盾を解消する"));
  }
  if (context.evidence.claims_complete && context.evidence.missing_required.length > 0) {
    blocks.push(block("KB-HB-003", "unsupported_completion_claim", "完了宣言に必要な証拠が不足", "target.declared_status", `不足証拠を追加する: ${context.evidence.missing_required.join(", ")}`));
  }
  for (const invalid of context.evidence.invalid_items) {
    blocks.push(block("KB-HB-004", "evidence_integrity_failure", invalid.reason || "Evidence不整合", `evidence.${invalid.kind}`, "対象Candidateと一致する証拠を再取得する", [invalid.evidence_id].filter(Boolean)));
  }
  const criticalTechnical = (analysis.technical_checks || []).filter((item) => item.status !== "passed" && item.severity === "critical");
  for (const item of criticalTechnical) {
    blocks.push(block("KB-HB-005", "critical_technical_error", item.message || item.id || "重大な技術誤り", "analysis.technical_checks", item.required_fix || "重大な技術誤りを修正する", item.evidence_refs || []));
  }
  const secrets = detectSecrets(context.request.target.content);
  if (secrets.length > 0) {
    blocks.push(block("KB-HB-006", "secret_exposure", "Secret、Token、Password、秘密鍵に該当する情報を検出", "target.content", "秘密情報を削除し、参照IDまたは安全なSecret管理へ置換する"));
    blocks.push(block("KB-HB-015", "kb_prohibited_information", "KB掲載禁止情報が含まれる", "target.content", "KB掲載禁止情報を除外する"));
  }
  if (analysis.purpose_mismatch === true) {
    blocks.push(block("KB-HB-007", "purpose_mismatch", "成果物が本来の目的と異なる", "analysis.purpose_mismatch", "要求された目的へ成果物を戻す"));
  }
  const boundaryViolations = Array.isArray(analysis.boundary_violations) ? analysis.boundary_violations : [];
  for (const item of boundaryViolations) {
    const id = item.type === "fixed_spec_change" ? "KB-HB-009" : "KB-HB-002";
    blocks.push(block(id, item.type || "boundary_violation", item.message || "責任境界または固定仕様への違反", "analysis.boundary_violations", item.required_fix || "境界違反を解消する", item.evidence_refs || []));
  }
  if (context.evidence.failed_tests.length > 0 && context.evidence.claims_complete) {
    blocks.push(block("KB-HB-011", "failed_test_with_completion_claim", "Test失敗状態で完成宣言している", "evidence.tests", "失敗原因を修正して同一Artifactを再Testする", context.evidence.failed_tests.map((item) => item.evidence_id)));
  }
  if (context.domain_lens?.enforce === true && context.domain_lens_assessment?.complete !== true) {
    const assessment = context.domain_lens_assessment;
    const missing = assessment.missing.map((item) => `${item.lens_type}:${item.lens_item}`);
    const failed = assessment.failed.map((item) => `${item.lens_type}:${item.lens_item}`);
    blocks.push(block(
      "KB-HB-016",
      "domain_lens_check_incomplete",
      `${context.domain_lens.id} Lens固有のRisk・Evidence確認が未完了`,
      "analysis.domain_checks",
      `不足または失敗したLens確認をEvidenceへ接続する: ${[...missing, ...failed].join(", ")}`,
      assessment.verified.flatMap((item) => item.evidence_refs || [])
    ));
  }
  const expectedQuality = 5;
  const expectedCompletion = 5;
  if (qualityResult.criteria.length !== expectedQuality || completionResult.criteria.length !== expectedCompletion) {
    blocks.push(block("KB-HB-012", "criterion_not_evaluated", "必須採点Criterionが未評価", "criteria", "全必須Criterionを評価する"));
  }

  const unique = [];
  const seen = new Set();
  for (const item of blocks) {
    const key = `${item.block_id}:${item.issue}:${item.location}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

module.exports = { evaluateBlocking };
