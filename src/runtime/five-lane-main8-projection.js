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

function itemsFromLane(taskResults, lane, field, mapper = (value) => value) {
  return unique(array(taskResults).flatMap((result) =>
    array(result?.lanes?.[lane]?.[field]).map(mapper)
  ));
}

function taskNeedsComparison(result = {}) {
  const action = clean(result?.task?.action || result?.task?.operation).toLowerCase();
  if (/^(?:compare|comparison|比較)$/u.test(action)) return true;
  if (array(result?.task?.candidates).length >= 2) return true;
  if (array(result?.lanes?.compare?.comparison_candidates).length >= 2) return true;
  if (array(result?.lanes?.compare?.candidate_materials).length >= 2) return true;
  return false;
}

function projectFiveLaneMaterialToMain8(judgment = {}, taskResults = []) {
  const next = { ...judgment };

  const factRequirements = itemsFromLane(taskResults, 'fact', 'fact_requirements', (entry) => entry?.item);
  const domainPerspectives = unique(array(taskResults).flatMap((result) =>
    array(result?.lanes?.multi?.perspectives)
      .filter((entry) => entry?.source === 'LENS_PLAN')
      .map((entry) => Array.isArray(entry?.focus) ? entry.focus.join(' / ') : entry?.focus)
  ));
  const inquiryRequirements = itemsFromLane(taskResults, 'inquiry', 'inquiry_lens');
  const evidenceRequirements = itemsFromLane(taskResults, 'inquiry', 'evidence_need');
  const comparisonDimensions = unique(array(taskResults)
    .filter(taskNeedsComparison)
    .flatMap((result) => array(result?.lanes?.compare?.dimensions)));

  if (next['03_facts']) {
    next['03_facts'] = { ...next['03_facts'], fact_requirements: factRequirements };
  }
  if (next['05_opposition']) {
    next['05_opposition'] = { ...next['05_opposition'], domain_perspectives: domainPerspectives };
  }
  if (next['06_comparison']) {
    next['06_comparison'] = { ...next['06_comparison'], dimensions: comparisonDimensions };
  }
  if (next['07_evidence_status']) {
    next['07_evidence_status'] = { ...next['07_evidence_status'], evidence_requirements: evidenceRequirements };
  }
  if (next['08_reinstruction']) {
    next['08_reinstruction'] = { ...next['08_reinstruction'], inquiry_requirements: inquiryRequirements };
  }

  next.five_lane_public_material = {
    fact_requirements: factRequirements,
    domain_perspectives: domainPerspectives,
    inquiry_requirements: inquiryRequirements,
    evidence_requirements: evidenceRequirements,
    comparison_dimensions: comparisonDimensions
  };

  return next;
}

module.exports = {
  taskNeedsComparison,
  projectFiveLaneMaterialToMain8
};
