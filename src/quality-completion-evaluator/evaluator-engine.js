"use strict";

const { validateEvaluationRequest, loadArtifactProfile } = require("./input-validator");
const { mapRequirements } = require("./requirement-mapper");
const { verifyEvidence } = require("./evidence-verifier");
const { evaluateQuality } = require("./quality/quality-rule-engine");
const { evaluateCompletion } = require("./completion/completion-rule-engine");
const { calculateScores } = require("./score-calculator");
const { evaluateBlocking } = require("./blocking/blocking-rule-engine");
const { decideAdmission } = require("./kb-admission-gate");
const { buildResult, buildInvalidResult, buildFailureResult } = require("./evaluation-result-builder");

async function evaluate(request) {
  const validation = validateEvaluationRequest(request);
  if (!validation.ok) return buildInvalidResult(request, validation.errors);
  try {
    const profile = loadArtifactProfile(request.target.artifact_type);
    const requirements = mapRequirements(request.requirements, request.target.content);
    const evidence = await verifyEvidence(request, profile);
    const context = { request, profile, requirements, evidence };
    const qualityResult = evaluateQuality(context);
    const completionResult = evaluateCompletion(context);
    const scores = calculateScores(qualityResult, completionResult);
    const blocking = evaluateBlocking(context, qualityResult, completionResult);
    const judgment = decideAdmission({ evaluationComplete: true, scores, blocking, requirements, evidence });
    return buildResult(request, context, qualityResult, completionResult, scores, blocking, judgment);
  } catch (error) {
    return buildFailureResult(request, error);
  }
}

async function evaluateAndPublish(request, kbAdapter) {
  const result = await evaluate(request);
  if (!result.judgment?.kb_eligible) return result;
  if (!kbAdapter || typeof kbAdapter.publish !== "function") return { ...result, status: "KB_ELIGIBLE", publication: { status: "not_requested" } };
  try {
    const publication = await kbAdapter.publish(result.kb_record, { idempotencyKey: result.kb_record.idempotency_key });
    return { ...result, status: "KB_PUBLISHED", publication };
  } catch (error) {
    return { ...result, status: "KB_ELIGIBLE", publication: { status: "failed", code: error.code || "KB_PUBLISH_FAILED", message: error.message } };
  }
}

module.exports = { evaluate, evaluateAndPublish };
