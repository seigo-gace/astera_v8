"use strict";

function compare(operator, actual, expected) {
  if (operator === "TRUE") return actual === true || actual === 1;
  if (operator === "FALSE") return actual === false || actual === 0;
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(e)) return false;
  if (operator === "GT") return a > e;
  if (operator === "GTE") return a >= e;
  if (operator === "LT") return a < e;
  if (operator === "LTE") return a <= e;
  if (operator === "EQ") return a === e;
  if (operator === "NE") return a !== e;
  return false;
}

function block(blockId, category, reason, evidenceRefs = [], details = {}) {
  return { block_id: blockId, category, severity: "critical", reason, evidence_refs: evidenceRefs, ...details };
}

function evaluateGenericBlocking(profile, metricEvaluation, evidenceVerification) {
  const blocks = [];

  if (!evidenceVerification.valid) {
    blocks.push(block(
      "EVAL-HB-001",
      "evidence_integrity_failure",
      "Evidence Registry / Binding integrity verification failed",
      [],
      { errors: evidenceVerification.errors }
    ));
  }

  const invalidRefIssues = metricEvaluation.issues.filter((item) => item.code === "METRIC_EVIDENCE_REF_INVALID");
  if (invalidRefIssues.length > 0) {
    blocks.push(block("EVAL-HB-002", "invalid_evidence_reference", "Measurement references unknown Evidence/Binding IDs", invalidRefIssues.map((item) => item.evidence_ref)));
  }

  const missing = metricEvaluation.issues.filter((item) => item.code === "REQUIRED_METRIC_MISSING" || item.code === "METRIC_EVIDENCE_MISSING");
  if (missing.length > 0) {
    blocks.push(block("EVAL-HB-003", "required_measurement_incomplete", "Required measurements or their evidence are missing", [], { issues: missing }));
  }

  const integrityCodes = new Set([
    "MEASUREMENT_INVALID",
    "MEASUREMENT_ID_REQUIRED",
    "MEASUREMENT_ID_DUPLICATE",
    "MEASUREMENT_METRIC_ID_REQUIRED",
    "MEASUREMENT_METRIC_DUPLICATE",
    "MEASUREMENT_VALUE_INVALID",
    "MEASUREMENT_PROVENANCE_INVALID",
    "MEASUREMENT_EVIDENCE_REF_DUPLICATE",
    "MEASUREMENT_HASH_MISMATCH",
    "UNDECLARED_METRIC",
    "METRIC_UNIT_MISMATCH"
  ]);
  const measurementIntegrity = metricEvaluation.issues.filter((item) => integrityCodes.has(item.code));
  if (measurementIntegrity.length > 0) {
    blocks.push(block("EVAL-HB-004", "measurement_integrity_failure", "Measurement integrity or profile contract verification failed", [], { issues: measurementIntegrity }));
  }

  for (const rule of Array.isArray(profile.hard_blocks) ? profile.hard_blocks : []) {
    const input = metricEvaluation.measurement_input_map.get(rule.metric_id);
    if (!input) {
      if (rule.required === true) blocks.push(block(rule.block_id, rule.category || "hard_gate_metric_missing", rule.reason || `${rule.metric_id} is required`, [], { metric_id: rule.metric_id }));
      continue;
    }
    const refs = Array.isArray(input.evidence_refs) ? input.evidence_refs.map(String).filter(Boolean) : [];
    if (rule.evidence_required !== false && refs.length === 0) {
      blocks.push(block("EVAL-HB-005", "hard_gate_evidence_missing", `Hard gate measurement ${rule.metric_id} has no evidence`, [], { metric_id: rule.metric_id }));
    }
    if (compare(rule.operator, input.value, rule.value)) {
      blocks.push(block(
        rule.block_id,
        rule.category || "profile_hard_gate",
        rule.reason || `${rule.metric_id} triggered ${rule.operator}`,
        refs,
        { metric_id: rule.metric_id, actual: input.value, operator: rule.operator, threshold: rule.value ?? null }
      ));
    }
  }

  const unique = [];
  const seen = new Set();
  for (const item of blocks) {
    const key = `${item.block_id}:${item.category}:${item.metric_id || ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  return unique;
}

module.exports = { compare, evaluateGenericBlocking };
