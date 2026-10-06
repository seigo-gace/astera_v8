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

const GENERIC_SEGMENTS = new Set([
  'risk', 'risks', 'failure', 'failures', 'material', 'materials', 'evidence',
  'requirement', 'requirements', 'condition', 'conditions', 'check', 'checks',
  'review', 'analysis', 'data', '情報', '材料', '確認', '条件', '比較', '根拠',
  'リスク', '危険', '評価', '専門家', '利用者'
]);

function relevanceSegments(value) {
  return unique(
    clean(value)
      .toLocaleLowerCase()
      .split(/[・\/／,:;|()（）\[\]{}<>「」『』\s]+/u)
      .map((part) => part.replace(/^[\-–—]+|[\-–—]+$/gu, '').trim())
      .filter((part) => {
        if (!part || GENERIC_SEGMENTS.has(part)) return false;
        if (/^[a-z0-9]+$/iu.test(part)) return part.length >= 4;
        return part.length >= 2;
      })
  );
}

function sourceRelevant(value, source) {
  if (sourceBacked(value, source)) return true;
  return relevanceSegments(value).some((segment) => source.includes(segment));
}

function lensEntries(lensPlan = {}, channel) {
  return array(lensPlan?.channels?.[channel]);
}

function entryForValue(lensPlan = {}, channel, value) {
  const normalized = clean(value);
  return lensEntries(lensPlan, channel).find((entry) => clean(entry?.value) === normalized) || null;
}

function entryTiers(entry = {}) {
  return new Set(array(entry?.sources).map((source) => clean(source?.tier)).filter(Boolean));
}

function channelHasBreadth(lensPlan = {}, channel) {
  return lensEntries(lensPlan, channel).some((entry) => entryTiers(entry).has('PRIMARY_BREADTH'));
}

function lensEntryAllowed(entry = {}, channel, source, lensPlan = {}) {
  if (!entry) return true;
  const tiers = entryTiers(entry);
  if (!tiers.size) return sourceRelevant(entry?.value, source);

  // Safety/explicit overlays are activated by source-backed overlay signals upstream.
  if (tiers.has('OVERLAY')) return true;

  // Broad genre material is the preferred public specialist layer.
  if (tiers.has('PRIMARY_BREADTH')) return true;

  // Representative anchor material is useful when there is no broader genre
  // contract. If breadth exists, retain narrow anchor items only when the
  // request/source itself makes them relevant.
  if (tiers.has('PRIMARY')) {
    return !channelHasBreadth(lensPlan, channel) || sourceRelevant(entry?.value, source);
  }

  // Secondary genres are internal routing context unless their actual material
  // is source-relevant. A secondary genre match alone must not create public
  // judgment material.
  if (tiers.has('SECONDARY')) return sourceRelevant(entry?.value, source);

  return sourceRelevant(entry?.value, source);
}

function lensValueAllowed(value, channel, source, lensPlan = {}) {
  const entry = entryForValue(lensPlan, channel, value);
  return entry ? lensEntryAllowed(entry, channel, source, lensPlan) : true;
}

function scopePublicLensPlan(lensPlan = {}, source) {
  if (!lensPlan || typeof lensPlan !== 'object') return lensPlan;
  const channels = {};
  for (const [channel, entries] of Object.entries(lensPlan.channels || {})) {
    channels[channel] = array(entries).filter((entry) => lensEntryAllowed(entry, channel, source, lensPlan));
  }
  return { ...lensPlan, channels };
}

function scopeFactLane(fact = {}, source, lensPlan = {}) {
  const factRequirements = array(fact.fact_requirements).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || lensValueAllowed(entry?.item, 'fact', source, lensPlan)
  );
  const evidenceGaps = array(fact.evidence_gaps).filter((entry) =>
    entry?.source !== 'LENS_PLAN' || lensValueAllowed(entry?.item, 'evidence', source, lensPlan)
  );
  return {
    ...fact,
    fact_requirements: factRequirements,
    evidence_gaps: evidenceGaps
  };
}

function scopeRiskLane(risk = {}, task = {}, canonical = {}, lensPlan = {}, source = sourceText(task, canonical)) {
  const risks = array(risk.risks).filter((entry) => {
    if (entry?.source !== 'LENS_PLAN') return true;
    const mapped = entryForValue(lensPlan, 'risk', entry?.impact);
    return mapped
      ? lensEntryAllowed(mapped, 'risk', source, lensPlan)
      : sourceRelevant(entry?.impact, source);
  });
  const highest = [...risks].sort((a, b) => Number(b?.weight || 0) - Number(a?.weight || 0))[0] || null;
  const safetyGates = array(risk.safety_gates).filter((value) => {
    const mapped = entryForValue(lensPlan, 'safety', value);
    return !mapped || lensEntryAllowed(mapped, 'safety', source, lensPlan);
  });
  return {
    ...risk,
    rule_ids: unique(risks.map((entry) => entry?.rule_id)),
    risk_count: risks.length,
    risks,
    highest,
    safety_gates: unique(safetyGates),
    failure_conditions: unique(risks.map((entry) => entry?.failure_condition)),
    level: Number(highest?.weight || 0) >= 30 ? 'high' : highest ? 'medium' : 'low'
  };
}

function scopeMultiLane(multi = {}, task = {}, canonical = {}, lensPlan = {}, source = sourceText(task, canonical)) {
  const hiddenRiskValues = new Set(
    lensEntries(lensPlan, 'risk')
      .filter((entry) => !lensEntryAllowed(entry, 'risk', source, lensPlan))
      .map((entry) => clean(entry?.value))
  );
  const fixed = new Set(array(task.hard_blockers).concat(array(task.prohibitions)).map(clean));
  const perspectives = array(multi.perspectives).flatMap((entry) => {
    if (entry?.source === 'LENS_PLAN') {
      const mapped = entryForValue(lensPlan, 'multi', entry?.focus);
      if (mapped && !lensEntryAllowed(mapped, 'multi', source, lensPlan)) return [];
      if (!mapped && !sourceRelevant(entry?.focus, source)) return [];
    }

    if (String(entry?.id || '') !== 'defensive') return [entry];

    const focusValues = Array.isArray(entry.focus) ? entry.focus : [entry.focus];
    const focus = unique(focusValues).filter((value) => {
      const normalized = clean(value);
      if (fixed.has(normalized) || sourceRelevant(value, source)) return true;
      // If the public LensPlan explicitly identifies a value as allowed, retain it.
      const mappedRisk = entryForValue(lensPlan, 'risk', value);
      if (mappedRisk) return lensEntryAllowed(mappedRisk, 'risk', source, lensPlan);
      // Provenance-less defensive Lens material is fail-closed. This preserves
      // the M6 contract for legacy/compact lane payloads.
      return false;
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

function scopeInquiryLane(inquiry = {}, source, lensPlan = {}) {
  const inquiryLens = unique(inquiry.inquiry_lens).filter((value) =>
    lensValueAllowed(value, 'inquiry', source, lensPlan)
  );
  const evidenceNeed = unique(inquiry.evidence_need).filter((value) =>
    lensValueAllowed(value, 'evidence', source, lensPlan)
  );

  const denied = new Set([
    ...lensEntries(lensPlan, 'inquiry')
      .filter((entry) => !lensEntryAllowed(entry, 'inquiry', source, lensPlan))
      .map((entry) => clean(entry?.value)),
    ...lensEntries(lensPlan, 'evidence')
      .filter((entry) => !lensEntryAllowed(entry, 'evidence', source, lensPlan))
      .map((entry) => clean(entry?.value))
  ]);

  const missingQuestions = unique(inquiry.missing_questions).filter((value) => !denied.has(clean(value)));

  return {
    ...inquiry,
    inquiry_lens: inquiryLens,
    evidence_need: evidenceNeed,
    missing_questions: missingQuestions
  };
}

function scopeCompareLane(compare = {}, task = {}, canonical = {}, lensPlan = {}, source = sourceText(task, canonical)) {
  const dimensionSourceValues = new Set(array(compare.dimension_sources).map((entry) => clean(entry?.value)));
  const dimensions = unique(compare.dimensions).filter((value) => {
    const mapped = entryForValue(lensPlan, 'compare', value);
    if (mapped) return lensEntryAllowed(mapped, 'compare', source, lensPlan);
    // A dimension absent from Lens provenance may be source-extracted only
    // when the request itself supports it. Otherwise fail closed to avoid
    // resurrecting legacy generic Lens dimensions.
    if (dimensionSourceValues.has(clean(value))) return sourceRelevant(value, source);
    return sourceRelevant(value, source);
  });
  const allowed = new Set(dimensions.map(clean));
  return {
    ...compare,
    dimensions,
    dimension_sources: array(compare.dimension_sources).filter((entry) => allowed.has(clean(entry?.value))),
    trade_off_differences: array(compare.trade_off_differences).filter((entry) => allowed.has(clean(entry?.dimension)))
  };
}

function scopeFiveStageDecisionMaterial(lanes = {}, task = {}, canonical = {}) {
  const source = sourceText(task, canonical);
  const lensPlan = lanes.lens_plan || task?.domain?.lens_plan || {};
  return {
    ...lanes,
    lens_plan: scopePublicLensPlan(lensPlan, source),
    fact: scopeFactLane(lanes.fact || {}, source, lensPlan),
    risk: scopeRiskLane(lanes.risk || {}, task, canonical, lensPlan, source),
    multi: scopeMultiLane(lanes.multi || {}, task, canonical, lensPlan, source),
    inquiry: scopeInquiryLane(lanes.inquiry || {}, source, lensPlan),
    compare: scopeCompareLane(lanes.compare || {}, task, canonical, lensPlan, source)
  };
}

module.exports = {
  sourceBacked,
  sourceRelevant,
  explicitRiskMaterial,
  explicitComparisonMaterial,
  lensEntryAllowed,
  scopeFiveStageDecisionMaterial
};
