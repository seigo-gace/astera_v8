'use strict';

const { lensPlanEntries, lensPlanValues } = require('../lens-plan');
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

function sourceTiers(sources = []) {
  return new Set(array(sources).map((source) => clean(source?.tier || source?.source_tier).toUpperCase()).filter(Boolean));
}

function requestSpecialistSelected(task = {}) {
  const profile = task.domain?.request_specialist_profile || null;
  return Boolean(profile?.id && array(profile?.matched_signals).length);
}

const WEAK_SPECIALIST_SIGNALS = new Set([
  'api', 'db', 'ui', 'ai', 'llm', 'model', 'data', 'kpi',
  '更新', '文章', '評価', '調査', '根拠', '分析', '機能', '運用', 'チーム',
  'update', 'writing', 'evaluation', 'research', 'evidence', 'analysis', 'feature', 'operations', 'team'
]);

const EXPLICIT_GENRE_SPECIALIST_COMPATIBILITY = Object.freeze({
  G10: Object.freeze(['business_strategy']),
  G11: Object.freeze(['finance_capital']),
  G12: Object.freeze(['hr_organization']),
  G13: Object.freeze(['education_training']),
  G23: Object.freeze(['medical_health']),
  G29: Object.freeze(['engineering_architecture']),
  G30: Object.freeze(['ai_ml_governance']),
  G31: Object.freeze(['cybersecurity_privacy']),
  G37: Object.freeze(['research_evidence'])
});

function explicitGenreCompatibleSpecialist(task = {}) {
  const genre = clean(task.domain?.explicit_genre_hint).toUpperCase();
  const profileId = clean(task.domain?.request_specialist_profile?.id).toLocaleLowerCase();
  if (!genre || !profileId) return true;
  const allowed = EXPLICIT_GENRE_SPECIALIST_COMPATIBILITY[genre];
  return Array.isArray(allowed) && allowed.includes(profileId);
}

function strongRequestSpecialistOwnership(task = {}) {
  const profile = task.domain?.request_specialist_profile || null;
  if (!profile?.id || !explicitGenreCompatibleSpecialist(task)) return false;
  return array(profile.matched_signals).some((signal) => {
    const value = clean(signal).toLocaleLowerCase();
    if (!value || WEAK_SPECIALIST_SIGNALS.has(value)) return false;
    if (/^[a-z0-9]+$/u.test(value)) return value.length >= 4;
    return value.length >= 2;
  });
}

function explicitPrimaryGenre(task = {}, canonical = {}) {
  const id = clean(task.domain?.primary?.id).toUpperCase();
  if (!/^G\d{2}$/u.test(id)) return false;
  if (clean(task.domain?.explicit_genre_hint).toUpperCase() === id) return true;
  const matchedSignals = array(task.domain?.primary?.matched_signals).map((value) => clean(value).toUpperCase());
  if (matchedSignals.includes(id)) return true;
  const source = sourceText(task, canonical).toUpperCase();
  return new RegExp(`(^|[^A-Z0-9])${id}([^A-Z0-9]|$)`, 'u').test(source);
}

function strongPrimaryClassification(task = {}) {
  const domain = task.domain || {};
  const basis = clean(domain.classification_basis || domain.primary?.classification_basis).toUpperCase();
  const confidence = Number(domain.confidence ?? domain.primary?.confidence ?? 0);
  const reviewRequired = Boolean(domain.taxonomy_review_required ?? domain.primary?.taxonomy_review_required);
  return ['CONTROLLED_TERM_MATCH', 'TEXT_SCORE_MATCH'].includes(basis)
    && confidence >= 0.72
    && !reviewRequired;
}

function specialistOwned(value, sources = [], task = {}, canonical = {}) {
  if (lensRelevant(value, task, canonical)) return true;
  const tiers = sourceTiers(sources);
  const requestSpecialist = requestSpecialistSelected(task) && strongRequestSpecialistOwnership(task);
  if (tiers.has('REQUEST_SPECIALIST') && requestSpecialist) return true;
  if (tiers.has('PRIMARY_BREADTH') && explicitPrimaryGenre(task, canonical)) return true;
  if (tiers.has('PRIMARY') && !requestSpecialist && explicitPrimaryGenre(task, canonical)) return true;
  if ((tiers.has('PRIMARY') || tiers.has('PRIMARY_BREADTH')) && !requestSpecialist && strongPrimaryClassification(task)) return true;
  return false;
}

function lensSourcesFor(domain = {}, channel, value) {
  const key = clean(value);
  const match = lensPlanEntries(domain, channel).find((entry) => clean(entry?.value) === key);
  return array(match?.sources);
}

function scopeFactLane(fact = {}, task = {}, canonical = {}) {
  const factRequirements = array(fact.fact_requirements).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || specialistOwned(entry?.item, entry?.lens_sources, task, canonical)
  );
  const evidenceGaps = array(fact.evidence_gaps).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || specialistOwned(entry?.item, entry?.lens_sources, task, canonical)
  );
  return {
    ...fact,
    fact_requirements: factRequirements,
    evidence_gaps: evidenceGaps
  };
}

function scopeRiskLane(risk = {}, task = {}, canonical = {}) {
  const risks = array(risk.risks).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || specialistOwned(entry?.impact, entry?.lens_sources, task, canonical)
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
    if (entry?.source === 'LENS_PLAN' && !specialistOwned(entry?.focus, entry?.lens_sources, task, canonical)) return [];
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
    specialistOwned(value, lensSourcesFor(domain, 'inquiry', value), task, canonical)
  );
  const evidenceNeed = unique(inquiry.evidence_need).filter((value) =>
    specialistOwned(value, lensSourcesFor(domain, 'evidence', value), task, canonical)
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
  const comparisonRequested = explicitComparisonMaterial(task);
  const dimensions = unique(compare.dimensions).filter((value) => {
    const sources = lensSourcesFor(domain, 'compare', value);
    if (!comparisonRequested) return lensRelevant(value, task, canonical);
    if (!lensDimensions.has(clean(value))) return true;
    return specialistOwned(value, sources, task, canonical);
  });
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
  specialistOwned,
  explicitPrimaryGenre,
  strongPrimaryClassification,
  strongRequestSpecialistOwnership,
  explicitGenreCompatibleSpecialist,
  scopeFiveStageDecisionMaterial
};