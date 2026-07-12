"use strict";
const crypto = require("node:crypto");
const { sha256Text } = require("../utils/hash");
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function createEvaluationPacket(input) {
  if (!input || typeof input !== "object") throw new TypeError("input is required");
  if (!input.project_id) throw new TypeError("project_id is required");
  if (!input.artifact?.candidate_id) throw new TypeError("artifact.candidate_id is required");
  if (!input.artifact?.artifact_type) throw new TypeError("artifact.artifact_type is required");
  if (!input.artifact?.content) throw new TypeError("artifact.content is required");
  if (!Array.isArray(input.requirements) || input.requirements.length === 0) throw new TypeError("requirements must be a non-empty array");
  const content = String(input.artifact.content);
  return { schema_version:"astera.quality-completion.request.v1", evaluation_id:input.evaluation_id || id("eval"), project_id:input.project_id, task_id:input.task_id || null, run_id:input.run_id || null, trace_id:input.trace_id || null, target:{ candidate_id:input.artifact.candidate_id, candidate_version:input.artifact.candidate_version || 1, artifact_type:input.artifact.artifact_type, title:input.artifact.title || input.artifact.candidate_id, category:input.artifact.category || input.artifact.artifact_type, tags:input.artifact.tags || [], content, content_hash:sha256Text(content), declared_status:input.artifact.declared_status || "draft" }, requirements:input.requirements, evidence:input.evidence || { repository:[], tests:[], artifacts:[] }, analysis:input.analysis || {}, evaluation_config:{ rubric_version:"quality-completion-rubric.v1", blocking_rule_version:"blocking-rules.v1" } };
}
module.exports = { createEvaluationPacket };
