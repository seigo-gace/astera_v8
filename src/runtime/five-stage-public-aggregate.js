'use strict';

function array(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(array(values).map((value) => String(value || '').trim()).filter(Boolean))];
}

function lanesOf(result = {}) {
  return result.public_lanes || result.lanes || {};
}

function publicTaskResults(taskResults = []) {
  return array(taskResults).map((result) => ({ ...result, lanes: lanesOf(result) }));
}

function comparisonCandidates(results = []) {
  const out = [];
  for (const result of results) {
    for (const candidate of array(result?.lanes?.compare?.comparison_candidates)) {
      const label = typeof candidate === 'string' ? candidate : candidate?.label;
      if (label && !out.includes(label)) out.push(label);
    }
  }
  return out;
}

function mergeConditionDifferences(results = [], fallback = {}) {
  const merged = { constraints: [], prohibitions: [], preserve: [], replace: [], conditions: [], exceptions: [], dependencies: [] };
  for (const key of Object.keys(merged)) merged[key] = unique(fallback?.[key] || []);
  for (const result of results) {
    const value = result?.lanes?.compare?.condition_differences || {};
    for (const key of Object.keys(merged)) merged[key] = unique([...merged[key], ...array(value[key])]);
  }
  return merged;
}

function buildPublicFiveStageAggregate(rawAggregate = {}, taskResults = []) {
  const results = publicTaskResults(taskResults);
  const riskItems = results.flatMap((result) => array(result?.lanes?.risk?.risks).map((item) => ({ task_id: result.task.id, ...item })))
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0) || String(a.key || '').localeCompare(String(b.key || '')));
  const perspectives = results.flatMap((result) => array(result?.lanes?.multi?.perspectives).map((item) => ({ task_id: result.task.id, ...item })));
  const tradeOffMap = results.flatMap((result) => array(result?.lanes?.multi?.trade_off_map).map((item) => ({ task_id: result.task.id, ...item })));
  const dimensions = unique(results.flatMap((result) => array(result?.lanes?.compare?.dimensions)));

  return {
    ...rawAggregate,
    // Perspective Expansion is retained in the internal task/result model, but
    // it is not a public semantic authority. Public Main8 must receive
    // semantic material only from the scoped Fact/Risk/Multi/Inquiry/Compare
    // lanes. Leaving raw Perspective Expansion here would bypass that boundary.
    perspectiveExpansion: {
      ...(rawAggregate.perspectiveExpansion || {}),
      per_task: {},
      perspectives: [],
      candidates: [],
      selected: null,
      rejected: [],
      public_projection_state: 'SUPPRESSED_NON_FIVE_STAGE_SEMANTIC_PATH'
    },
    risks: {
      ...(rawAggregate.risks || {}),
      risk_count: riskItems.length,
      risks: riskItems,
      highest: riskItems[0] || null,
      level: riskItems.some((item) => Number(item.weight || 0) >= 100) ? 'high' : riskItems.length ? 'medium' : 'low',
      safety_gates: unique(results.flatMap((result) => array(result?.lanes?.risk?.safety_gates))),
      hard_constraints: unique(results.flatMap((result) => array(result?.lanes?.risk?.hard_constraints))),
      per_task: Object.fromEntries(results.map((result) => [result.task.id, result.lanes.risk]))
    },
    multi: {
      ...(rawAggregate.multi || {}),
      perspectives,
      trade_off_map: tradeOffMap,
      per_task: Object.fromEntries(results.map((result) => [result.task.id, result.lanes.multi]))
    },
    inquiry: {
      ...(rawAggregate.inquiry || {}),
      per_task: Object.fromEntries(results.map((result) => [result.task.id, result.lanes.inquiry]))
    },
    comparison: {
      ...(rawAggregate.comparison || {}),
      dimensions,
      comparison_candidates: comparisonCandidates(results),
      candidate_materials: results.flatMap((result) => array(result?.lanes?.compare?.candidate_materials).map((item) => ({ task_id: result.task.id, ...item }))),
      trade_off_differences: results.flatMap((result) => array(result?.lanes?.compare?.trade_off_differences).map((item) => ({ task_id: result.task.id, ...item }))),
      scope_booleans: results.flatMap((result) => array(result?.lanes?.compare?.scope_booleans).map((item) => ({ task_id: result.task.id, ...item }))),
      supported_scope: results.flatMap((result) => array(result?.lanes?.compare?.supported_scope).map((item) => ({ task_id: result.task.id, ...item }))),
      unsupported_scope: results.flatMap((result) => array(result?.lanes?.compare?.unsupported_scope).map((item) => ({ task_id: result.task.id, ...item }))),
      contradiction_map: results.flatMap((result) => array(result?.lanes?.compare?.contradiction_map).map((item) => ({ task_id: result.task.id, ...item }))),
      condition_differences: mergeConditionDifferences(results, rawAggregate.comparison?.condition_differences),
      selected_candidate: null,
      candidate_ranking: [],
      rejected_candidates: [],
      per_task: Object.fromEntries(results.map((result) => [result.task.id, result.lanes.compare]))
    }
  };
}

module.exports = {
  lanesOf,
  publicTaskResults,
  buildPublicFiveStageAggregate
};