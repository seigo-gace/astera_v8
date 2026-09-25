"use strict";

const crypto = require("node:crypto");
const { stableStringify } = require("../utils/stable-json");
const { loadProfile } = require("./profile-loader");
const { verifyEvidenceRegistry } = require("./evidence-registry-verifier");
const { buildEvidenceRegistryFromSearchResult } = require("./evidence-registry-builder");
const EvidenceSearchClient = require("./evidence-search-client");
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

  const searchMode = request.evidence_search && typeof request.evidence_search === "object" && !Array.isArray(request.evidence_search);
  const registryPresent = request.evidence_registry !== undefined;
  const bindingsPresent = request.evidence_bindings !== undefined;
  const providedMode = registryPresent || bindingsPresent;

  if (searchMode && providedMode) errors.push({ code: "EVIDENCE_MODE_CONFLICT", path: "evidence_search" });
  if (!searchMode && !providedMode) errors.push({ code: "EVIDENCE_MODE_REQUIRED", path: "evidence_search" });
  if (searchMode && (!request.evidence_search.request || typeof request.evidence_search.request !== "object" || Array.isArray(request.evidence_search.request))) {
    errors.push({ code: "TYPE", path: "evidence_search.request", message: "evidence_search.request must be an object" });
  }
  if (providedMode) {
    if (!request.evidence_registry || typeof request.evidence_registry !== "object" || Array.isArray(request.evidence_registry)) errors.push({ code: "TYPE", path: "evidence_registry" });
    if (!request.evidence_bindings || typeof request.evidence_bindings !== "object" || Array.isArray(request.evidence_bindings)) errors.push({ code: "TYPE", path: "evidence_bindings" });
  }
  return errors;
}

function validateSearchResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    const error = new Error("evidence search API returned an invalid result object");
    error.code = "EVIDENCE_API_CONTRACT_INVALID";
    throw error;
  }
  if (!Array.isArray(result.evidence) || !result.query_execution || typeof result.query_execution !== "object") {
    const error = new Error("evidence search API result is missing evidence/query_execution");
    error.code = "EVIDENCE_API_CONTRACT_INVALID";
    throw error;
  }
  if (result.ai_used === true) {
    const error = new Error("AI-produced evidence search result is not accepted");
    error.code = "EVIDENCE_API_AI_RESULT_FORBIDDEN";
    throw error;
  }
  return result;
}

async function resolveEvidence(request, options = {}) {
  if (request.evidence_search) {
    const client = options.evidenceSearchClient || new EvidenceSearchClient(options.evidenceSearchOptions || {});
    const searchRequest = { ...request.evidence_search.request };
    const derivedRequestId = `eval-${sha256(request.evaluation_id).slice(0, 24)}`;
    if (!searchRequest.request_id) searchRequest.request_id = derivedRequestId;
    if (!searchRequest.caller_id) searchRequest.caller_id = "evaluation-verification-engine";
    const searchResult = validateSearchResult(await client.search(searchRequest, {
      callerId: searchRequest.caller_id,
      requestId: searchRequest.request_id,
      signal: options.signal || null
    }));
    const built = buildEvidenceRegistryFromSearchResult(searchResult);
    return {
      source: "EVIDENCE_SEARCH_API",
      registry: built.registry,
      bindings: built.bindings,
      search: {
        request_id: searchResult.request_id || searchRequest.request_id,
        status: searchResult.status || null,
        result_hash: searchResult.result_hash || null,
        query_plan_hash: searchResult.query_plan_hash || null,
        ai_used: searchResult.ai_used === true
      }
    };
  }

  return {
    source: "PROVIDED",
    registry: request.evidence_registry,
    bindings: request.evidence_bindings,
    search: null
  };
}

async function evaluateGeneric(request, options = {}) {
  const inputErrors = validateRequest(request);
  if (inputErrors.length > 0) return invalid(request, inputErrors);
  try {
    const profile = loadProfile(request.profile_id);
    const resolvedEvidence = await resolveEvidence(request, options);
    const evidence = verifyEvidenceRegistry(resolvedEvidence.registry, resolvedEvidence.bindings);
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
        source: resolvedEvidence.source,
        valid: evidence.valid,
        counts: evidence.counts,
        errors: evidence.errors,
        registry: resolvedEvidence.registry,
        bindings: resolvedEvidence.bindings,
        registry_hash: resolvedEvidence.registry?.registry_hash || null,
        bindings_hash: resolvedEvidence.bindings?.bindings_hash || null,
        search: resolvedEvidence.search
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
        evidence_source: resolvedEvidence.source,
        evidence_registry_schema_version: resolvedEvidence.registry?.schema_version || null,
        evidence_bindings_schema_version: resolvedEvidence.bindings?.schema_version || null,
        evidence_search_status: resolvedEvidence.search?.status || null,
        evidence_search_result_hash: resolvedEvidence.search?.result_hash || null,
        evaluated_at: request.evaluation_time
      }
    });
  } catch (error) {
    return failed(request, error);
  }
}

module.exports = { REQUEST_SCHEMA_VERSION, RESULT_SCHEMA_VERSION, MODULE_VERSION, evaluateGeneric, resolveEvidence };
