"use strict";

function buildResult(request, context, qualityResult, completionResult, scores, blocking, judgment) {
  const domainLens = context.domain_lens ? {
    id: context.domain_lens.id,
    name: context.domain_lens.name,
    taxonomy_version: context.domain_lens.taxonomy_version,
    source: context.domain_lens.source,
    enforce: context.domain_lens.enforce,
    path_key: context.domain_lens.path_key,
    path_resolution: context.domain_lens.path_resolution,
    fact_lens: context.domain_lens.fact_lens,
    risk_lens: context.domain_lens.risk_lens,
    multi_lens: context.domain_lens.multi_lens,
    inquiry_lens: context.domain_lens.inquiry_lens,
    compare_lens: context.domain_lens.compare_lens,
    evidence_to_collect: context.domain_lens.evidence_to_collect,
    safety_gate: context.domain_lens.safety_gate,
    assessment: context.domain_lens_assessment
  } : null;
  const result = {
    schema_version: "astera.quality-completion.result.v1",
    evaluation_id: request.evaluation_id,
    candidate_id: request.target.candidate_id,
    candidate_version: request.target.candidate_version ?? 1,
    status: judgment.status,
    evaluation_complete: true,
    scores,
    criteria: { quality: qualityResult.criteria, completion: completionResult.criteria },
    requirements: { ...context.requirements.totals, evaluated: context.requirements.totals.total },
    evidence: context.evidence.counts,
    evidence_details: context.evidence.items,
    domain_lens: domainLens,
    blocking,
    judgment,
    audit: { module_version: "1.0.0", rubric_version: request.evaluation_config.rubric_version, blocking_rule_version: request.evaluation_config.blocking_rule_version, taxonomy_version: domainLens?.taxonomy_version || null, content_hash: request.target.content_hash, evaluated_at: new Date().toISOString() }
  };
  return result;
}

function buildInvalidResult(request, errors) {
  return { schema_version: "astera.quality-completion.result.v1", evaluation_id: request?.evaluation_id || null, candidate_id: request?.target?.candidate_id || null, status: "INVALID_INPUT", evaluation_complete: false, errors, judgment: { passed: false, reason: "入力Schema、必須項目、Version、またはHashに問題がある" }, audit: { module_version: "1.0.0", evaluated_at: new Date().toISOString() } };
}

function buildFailureResult(request, error) {
  return { schema_version: "astera.quality-completion.result.v1", evaluation_id: request?.evaluation_id || null, candidate_id: request?.target?.candidate_id || null, status: "EVALUATION_FAILED", evaluation_complete: false, errors: [{ code: error.code || "EVALUATION_FAILED", message: error.message }], judgment: { passed: false, reason: "採点処理が正常完了していない" }, audit: { module_version: "1.0.0", evaluated_at: new Date().toISOString() } };
}

module.exports = { buildResult, buildInvalidResult, buildFailureResult };
