"use strict";

const { validateEvaluationRequest, loadArtifactProfile } = require("./input-validator");
const { mapRequirements } = require("./requirement-mapper");
const { verifyEvidence } = require("./evidence-verifier");
const { resolveDomainLens, assessDomainLens } = require("./domain-lens-resolver");
const { evaluateQuality } = require("./quality/quality-rule-engine");
const { evaluateCompletion } = require("./completion/completion-rule-engine");
const { calculateScores } = require("./score-calculator");
const { evaluateBlocking } = require("./blocking/blocking-rule-engine");
const { decideEvaluationJudgment } = require("./evaluation-judgment");
const { buildResult, buildInvalidResult, buildFailureResult } = require("./evaluation-result-builder");

async function evaluate(request) {
  const validation = validateEvaluationRequest(request);
  if (!validation.ok) return buildInvalidResult(request, validation.errors);
  try {
    const profile = loadArtifactProfile(request.target.artifact_type);
    const requirements = mapRequirements(request.requirements, request.target.content);
    const evidence = await verifyEvidence(request, profile);
    const domainLens = resolveDomainLens(request);
    const domainLensAssessment = assessDomainLens(request, domainLens, evidence);
    const context = { request, profile, requirements, evidence, domain_lens: domainLens, domain_lens_assessment: domainLensAssessment };
    const qualityResult = evaluateQuality(context);
    const completionResult = evaluateCompletion(context);
    const scores = calculateScores(qualityResult, completionResult);
    const blocking = evaluateBlocking(context, qualityResult, completionResult);
    const judgment = decideEvaluationJudgment({ evaluationComplete: true, scores, blocking, requirements, evidence });
    return buildResult(request, context, qualityResult, completionResult, scores, blocking, judgment);
  } catch (error) {
    return buildFailureResult(request, error);
  }
}

module.exports = { evaluate };
