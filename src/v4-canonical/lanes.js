'use strict';

const { ClaimStatus, UndeterminedReason } = require('./confirmation');
const { deepFreeze } = require('./core');
const { compileLensPlan, lensPlanEntries, lensPlanValues } = require('../lens-plan');

function resultMap(results) {
  return new Map(results.map((result) => [result.claim_id, result]));
}

function factLane(claims, results, domain = {}) {
  const byId = resultMap(results);
  const confirmedClaims = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED);
  const undeterminedClaims = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.UNDETERMINED);
  const domainEvidence = lensPlanEntries(domain, 'evidence').map((entry) => ({
    item: entry.value,
    reason: 'LensPlanが判断前に収集対象として指定している。',
    source: 'LENS_PLAN',
    lens_sources: entry.sources
  }));
  const unresolvedEvidence = undeterminedClaims.map((claim) => ({
    item: claim.raw_text,
    reason: (byId.get(claim.claim_id).reasons || []).join(' / '),
    source: 'CANONICAL_CLAIM'
  }));
  return deepFreeze({
    lane: 'fact',
    confirmed_claim_ids: confirmedClaims.map((claim) => claim.claim_id).sort(),
    undetermined_claim_ids: undeterminedClaims.map((claim) => claim.claim_id).sort(),
    confirmed: confirmedClaims.map((claim) => ({
      claim_id: claim.claim_id,
      text: claim.raw_text,
      status: ClaimStatus.CONFIRMED,
      supported_scope: byId.get(claim.claim_id).supported_scope,
      bindings: byId.get(claim.claim_id).support_binding_ids || []
    })),
    unconfirmed: undeterminedClaims.map((claim) => ({
      claim_id: claim.claim_id,
      text: claim.raw_text,
      status: ClaimStatus.UNDETERMINED,
      reasons: byId.get(claim.claim_id).reasons
    })),
    opinions: [],
    evidence_need: unresolvedEvidence,
    evidence_gaps: [...domainEvidence, ...unresolvedEvidence]
  });
}

function riskLane(claims, results, task, domain) {
  const byId = resultMap(results);
  const criticalIds = new Set((task.critical_target_ids || []).map(String));
  const targets = claims.filter((claim) => criticalIds.has(claim.claim_id));
  const riskEntries = lensPlanEntries(domain, 'risk');
  const hardBlockers = task.hard_blockers || [];
  const riskItems = [
    ...riskEntries.map((entry, index) => ({
      key: `lens-risk-${index + 1}`,
      impact: entry.value,
      weight: 20,
      source: 'LENS_PLAN',
      lens_sources: entry.sources
    })),
    ...hardBlockers.map((item, index) => ({
      key: `hard-blocker-${index + 1}`,
      impact: String(item),
      weight: 100,
      source: 'TASK_GRAPH',
      lens_sources: []
    }))
  ];
  const safety = lensPlanEntries(domain, 'safety');
  return deepFreeze({
    lane: 'risk',
    source: 'CANONICAL_RECORDS_PLUS_LENS_PLAN',
    target_count: targets.length,
    confirmed_count: targets.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED).length,
    undetermined_count: targets.filter((claim) => byId.get(claim.claim_id)?.status !== ClaimStatus.CONFIRMED).length,
    target_claim_ids: targets.map((claim) => claim.claim_id).sort(),
    risk_count: riskItems.length,
    risks: riskItems,
    highest: [...riskItems].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))[0] || null,
    hard_constraints: [...(task.constraints || []), ...(task.prohibitions || []), ...(task.preserve || [])],
    safety_gates: [...new Set([...(task.prohibitions || []), ...safety.map((entry) => entry.value)])],
    level: hardBlockers.length ? 'high' : riskItems.length ? 'medium' : 'low'
  });
}

function multiLane(claims, results, domain) {
  const byId = resultMap(results);
  const confirmed = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED);
  const entries = lensPlanEntries(domain, 'multi');
  return deepFreeze({
    lane: 'multi',
    supported_scopes: confirmed.map((claim) => ({ claim_id: claim.claim_id, ...byId.get(claim.claim_id).supported_scope })).sort((a, b) => a.claim_id.localeCompare(b.claim_id)),
    perspectives: entries.map((entry, index) => ({
      id: `lens-perspective-${index + 1}`,
      focus: entry.value,
      source: 'LENS_PLAN',
      lens_sources: entry.sources,
      claim_ids: confirmed.map((claim) => claim.claim_id)
    })),
    trade_off_map: entries.map((entry, index) => ({
      id: `lens-perspective-${index + 1}`,
      dimension: entry.value,
      source: 'LENS_PLAN',
      lens_sources: entry.sources,
      status: 'MATERIAL_ONLY'
    }))
  });
}

function inquiryLane(claims, results, domain) {
  const byId = resultMap(results);
  const open = claims.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.UNDETERMINED).map((claim) => ({
    claim_id: claim.claim_id,
    reasons: byId.get(claim.claim_id).reasons,
    missing_scope_fields: byId.get(claim.claim_id).gate_details?.missing_scope_fields || []
  })).sort((a, b) => a.claim_id.localeCompare(b.claim_id));
  const evidenceNeeds = lensPlanValues(domain, 'evidence');
  const inquiryPrompts = lensPlanValues(domain, 'inquiry');
  return deepFreeze({
    lane: 'inquiry',
    problem_health: {
      healthy: open.length === 0,
      reason: open.length ? 'Canonical Claims remain UNDETERMINED.' : 'Canonical Claims are traceable.'
    },
    open_items: open,
    missing_fields: [...new Set(open.flatMap((item) => item.missing_scope_fields.map((field) => `${item.claim_id}:${field}`)))].sort(),
    missing_questions: [...new Set([...open.flatMap((item) => item.reasons), ...inquiryPrompts, ...evidenceNeeds])].sort(),
    inquiry_lens: inquiryPrompts
  });
}

function compareLane(claims, results, policyByClaimId, domain) {
  const byId = resultMap(results);
  let numerator = 0;
  let denominator = 0;
  const booleans = [];
  for (const claim of claims) {
    const policy = policyByClaimId[claim.claim_id] || policyByClaimId.get?.(claim.claim_id);
    const required = policy?.required_scope_fields || [];
    const confirmed = byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED;
    const known = required.filter((field) => claim[field] !== 'UNKNOWN');
    denominator += required.length;
    if (confirmed) numerator += known.length;
    booleans.push({
      claim_id: claim.claim_id,
      required_scope_defined: required.length > 0,
      all_required_scope_confirmed: confirmed && known.length === required.length
    });
  }
  const dimensions = lensPlanEntries(domain, 'compare');
  return deepFreeze({
    lane: 'compare',
    material_only: true,
    counts: {
      claims: claims.length,
      confirmed: results.filter((result) => result.status === ClaimStatus.CONFIRMED).length,
      undetermined: results.filter((result) => result.status === ClaimStatus.UNDETERMINED).length,
      insufficient_evidence: results.filter((result) => result.reasons.includes(UndeterminedReason.INSUFFICIENT_EVIDENCE)).length,
      conflicts: results.filter((result) => result.reasons.includes(UndeterminedReason.CONFLICT)).length
    },
    coverage: denominator > 0 ? { numerator, denominator, ratio: numerator / denominator } : null,
    scope_booleans: booleans,
    dimensions: dimensions.map((entry) => entry.value),
    dimension_sources: dimensions,
    selected_candidate: null,
    candidate_ranking: [],
    rejected_candidates: [],
    verdict: {
      decision: 'MATERIAL_ONLY',
      reason: 'Astera does not select, rank, recommend, adopt, or reject candidates.'
    }
  });
}

function buildFiveLanes({ claims, results, policyByClaimId, task = {}, domain = {} }) {
  const lensPlan = domain.lens_plan || compileLensPlan(domain);
  const effectiveDomain = { ...domain, lens_plan: lensPlan };
  return deepFreeze({
    lens_plan: lensPlan,
    fact: factLane(claims, results, effectiveDomain),
    risk: riskLane(claims, results, task, effectiveDomain),
    multi: multiLane(claims, results, effectiveDomain),
    inquiry: inquiryLane(claims, results, effectiveDomain),
    compare: compareLane(claims, results, policyByClaimId, effectiveDomain)
  });
}

module.exports = { factLane, riskLane, multiLane, inquiryLane, compareLane, buildFiveLanes };
