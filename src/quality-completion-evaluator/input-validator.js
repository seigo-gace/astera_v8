"use strict";

const { sha256Text, isSha256 } = require("./utils/hash");
const { loadJson } = require("./utils/load-config");
const { validateDeclaredDomainLens } = require("./domain-lens-resolver");
const SUPPORTED_TYPES = new Set(["design","implementation","test_result","operation_document","research","incident_resolution","knowledge_document","configuration","other"]);

function validateEvaluationRequest(request) {
  const errors = [];
  if (!request || typeof request !== "object" || Array.isArray(request)) return { ok: false, errors: [{ path: "$", code: "TYPE", message: "request must be an object" }] };
  const required = [["schema_version",request.schema_version],["evaluation_id",request.evaluation_id],["project_id",request.project_id],["target",request.target],["target.candidate_id",request.target?.candidate_id],["target.artifact_type",request.target?.artifact_type],["target.content",request.target?.content],["target.content_hash",request.target?.content_hash],["requirements",request.requirements],["evaluation_config.rubric_version",request.evaluation_config?.rubric_version],["evaluation_config.blocking_rule_version",request.evaluation_config?.blocking_rule_version]];
  for (const [path,value] of required) if (value === undefined || value === null || value === "") errors.push({ path, code: "REQUIRED", message: `${path} is required` });
  if (request.schema_version !== "astera.quality-completion.request.v1") errors.push({ path: "schema_version", code: "UNSUPPORTED_VERSION", message: "unsupported request schema version" });
  if (!SUPPORTED_TYPES.has(request.target?.artifact_type)) errors.push({ path: "target.artifact_type", code: "UNSUPPORTED_ARTIFACT_TYPE", message: "unsupported artifact type" });
  if (!Array.isArray(request.requirements) || request.requirements.length === 0) errors.push({ path: "requirements", code: "REQUIRED_ARRAY", message: "requirements must be a non-empty array" });
  else request.requirements.forEach((item,index) => { if (!item?.requirement_id || !item?.text || typeof item.mandatory !== "boolean") errors.push({ path: `requirements[${index}]`, code: "INVALID_REQUIREMENT", message: "requirement_id, text, mandatory are required" }); });
  if (!isSha256(request.target?.content_hash)) errors.push({ path: "target.content_hash", code: "INVALID_HASH_FORMAT", message: "content_hash must be sha256:<64 hex>" });
  else if (sha256Text(request.target.content) !== request.target.content_hash) errors.push({ path: "target.content_hash", code: "CONTENT_HASH_MISMATCH", message: "target content hash does not match content" });
  if (request.evaluation_config?.rubric_version !== "quality-completion-rubric.v1") errors.push({ path: "evaluation_config.rubric_version", code: "UNSUPPORTED_RUBRIC", message: "rubric version must be quality-completion-rubric.v1" });
  if (request.evaluation_config?.blocking_rule_version !== "blocking-rules.v1") errors.push({ path: "evaluation_config.blocking_rule_version", code: "UNSUPPORTED_BLOCKING_RULES", message: "blocking rule version must be blocking-rules.v1" });
  errors.push(...validateDeclaredDomainLens(request.domain_lens));
  if (errors.length === 0) {
    try {
      const quality = loadJson("quality/quality-rubric.v1.json");
      const completion = loadJson("completion/completion-rubric.v1.json");
      if (quality.criteria.reduce((s,i)=>s+i.weight,0) !== 100 || completion.criteria.reduce((s,i)=>s+i.weight,0) !== 100) errors.push({ path: "rubric", code: "INVALID_WEIGHT_TOTAL", message: "rubric weights must total 100" });
    } catch (error) { errors.push({ path: "rubric", code: "RUBRIC_LOAD_FAILED", message: error.message }); }
  }
  return { ok: errors.length === 0, errors };
}

function loadArtifactProfile(artifactType) {
  const profileFile = { design:"profiles/design.profile.v1.json", implementation:"profiles/implementation.profile.v1.json", test_result:"profiles/test.profile.v1.json", operation_document:"profiles/operation.profile.v1.json", research:"profiles/research.profile.v1.json", incident_resolution:"profiles/incident-resolution.profile.v1.json", knowledge_document:"profiles/knowledge.profile.v1.json", configuration:"profiles/configuration.profile.v1.json", other:"profiles/other.profile.v1.json" }[artifactType];
  return loadJson(profileFile);
}
module.exports = { validateEvaluationRequest, loadArtifactProfile, SUPPORTED_TYPES };
