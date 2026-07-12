"use strict";

const { sha256Text } = require("./utils/hash");

function idempotencyKey(request) {
  return sha256Text([request.project_id, request.target.candidate_id, request.target.candidate_version ?? 1, request.target.content_hash, request.evaluation_config.rubric_version].join("|"));
}

function buildKbRecord(request, scores, evaluation) {
  return {
    schema_version: "astera.kb-record.v1",
    idempotency_key: idempotencyKey(request),
    project_id: request.project_id,
    candidate_id: request.target.candidate_id,
    candidate_version: request.target.candidate_version ?? 1,
    title: request.target.title || request.target.candidate_id,
    artifact_type: request.target.artifact_type,
    category: request.target.category || request.target.artifact_type,
    body: request.target.content,
    tags: Array.isArray(request.target.tags) ? request.target.tags : ["ASTERA", "quality", "completion"],
    scores,
    source: { run_id: request.run_id || null, task_id: request.task_id || null, trace_id: request.trace_id || null, content_hash: request.target.content_hash },
    versions: { module: "1.0.0", rubric: request.evaluation_config.rubric_version, blocking_rules: request.evaluation_config.blocking_rule_version },
    evaluation_id: request.evaluation_id,
    status: "active",
    evaluation_summary: { blocking_count: evaluation.blocking.length, minimum_score: scores.minimum }
  };
}

function buildResult(request, context, qualityResult, completionResult, scores, blocking, judgment) {
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
    blocking,
    judgment,
    audit: { module_version: "1.0.0", rubric_version: request.evaluation_config.rubric_version, blocking_rule_version: request.evaluation_config.blocking_rule_version, content_hash: request.target.content_hash, evaluated_at: new Date().toISOString() }
  };
  if (judgment.kb_eligible) result.kb_record = buildKbRecord(request, scores, result);
  return result;
}

function buildInvalidResult(request, errors) {
  return { schema_version: "astera.quality-completion.result.v1", evaluation_id: request?.evaluation_id || null, candidate_id: request?.target?.candidate_id || null, status: "INVALID_INPUT", evaluation_complete: false, errors, judgment: { kb_eligible: false, reason: "入力Schema、必須項目、Version、またはHashに問題がある" }, audit: { module_version: "1.0.0", evaluated_at: new Date().toISOString() } };
}

function buildFailureResult(request, error) {
  return { schema_version: "astera.quality-completion.result.v1", evaluation_id: request?.evaluation_id || null, candidate_id: request?.target?.candidate_id || null, status: "EVALUATION_FAILED", evaluation_complete: false, errors: [{ code: error.code || "EVALUATION_FAILED", message: error.message }], judgment: { kb_eligible: false, reason: "採点処理が正常完了していない" }, audit: { module_version: "1.0.0", evaluated_at: new Date().toISOString() } };
}

module.exports = { buildResult, buildInvalidResult, buildFailureResult, buildKbRecord, idempotencyKey };
