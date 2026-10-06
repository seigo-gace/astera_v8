'use strict';

const PRIMARY_PUBLIC_TIERS = new Set(['PRIMARY', 'PRIMARY_BREADTH']);

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

function explicitPerspectiveMaterial(task = {}) {
  return taskMaterialRequirements(task).some((value) =>
    /(?:反対(?:側|視点)|別視点|多角的|異なる視点|stakeholder|perspective|counter(?:point|argument)?|opposing\s+view)/iu.test(value)
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

function explicitInquiryMaterial(task = {}) {
  return taskMaterialRequirements(task).some((value) =>
    /(?:次に確認|確認すべき|未確認事項|不足材料|必要な根拠|成立状態|what\s+(?:else|must|needs?)\s+(?:be\s+)?(?:checked|verified)|missing\s+material|evidence\s+(?:need|status))/iu.test(value)
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

function sourcesOf(entry = {}) {
  return array(entry.lens_sources || entry.sources);
}

function hasPrimaryTier(entry = {}) {
  return sourcesOf(entry).some((source) => PRIMARY_PUBLIC_TIERS.has(String(source?.tier || '')));
}

function lensEntry(lensPlan = {}, channel, value) {
  const token = clean(value).toLocaleLowerCase();
  return array(lensPlan?.channels?.[channel]).find((entry) =>
    clean(entry?.value).toLocaleLowerCase() === token
  ) || null;
}

function allowLensValue(value, entry, source, allowPrimary) {
  if (sourceBacked(value, source)) return true;
  return Boolean(allowPrimary && entry && hasPrimaryTier(entry));
}

function scopeFactLane(fact = {}, task = {}, canonical = {}, lensPlan = {}) {
  const source = sourceText(task, canonical);
  const factRequirements = array(fact.fact_requirements).filter((entry) =>
    entry?.source !== 'LENS_PLAN'
    || allowLensValue(entry?.item, entry, source, true)
  );
  const evidenceGaps = array(fact.evidence_gaps).filter((entry) =>
    entry?.source !== 'LENS_PLAN'
    || allowLensValue(entry?.item, entry, source, true)
  );
  return {
    ...fact,
    fact_requirements: factRequirements,
    evidence_gaps: evidenceGaps
  };
}

function scopeRiskLane(risk = {}, task = {}, canonical = {}, lensPlan = {}) {
  const source = sourceText(task, canonical);
  const retainPrimaryLens = true;
  const risks = array(risk.risks).filter((entry) => {
    if (entry?.source !== 'LENS_PLAN') return true;
    return allowLensValue(entry?.impact, entry, source, retainPrimaryLens);
  });
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

function scopeMultiLane(multi = {}, task = {}, canonical = {}, lensPlan = {}) {
  const source = sourceText(task, canonical);
  const retainPrimaryLens = explicitPerspectiveMaterial(task) || explicitRiskMaterial(task);
  const fixed = new Set(array(task.hard_blockers).concat(array(task.prohibitions)).map(clean));

  const perspectives = array(multi.perspectives).flatMap((entry) => {
    if (entry?.source === 'LENS_PLAN') {
      return allowLensValue(entry?.focus, entry, source, retainPrimaryLens) ? [entry] : [];
    }

    if (String(entry?.id || '') !== 'defensive') return [entry];

    const focusValues = Array.isArray(entry.focus) ? entry.focus : [entry.focus];
    const focus = unique(focusValues).filter((value) => {
      if (fixed.has(clean(value)) || sourceBacked(value, source)) return true;
      const planEntry = lensEntry(lensPlan, 'risk', value);
      return allowLensValue(value, planEntry, source, retainPrimaryLens);
    });
    return [{ ...entry, focus }];
  });

  const allowedIds = new Set(perspectives.map((entry) => entry?.id));
  return {
    ...multi,
    perspectives,
    trade_off_map: array(multi.trade_off_map).filter((entry) => allowedIds.has(entry?.id))
  };
}

function allowedLensSet(lensPlan = {}, channel, source, allowPrimary) {
  return new Set(
    array(lensPlan?.channels?.[channel])
      .filter((entry) => allowLensValue(entry?.value, entry, source, allowPrimary))
      .map((entry) => clean(entry.value))
  );
}

function scopeInquiryLane(inquiry = {}, task = {}, canonical = {}, lensPlan = {}) {
  const source = sourceText(task, canonical);
  const allowPrimary = explicitInquiryMaterial(task) || explicitRiskMaterial(task) || explicitComparisonMaterial(task);
  const allowedInquiry = allowedLensSet(lensPlan, 'inquiry', source, allowPrimary);
  const allowedEvidence = allowedLensSet(lensPlan, 'evidence', source, allowPrimary);
  const allInquiry = new Set(array(lensPlan?.channels?.inquiry).map((entry) => clean(entry?.value)).filter(Boolean));
  const allEvidence = new Set(array(lensPlan?.channels?.evidence).map((entry) => clean(entry?.value)).filter(Boolean));
  const allowedCombined = new Set([...allowedInquiry, ...allowedEvidence]);

  const inquiryLens = unique(inquiry.inquiry_lens).filter((value) => allowedInquiry.has(clean(value)));
  const evidenceNeed = unique(inquiry.evidence_need).filter((value) => allowedEvidence.has(clean(value)));
  const missingQuestions = unique(inquiry.missing_questions).filter((value) => {
    const normalized = clean(value);
    if (!allInquiry.has(normalized) && !allEvidence.has(normalized)) return true;
    return allowedCombined.has(normalized);
  });

  return {
    ...inquiry,
    inquiry_lens: inquiryLens,
    evidence_need: evidenceNeed,
    missing_questions: missingQuestions
  };
}

function scopeCompareLane(compare = {}, task = {}, canonical = {}, lensPlan = {}) {
  const source = sourceText(task, canonical);
  const allowPrimary = explicitComparisonMaterial(task);
  const dimensions = unique(compare.dimensions).filter((value) => {
    const entry = lensEntry(lensPlan, 'compare', value);
    if (!entry) return sourceBacked(value, source);
    return allowLensValue(value, entry, source, allowPrimary);
  });
  const allowed = new Set(dimensions.map(clean));
  const dimensionSources = array(compare.dimension_sources).filter((entry) => allowed.has(clean(entry?.value)));
  return {
    ...compare,
    dimensions,
    dimension_sources: dimensionSources,
    trade_off_differences: array(compare.trade_off_differences).filter((entry) => allowed.has(clean(entry?.dimension)))
  };
}

function scopeFiveStageDecisionMaterial(lanes = {}, task = {}, canonical = {}) {
  const lensPlan = lanes.lens_plan || task?.domain?.lens_plan || {};
  return {
    ...lanes,
    fact: scopeFactLane(lanes.fact || {}, task, canonical, lensPlan),
    risk: scopeRiskLane(lanes.risk || {}, task, canonical, lensPlan),
    multi: scopeMultiLane(lanes.multi || {}, task, canonical, lensPlan),
    inquiry: scopeInquiryLane(lanes.inquiry || {}, task, canonical, lensPlan),
    compare: scopeCompareLane(lanes.compare || {}, task, canonical, lensPlan)
  };
}

module.exports = {
  PRIMARY_PUBLIC_TIERS,
  sourceBacked,
  explicitRiskMaterial,
  explicitPerspectiveMaterial,
  explicitComparisonMaterial,
  explicitInquiryMaterial,
  hasPrimaryTier,
  scopeFiveStageDecisionMaterial
};
