"use strict";

const crypto = require("node:crypto");
const { stableStringify } = require("../utils/stable-json");
const { loadProfile } = require("./profile-loader");
const { verifyEvidenceRegistry } = require("./evidence-registry-verifier");
const { evaluateMetrics } = require("./metric-evaluator");
const { evaluateGenericBlocking } = require("./blocking-engine");
const { decideGenericJudgment } = require("./judgment-engine");

const REQUEST_SCHEMA_VERSION = "astera.evaluation.request.v2";
const RESULT_SCHEMA_VERSION = "astera.evaluation.result.v2";
const MODULE_VERSION = "2.0.0";

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function finalize(base) {
  return Object.freeze({ ...base, result_hash: sha256(base) });
}

function auditTime(request) {
  return Number.isFinite(Date.parse(request?.evaluation_time || "")) ? request.evaluation_time : null;
}

function invalid(request, errors) {
  return finalize({
    schema_version: RESULT_SCHEMA_VERSION,
    evaluation_id: request?.evaluation_id || null,
    subject_id: request?.subject?.subject_id || null,
    status: "INVALID_INPUT",
    evaluation_complete: false,
    ai_used: false,
    errors,
    judgment: { passed: false, reason: "input validation failed" },
    audit: { module_version: MODULE_VERSION, evaluated_at: auditTime(request) }
  });
}

function failed(request, error) {
  return finalize({
    schema_version: RESULT_SCHEMA_VERSION,
    evaluation_id: request?.evaluation_id || null,
    subject_id: request?.subject?.subject_id || null,
    status: "EVALUATION_FAILED",
    evaluation_complete: false,
    ai_used: false,
    errors: [{ code: error.code || "EVALUATION_FAILED", message: error.message }],
    judgment: { passed: false, reason: "evaluation failed" },
    audit: { module_version: MODULE_VERSION, evaluated_at: auditTime(request) }
  });
}

function validateRequest(request) {
  const errors = [];
  if (!request || typeof request !== "object" || Array.isArray(request)) return [{ code: "TYPE", path: "$", message: "request must be an object" }];
  if (request.schema_version !== REQUEST_SCHEMA_VERSION) errors.push({ code: "UNSUPPORTED_VERSION", path: "schema_version" });
  if (!request.evaluation_id) errors.push({ code: "REQUIRED", path: "evaluation_id" });
  if (!Number.isFinite(Date.parse(request.evaluation_time || ""))) errors.push({ code: "INVALID_DATE_TIME", path: "evaluation_time" });
  if (!request.subject?.subject_id) errors.push({ code: "REQUIRED", path: "subject.subject_id" });
  if (!request.subject?.subject_type) errors.push({ code: "REQUIRED", path: "subject.subject_type" });
  if (!request.profile_id) errors.push({ code: "REQUIRED", path: "profile_id" });
  if (!Array.isArray(request.measurements)) errors.push({ code: "TYPE", path: "measurements", message: "measurements must be an array" });
  if (!request.evidence_registry || typeof request.evidence_registry !== "object" || Array.isArray(request.evidence_registry)) errors.push({ code: "TYPE", path: "evidence_registry" });
  if (!request.evidence_bindings || typeof request.evidence_bindings !== "object" || Array.isArray(request.evidence_bindings)) errors.push({ code: "TYPE", path: "evidence_bindings" });
  return errors;
}

async function evaluateGeneric(request) {
  const inputErrors = validateRequest(request);
  if (inputErrors.length > 0) return invalid(request, inputErrors);
  try {
    const profile = loadProfile(request.profile_id);
    const evidence = verifyEvidenceRegistry(request.evidence_registry, request.evidence_bindings);
    const metrics = evaluateMetrics(profile, request.measurements, evidence);
    const blocking = evaluateGenericBlocking(profile, metrics, evidence);
    const judgment = decideGenericJudgment(profile, metrics, blocking);

    return finalize({
      schema_version: RESULT_SCHEMA_VERSION,
      evaluation_id: request.evaluation_id,
      subject_id: request.subject.subject_id,
      subject_type: request.subject.subject_type,
      subject_version: request.subject.subject_version ?? null,
      profile_id: profile.profile_id,
      status: judgment.status,
      evaluation_complete: true,
      ai_used: false,
      scores: {
        total: metrics.total,
        dimensions: Object.fromEntries(metrics.dimensions.map((item) => [item.dimension_id, item.score]))
      },
      dimensions: metrics.dimensions,
      measurements: {
        count: metrics.measurement_count,
        issues: metrics.issues
      },
      evidence: {
        valid: evidence.valid,
        counts: evidence.counts,
        errors: evidence.errors,
        registry_hash: request.evidence_registry?.registry_hash || null,
        bindings_hash: request.evidence_bindings?.bindings_hash || null
      },
      blocking,
      judgment,
      audit: {
        module_version: MODULE_VERSION,
        profile_schema_version: profile.profile_schema_version,
        profile_id: profile.profile_id,
        evaluation_time: request.evaluation_time,
        project_id: request.project_id ?? null,
        task_id: request.task_id ?? null,
        run_id: request.run_id ?? null,
        trace_id: request.trace_id ?? null,
        evidence_registry_schema_version: request.evidence_registry?.schema_version || null,
        evidence_bindings_schema_version: request.evidence_bindings?.schema_version || null,
        evaluated_at: request.evaluation_time
      }
    });
  } catch (error) {
    return failed(request, error);
  }
}

module.exports = { REQUEST_SCHEMA_VERSION, RESULT_SCHEMA_VERSION, MODULE_VERSION, evaluateGeneric };
