'use strict';

const { lensPlanValues } = require('../lens-plan');
const { DOMAIN_QUESTIONS } = require('../v4-canonical/lanes');
const { lensMaterialRelevant } = require('./lens-material-relevance');

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(array(values).map(clean).filter(Boolean))];
}

function taskMaterialRequirements(task = {}) {
  return unique([
    ...array(task.material_requirements),
    ...array(task.local_context?.material_requirements)
  ]);
}

function explicitRiskMaterial(task = {}) {
  return taskMaterialRequirements(task).some((value) =>
    /(?:主要(?:な)?(?:危険|リスク)|危険(?:・|や|と)?(?:失敗|リスク)?|リスク|失敗条件|反証条件|\bmaterial\s+risks?\b|\brisks?\b|failure\s+(?:conditions?|modes?)|disconfirming\s+conditions?)/iu.test(value)
  );
}

function explicitComparisonMaterial(task = {}) {
  const action = clean(task.action || task.operation).toLowerCase();
  if (/^(?:compare|comparison|比較)$/u.test(action)) return true;
  if (array(task.candidates).length >= 2 || array(task.observable_material?.candidates).length >= 2) return true;
  return taskMaterialRequirements(task).some((value) =>
    /(?:比較に必要な軸|比較軸|評価軸|比較(?:条件|基準)|\bcomparison\s+(?:dimensions?|criteria)\b|\bevaluation\s+criteria\b|\bdimensions?\s+(?:for|to)\s+(?:compare|comparison|evaluate|evaluation)\b)/iu.test(value)
  );
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

function lensRelevant(value, task = {}, canonical = {}) {
  return lensMaterialRelevant(
    value,
    sourceText(task, canonical),
    array(task.domain?.primary?.matched_signals)
  );
}

function scopeFactLane(fact = {}, task = {}, canonical = {}) {
  const factRequirements = array(fact.fact_requirements).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || lensRelevant(entry?.item, task, canonical)
  );
  const evidenceGaps = array(fact.evidence_gaps).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || lensRelevant(entry?.item, task, canonical)
  );
  return {
    ...fact,
    fact_requirements: factRequirements,
    evidence_gaps: evidenceGaps
  };
}

function scopeRiskLane(risk = {}, task = {}, canonical = {}) {
  const risks = array(risk.risks).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || lensRelevant(entry?.impact, task, canonical)
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
  const fixed = new Set(array(task.hard_blockers).concat(array(task.prohibitions)).map(clean));
  const perspectives = array(multi.perspectives).flatMap((entry) => {
    if (entry?.source === 'LENS_PLAN' && !lensRelevant(entry?.focus, task, canonical)) return [];
    if (String(entry?.id || '') !== 'defensive') return [entry];
    const focusValues = Array.isArray(entry.focus) ? entry.focus : [entry.focus];
    const focus = unique(focusValues).filter((value) =>
      fixed.has(value) || lensRelevant(value, task, canonical)
    );
    return [{ ...entry, focus }];
  });
  const allowedIds = new Set(perspectives.map((entry) => entry?.id));
  return {
    ...multi,
    perspectives,
    trade_off_map: array(multi.trade_off_map).filter((entry) => allowedIds.has(entry?.id))
  };
}

function scopeInquiryLane(inquiry = {}, task = {}, canonical = {}) {
  const domain = task.domain || {};
  const primaryId = domain.primary?.id || null;
  const lensInquiry = new Set(lensPlanValues(domain, 'inquiry').map(clean));
  const lensEvidence = new Set(lensPlanValues(domain, 'evidence').map(clean));
  const domainQuestions = new Set(array(DOMAIN_QUESTIONS[primaryId]).map(clean));
  const generated = new Set([...lensInquiry, ...lensEvidence, ...domainQuestions]);

  const inquiryLens = unique(inquiry.inquiry_lens).filter((value) =>
    lensRelevant(value, task, canonical)
  );
  const evidenceNeed = unique(inquiry.evidence_need).filter((value) =>
    lensRelevant(value, task, canonical)
  );
  const missingQuestions = unique(inquiry.missing_questions).filter((value) => {
    const key = clean(value);
    return !generated.has(key) || lensRelevant(value, task, canonical);
  });

  return {
    ...inquiry,
    inquiry_lens: inquiryLens,
    evidence_need: evidenceNeed,
    missing_questions: missingQuestions
  };
}

function scopeCompareLane(compare = {}, task = {}, canonical = {}) {
  const domain = task.domain || {};
  const lensDimensions = new Set([
    ...lensPlanValues(domain, 'compare'),
    ...array(compare.dimension_sources).map((entry) => entry?.value)
  ].map(clean));
  const dimensions = unique(compare.dimensions).filter((value) =>
    !lensDimensions.has(clean(value)) || lensRelevant(value, task, canonical)
  );
  const allowed = new Set(dimensions.map(clean));
  return {
    ...compare,
    dimensions,
    trade_off_differences: array(compare.trade_off_differences).filter((entry) =>
      allowed.has(clean(entry?.dimension))
    )
  };
}

function scopeFiveStageDecisionMaterial(lanes = {}, task = {}, canonical = {}) {
  return {
    ...lanes,
    fact: scopeFactLane(lanes.fact || {}, task, canonical),
    risk: scopeRiskLane(lanes.risk || {}, task, canonical),
    multi: scopeMultiLane(lanes.multi || {}, task, canonical),
    inquiry: scopeInquiryLane(lanes.inquiry || {}, task, canonical),
    compare: scopeCompareLane(lanes.compare || {}, task, canonical)
  };
}

module.exports = {
  sourceBacked,
  lensRelevant,
  explicitRiskMaterial,
  explicitComparisonMaterial,
  scopeFiveStageDecisionMaterial
};