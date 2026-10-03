"use strict";

const crypto = require("node:crypto");
const { stableStringify } = require("../utils/stable-json");
const { validReference, referencesForClaims } = require("./evidence-registry-verifier");

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeMetricScore(definition, value) {
  if (definition.direction === "BOOLEAN_PASS") return value === true || value === 1 ? 100 : 0;
  const n = numeric(value);
  if (n === null) return 0;
  const target = Number(definition.target);
  if (definition.direction === "HIGHER_BETTER") {
    const floor = Number.isFinite(Number(definition.floor)) ? Number(definition.floor) : 0;
    if (target === floor) return n >= target ? 100 : 0;
    return clamp(((n - floor) / (target - floor)) * 100);
  }
  const ceiling = Number.isFinite(Number(definition.ceiling)) ? Number(definition.ceiling) : target === 0 ? 100 : target * 2;
  if (n <= target) return 100;
  if (ceiling === target) return 0;
  return clamp(((ceiling - n) / (ceiling - target)) * 100);
}

function declaredMetricIds(profile) {
  const ids = new Set();
  for (const dimension of profile.dimensions || []) for (const metric of dimension.metrics || []) ids.add(String(metric.metric_id));
  for (const rule of profile.hard_blocks || []) ids.add(String(rule.metric_id));
  return ids;
}

function verifyMeasurements(profile, measurements, evidenceVerification) {
  const inputMap = new Map();
  const effectiveRefsByMetric = new Map();
  const measurementIds = new Set();
  const invalidMetricIds = new Set();
  const issues = [];
  const allowed = declaredMetricIds(profile);

  for (const [index, item] of (Array.isArray(measurements) ? measurements : []).entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ code: "MEASUREMENT_INVALID", index });
      continue;
    }
    const measurementId = String(item.measurement_id || "").trim();
    const metricId = String(item.metric_id || "").trim();
    if (!measurementId) issues.push({ code: "MEASUREMENT_ID_REQUIRED", index });
    else if (measurementIds.has(measurementId)) issues.push({ code: "MEASUREMENT_ID_DUPLICATE", measurement_id: measurementId });
    else measurementIds.add(measurementId);

    if (!metricId) {
      issues.push({ code: "MEASUREMENT_METRIC_ID_REQUIRED", index });
      continue;
    }
    if (!allowed.has(metricId)) {
      issues.push({ code: "UNDECLARED_METRIC", metric_id: metricId });
      invalidMetricIds.add(metricId);
    }
    if (inputMap.has(metricId)) {
      issues.push({ code: "MEASUREMENT_METRIC_DUPLICATE", metric_id: metricId });
      invalidMetricIds.add(metricId);
      continue;
    }

    if (!(["number", "boolean"].includes(typeof item.value)) || (typeof item.value === "number" && !Number.isFinite(item.value))) {
      issues.push({ code: "MEASUREMENT_VALUE_INVALID", metric_id: metricId });
      invalidMetricIds.add(metricId);
    }
    if (!item.provenance || typeof item.provenance !== "object" || Array.isArray(item.provenance) || !String(item.provenance.collector_id || "").trim() || !Number.isFinite(Date.parse(item.provenance.collected_at || ""))) {
      issues.push({ code: "MEASUREMENT_PROVENANCE_INVALID", metric_id: metricId });
      invalidMetricIds.add(metricId);
    }

    const directRefs = Array.isArray(item.evidence_refs) ? item.evidence_refs.map(String).filter(Boolean) : [];
    const claimRefs = Array.isArray(item.evidence_claim_refs) ? item.evidence_claim_refs.map(String).filter(Boolean) : [];
    if (new Set(directRefs).size !== directRefs.length) {
      issues.push({ code: "MEASUREMENT_EVIDENCE_REF_DUPLICATE", metric_id: metricId });
      invalidMetricIds.add(metricId);
    }
    if (new Set(claimRefs).size !== claimRefs.length) {
      issues.push({ code: "MEASUREMENT_EVIDENCE_CLAIM_REF_DUPLICATE", metric_id: metricId });
      invalidMetricIds.add(metricId);
    }
    for (const ref of directRefs) {
      if (!validReference(ref, evidenceVerification)) {
        issues.push({ code: "METRIC_EVIDENCE_REF_INVALID", metric_id: metricId, evidence_ref: ref });
        invalidMetricIds.add(metricId);
      }
    }
    const resolved = referencesForClaims(claimRefs, evidenceVerification);
    for (const claimId of resolved.missing) {
      issues.push({ code: "METRIC_EVIDENCE_CLAIM_UNRESOLVED", metric_id: metricId, claim_id: claimId });
      invalidMetricIds.add(metricId);
    }
    const effectiveRefs = [...new Set([...directRefs, ...resolved.refs])].sort();
    effectiveRefsByMetric.set(metricId, effectiveRefs);

    const { measurement_hash: expectedHash, ...base } = item;
    if (!expectedHash || !/^[a-f0-9]{64}$/i.test(String(expectedHash)) || expectedHash !== sha256(base)) {
      issues.push({ code: "MEASUREMENT_HASH_MISMATCH", metric_id: metricId, measurement_id: measurementId || null });
      invalidMetricIds.add(metricId);
    }
    inputMap.set(metricId, item);
  }

  return { inputMap, effectiveRefsByMetric, measurementIds, invalidMetricIds, issues };
}

function evaluateMetrics(profile, measurements, evidenceVerification) {
  const verified = verifyMeasurements(profile, measurements, evidenceVerification);
  const inputMap = verified.inputMap;
  const dimensions = [];
  const issues = [...verified.issues];

  for (const dimension of profile.dimensions) {
    const evaluated = [];
    for (const definition of dimension.metrics) {
      const input = inputMap.get(definition.metric_id);
      const refs = verified.effectiveRefsByMetric.get(definition.metric_id) || [];
      const required = definition.required !== false;
      const evidenceRequired = definition.evidence_required !== false;
      const missing = !input;
      const missingEvidence = evidenceRequired && refs.length === 0;
      const unitMismatch = Boolean(definition.unit) && String(input?.unit || "") !== String(definition.unit);
      const invalidInput = verified.invalidMetricIds.has(definition.metric_id) || unitMismatch;
      const rawScore = missing || missingEvidence || invalidInput ? 0 : normalizeMetricScore(definition, input.value);
      const score = Math.round(rawScore * 100) / 100;
      const weighted = score * (Number(definition.weight) / 100);

      if (missing && required) issues.push({ code: "REQUIRED_METRIC_MISSING", metric_id: definition.metric_id });
      if (missingEvidence) issues.push({ code: "METRIC_EVIDENCE_MISSING", metric_id: definition.metric_id });
      if (unitMismatch) issues.push({ code: "METRIC_UNIT_MISMATCH", metric_id: definition.metric_id, expected: definition.unit, actual: input?.unit ?? null });

      evaluated.push({
        metric_id: definition.metric_id,
        measurement_id: input?.measurement_id || null,
        value: input?.value ?? null,
        unit: input?.unit || definition.unit || null,
        direction: definition.direction,
        target: definition.target ?? null,
        weight: Number(definition.weight),
        score,
        weighted_score: Math.round(weighted * 100) / 100,
        evidence_refs: refs,
        status: score >= Number(definition.minimum_score ?? 100) ? "PASSED" : "BELOW_TARGET"
      });
    }
    const score = Math.round(evaluated.reduce((sum, item) => sum + item.weighted_score, 0) * 100) / 100;
    dimensions.push({
      dimension_id: dimension.dimension_id,
      weight: Number(dimension.weight),
      minimum_score: Number(dimension.minimum_score ?? 0),
      score,
      metrics: evaluated
    });
  }

  const total = Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score * (dimension.weight / 100), 0) * 100) / 100;
  return {
    dimensions,
    total,
    issues,
    measurement_input_map: inputMap,
    effective_refs_by_metric: verified.effectiveRefsByMetric,
    measurement_count: verified.measurementIds.size,
    invalid_metric_ids: verified.invalidMetricIds
  };
}

module.exports = { normalizeMetricScore, verifyMeasurements, evaluateMetrics };
