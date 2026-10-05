'use strict';

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(array(values).map(clean).filter(Boolean))];
}

function sourceText(task = {}, canonical = {}) {
  return unique([
    task.source_span?.text,
    task.raw_text,
    task.target,
    task.objective,
    task.purpose,
    ...array(task.constraints),
    ...array(task.prohibitions),
    ...array(task.preserve),
    ...array(task.replace),
    ...array(task.conditions),
    ...array(task.exceptions),
    ...array(canonical.records).map((record) => record?.claim?.raw_text || record?.claim?.text)
  ]).join('\n').toLocaleLowerCase();
}

function sourceBacked(value, source) {
  const token = clean(value).toLocaleLowerCase();
  if (!token) return false;
  return source.includes(token);
}

function actionOf(task = {}) {
  return clean(task.action || task.operation).toLowerCase();
}

function scopeRiskLane(risk = {}, task = {}, canonical = {}) {
  const source = sourceText(task, canonical);
  const risks = array(risk.risks).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || sourceBacked(entry?.impact, source)
  );
  const highest = [...risks].sort((a, b) => Number(b?.weight || 0) - Number(a?.weight || 0))[0] || null;
  return {
    ...risk,
    rule_ids: unique(risks.map((entry) => entry?.rule_id)),
    risk_count: risks.length,
    risks,
    highest,
    failure_conditions: unique(risks.map((entry) => entry?.failure_condition)),
    level: Number(highest?.weight || 0) >= 30 ? 'high' : highest ? 'medium' : 'low'
  };
}

function scopeMultiLane(multi = {}, task = {}, canonical = {}) {
  const source = sourceText(task, canonical);
  const fixed = new Set(array(task.hard_blockers).concat(array(task.prohibitions)).map(clean));
  const perspectives = array(multi.perspectives).flatMap((entry) => {
    if (entry?.source === 'LENS_PLAN' && !sourceBacked(entry?.focus, source)) return [];
    if (String(entry?.id || '') !== 'defensive') return [entry];
    const focusValues = Array.isArray(entry.focus) ? entry.focus : [entry.focus];
    const focus = unique(focusValues).filter((value) => fixed.has(value) || sourceBacked(value, source));
    return [{ ...entry, focus }];
  });
  const allowedIds = new Set(perspectives.map((entry) => entry?.id));
  return {
    ...multi,
    perspectives,
    trade_off_map: array(multi.trade_off_map).filter((entry) => allowedIds.has(entry?.id))
  };
}

function scopeCompareLane(compare = {}, task = {}, canonical = {}) {
  const source = sourceText(task, canonical);
  const action = actionOf(task);
  const candidates = array(compare.comparison_candidates);
  const explicitCompare = /^(?:compare|comparison|比較)$/u.test(action) || candidates.length >= 2;
  if (explicitCompare) return compare;
  const dimensions = unique(compare.dimensions).filter((value) => sourceBacked(value, source));
  const allowed = new Set(dimensions);
  return {
    ...compare,
    dimensions,
    trade_off_differences: array(compare.trade_off_differences).filter((entry) => allowed.has(clean(entry?.dimension)))
  };
}

function scopeFiveStageDecisionMaterial(lanes = {}, task = {}, canonical = {}) {
  return {
    ...lanes,
    risk: scopeRiskLane(lanes.risk || {}, task, canonical),
    multi: scopeMultiLane(lanes.multi || {}, task, canonical),
    compare: scopeCompareLane(lanes.compare || {}, task, canonical)
  };
}

module.exports = {
  sourceBacked,
  scopeFiveStageDecisionMaterial
};