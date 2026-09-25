 "use strict";

const { validReference } = require("./evidence-registry-verifier");

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

function metricInputMap(metrics = []) {
  const map = new Map();
  for (const item of Array.isArray(metrics) ? metrics : []) {
    const id = String(item?.metric_id || "").trim();
    if (id && !map.has(id)) map.set(id, item);
  }
  return map;
}

function evaluateMetrics(profile, metrics, evidenceVerification) {
  const inputMap = metricInputMap(metrics);
  const dimensions = [];
  const issues = [];

  for (const dimension of profile.dimensions) {
    const evaluated = [];
    for (const definition of dimension.metrics) {
      const input = inputMap.get(definition.metric_id);
      const refs = Array.isArray(input?.evidence_refs) ? input.evidence_refs.map(String).filter(Boolean) : [];
      const invalidRefs = refs.filter((ref) => !validReference(ref, evidenceVerification));
      const required = definition.required !== false;
      const evidenceRequired = definition.evidence_required !== false;
      const missing = !input;
      const missingEvidence = evidenceRequired && refs.length === 0;
      const rawScore = missing || invalidRefs.length > 0 || missingEvidence ? 0 : normalizeMetricScore(definition, input.value);
      const score = Math.round(rawScore * 100) / 100;
      const weighted = score * (Number(definition.weight) / 100);

      if (missing && required) issues.push({ code: "REQUIRED_METRIC_MISSING", metric_id: definition.metric_id });
      if (missingEvidence) issues.push({ code: "METRIC_EVIDENCE_MISSING", metric_id: definition.metric_id });
      for (const ref of invalidRefs) issues.push({ code: "METRIC_EVIDENCE_REF_INVALID", metric_id: definition.metric_id, evidence_ref: ref });

      evaluated.push({
        metric_id: definition.metric_id,
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
  return { dimensions, total, issues, metric_input_map: inputMap };
}

module.exports = { normalizeMetricScore, evaluateMetrics };
