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

function lanesOf(result = {}) {
  return result.public_lanes || result.lanes || {};
}

function itemsFromLane(taskResults, lane, field, mapper = (value) => value) {
  return unique(array(taskResults).flatMap((result) =>
    array(lanesOf(result)?.[lane]?.[field]).map(mapper)
  ));
}

function taskMaterialRequirements(result = {}) {
  return unique([
    ...array(result?.task?.material_requirements),
    ...array(result?.task?.local_context?.material_requirements)
  ]);
}

function taskRequestText(result = {}, request = {}) {
  const task = result?.task || {};
  const model = request?.analysis_task_packet?.case_model || {};
  const requests = array(model?.judgment_requests);
  const owned = requests.find((item) => clean(item?.id) === clean(task?.request_id));
  const singleRequestWholeInput = requests.length <= 1
    ? clean(request?.original_question || request?.normalized_question || '')
    : '';
  return unique([
    task?.source_span?.text,
    task?.raw_text,
    task?.target,
    task?.objective,
    task?.purpose,
    owned?.request_text,
    singleRequestWholeInput,
    ...array(task?.unresolved),
    ...array(task?.constraints),
    ...array(task?.conditions),
    ...array(task?.exceptions)
  ]).join(' ');
}

function taskRequestsRiskMaterial(result = {}, request = {}) {
  const values = [...taskMaterialRequirements(result), taskRequestText(result, request)];
  return values.some((value) =>
    /(?:主要(?:な)?(?:危険|リスク)|危険(?:・|や|と)?(?:失敗|リスク)?|リスク|失敗条件|反証条件|\bmaterial\s+risks?\b|\brisks?\b|failure\s+(?:conditions?|modes?)|disconfirming\s+conditions?)/iu.test(value)
  );
}

function taskRequestsComparisonMaterial(result = {}, request = {}) {
  const values = [...taskMaterialRequirements(result), taskRequestText(result, request)];
  return values.some((value) =>
    /(?:比較に必要な軸|比較軸|評価軸|比較(?:条件|基準)|\bcomparison\s+(?:dimensions?|criteria)\b|\bevaluation\s+criteria\b|\bdimensions?\s+(?:for|to)\s+(?:compare|comparison|evaluate|evaluation)\b)/iu.test(value)
  );
}

function taskNeedsComparison(result = {}) {
  const action = clean(result?.task?.action || result?.task?.operation).toLowerCase();
  if (/^(?:compare|comparison|比較)$/u.test(action)) return true;
  if (array(result?.task?.candidates).length >= 2) return true;
  if (array(result?.task?.observable_material?.candidates).length >= 2) return true;
  if (array(lanesOf(result)?.compare?.comparison_candidates).length >= 2) return true;
  if (array(lanesOf(result)?.compare?.candidate_materials).length >= 2) return true;
  return false;
}

function projectFiveLaneMaterialToMain8(judgment = {}, taskResults = [], request = {}) {
  const next = { ...judgment };

  const factRequirements = itemsFromLane(taskResults, 'fact', 'fact_requirements', (entry) => entry?.item);
  const riskRequirements = unique(array(taskResults)
    .filter((result) => taskRequestsRiskMaterial(result, request))
    .flatMap((result) => array(lanesOf(result)?.risk?.risks)
      .filter((entry) => entry?.source === 'LENS_PLAN')
      .map((entry) => entry?.impact)));
  const domainPerspectives = unique(array(taskResults).flatMap((result) =>
    array(lanesOf(result)?.multi?.perspectives)
      .filter((entry) => entry?.source === 'LENS_PLAN')
      .map((entry) => Array.isArray(entry?.focus) ? entry.focus.join(' / ') : entry?.focus)
  ));
  const missingMaterial = itemsFromLane(taskResults, 'inquiry', 'missing_fields');
  const inquiryRequirements = itemsFromLane(taskResults, 'inquiry', 'inquiry_lens');
  const evidenceRequirements = itemsFromLane(taskResults, 'inquiry', 'evidence_need');
  const comparisonDimensions = unique(array(taskResults)
    .filter((result) => taskNeedsComparison(result) || taskRequestsComparisonMaterial(result, request))
    .flatMap((result) => array(lanesOf(result)?.compare?.dimensions)));

  if (next['02_premise']) next['02_premise'] = { ...next['02_premise'], five_lane_missing_material: missingMaterial };
  if (next['03_facts']) next['03_facts'] = { ...next['03_facts'], fact_requirements: factRequirements };
  if (next['04_crisis']) next['04_crisis'] = { ...next['04_crisis'], risk_requirements: riskRequirements };
  if (next['05_opposition']) next['05_opposition'] = { ...next['05_opposition'], domain_perspectives: domainPerspectives };
  if (next['06_comparison']) next['06_comparison'] = { ...next['06_comparison'], dimensions: comparisonDimensions, five_lane_dimensions: comparisonDimensions };
  if (next['07_evidence_status']) next['07_evidence_status'] = { ...next['07_evidence_status'], evidence_requirements: evidenceRequirements };
  if (next['08_reinstruction']) next['08_reinstruction'] = { ...next['08_reinstruction'], inquiry_requirements: inquiryRequirements };

  next.five_lane_public_material = {
    missing_material: missingMaterial,
    fact_requirements: factRequirements,
    risk_requirements: riskRequirements,
    domain_perspectives: domainPerspectives,
    inquiry_requirements: inquiryRequirements,
    evidence_requirements: evidenceRequirements,
    comparison_dimensions: comparisonDimensions
  };

  return next;
}

module.exports = {
  taskNeedsComparison,
  taskRequestsRiskMaterial,
  taskRequestsComparisonMaterial,
  projectFiveLaneMaterialToMain8
};