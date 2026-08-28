'use strict';

const {
  createEvidenceBindingId,
  normalizeText,
  parseNaturalStructure,
  parseVersionScheme,
  detectPolarity,
  Polarity,
  deepFreeze
} = require('./core');

const CandidateRelation = Object.freeze({
  SUPPORTS: 'SUPPORTS',
  CONTRADICTS: 'CONTRADICTS',
  PARTIALLY_SUPPORTS: 'PARTIALLY_SUPPORTS',
  NO_MATCH: 'NO_MATCH',
  NOT_RELEVANT_PREFILTER: 'NOT_RELEVANT_PREFILTER'
});
const EvidenceSource = Object.freeze({
  LOCAL_INPUT_EVIDENCE: 'LOCAL_INPUT_EVIDENCE',
  EXTERNAL_RETRIEVED_EVIDENCE: 'EXTERNAL_RETRIEVED_EVIDENCE'
});

function candidateText(candidate) {
  return normalizeText(candidate?.fields?.claim || candidate?.excerpt || candidate?.text || candidate?.content || candidate?.title || '');
}
function fixedContains(haystack, needle) {
  const left = normalizeText(haystack).toLocaleLowerCase('und');
  const right = normalizeText(needle).toLocaleLowerCase('und');
  return Boolean(right) && left.includes(right);
}
function explicitVersionScope(text) {
  const value = normalizeText(text);
  const candidate = value.match(/\bv?\d+(?:\.\d+){0,2}\b|\b\d{4}-\d{2}(?:-\d{2})?\b|\bRev\.?\s*\d+\b/iu)?.[0];
  return candidate ? parseVersionScheme(candidate).normalized : 'UNKNOWN';
}
function candidateClaim(candidate) {
  const text = candidateText(candidate);
  if (!text) return { resolved: false, diagnostic: 'EMPTY_CANDIDATE_TEXT' };
  const structure = parseNaturalStructure(text);
  if (structure.unresolved) return { resolved: false, diagnostic: structure.diagnostic, text };
  return {
    resolved: true,
    ...structure,
    polarity: structure.condition ? Polarity.CONDITIONAL : detectPolarity(text),
    version_scope: explicitVersionScope(text),
    text
  };
}
function sourceSpan(candidate) {
  return candidate?.canonical_locator?.url || candidate?.url || candidate?.canonical_record_id || candidate?.candidate_id || 'UNKNOWN';
}
function bindingBase(claim, candidate, relation, extra = {}) {
  const span = sourceSpan(candidate);
  return deepFreeze({
    evidence_binding_id: createEvidenceBindingId({
      claimId: claim.claim_id,
      candidateId: candidate.candidate_id || candidate.canonical_record_id || span,
      sourceSpan: span,
      relation
    }),
    claim_id: claim.claim_id,
    candidate_id: candidate.candidate_id || candidate.canonical_record_id || span,
    source_span: span,
    relation,
    evidence_source: EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE,
    source_roles: [String(candidate.source_role || 'SECONDARY').toUpperCase()],
    source_family_id: candidate.source_family_id || null,
    authority_id: candidate.authority_id || null,
    provenance_series_id: candidate.provenance_series_id || null,
    ...extra
  });
}

function known(value) {
  return value !== null
    && value !== undefined
    && String(value).trim() !== ''
    && String(value).trim().toUpperCase() !== 'UNKNOWN';
}
function normalizedScope(value) {
  return normalizeText(value).toLocaleLowerCase('und');
}
function sameTimeScope(claimValue, evidenceValue) {
  const claim = normalizedScope(claimValue);
  const evidence = normalizedScope(evidenceValue);
  if (!claim || !evidence) return false;
  if (claim === evidence) return true;
  const claimDate = claim.match(/^\d{4}-\d{2}(?:-\d{2})?/u)?.[0] || null;
  const evidenceDate = evidence.match(/^\d{4}-\d{2}(?:-\d{2})?/u)?.[0] || null;
  if (!claimDate || !evidenceDate) return false;
  return claimDate === evidenceDate
    || (claimDate.length === 7 && evidenceDate.startsWith(claimDate))
    || (evidenceDate.length === 7 && claimDate.startsWith(evidenceDate));
}
function sameCondition(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return normalizedScope(left.subject) === normalizedScope(right.subject)
    && normalizedScope(left.value) === normalizedScope(right.value);
}

function scopeCompatibility(claim, extractedScope, policy = {}, extractedCondition = null) {
  const required = new Set(policy.required_scope_fields || []);
  if (known(claim.version_scope)) required.add('version_scope');
  if (known(claim.jurisdiction)) required.add('jurisdiction');
  if (known(claim.time_scope)) required.add('time_scope');
  const checks = [];

  const compare = (field, matcher = (left, right) => normalizedScope(left) === normalizedScope(right)) => {
    if (!required.has(field)) return;
    const claimValue = claim[field];
    const evidenceValue = extractedScope[field];
    let status;
    if (!known(claimValue)) status = 'CLAIM_SCOPE_UNKNOWN';
    else if (!known(evidenceValue)) status = 'EVIDENCE_SCOPE_UNKNOWN';
    else status = matcher(claimValue, evidenceValue) ? 'MATCH' : 'MISMATCH';
    checks.push({ field, claim_value: claimValue, evidence_value: evidenceValue, status });
  };

  compare('time_scope', sameTimeScope);
  compare('jurisdiction');
  compare('version_scope');

  if (claim.condition) {
    const status = !extractedCondition
      ? 'EVIDENCE_SCOPE_UNKNOWN'
      : sameCondition(claim.condition, extractedCondition) ? 'MATCH' : 'MISMATCH';
    checks.push({ field: 'condition', claim_value: claim.condition, evidence_value: extractedCondition, status });
  }

  const reasons = checks
    .filter((check) => check.status !== 'MATCH')
    .map((check) => `${check.status}:${check.field}`);
  return deepFreeze({
    compatible: reasons.length === 0,
    checks,
    reasons
  });
}

function bindExternalCandidate(claim, candidate, policy = {}) {
  const extracted = candidateClaim(candidate);
  if (!extracted.resolved) {
    return bindingBase(claim, candidate, CandidateRelation.NO_MATCH, {
      parse_unresolved: true,
      reasons: ['PARSE_UNRESOLVED'],
      diagnostics: [extracted.diagnostic]
    });
  }

  const raw = candidateText(candidate);
  const subjectMatch = claim.subject !== 'UNKNOWN' && fixedContains(raw, claim.subject);
  const predicateMatch = claim.predicate === 'VERIFICATION_TARGET'
    || claim.predicate === 'STATED_CONTENT'
    || fixedContains(raw, claim.predicate)
    || normalizeText(extracted.predicate) === normalizeText(claim.predicate);
  const objectKnown = claim.object_or_value !== 'UNKNOWN' && claim.object_or_value !== null;
  const objectMatch = !objectKnown || fixedContains(raw, String(claim.object_or_value));
  const exactRaw = fixedContains(raw, claim.raw_text);
  const polarityMatch = claim.polarity === extracted.polarity
    || claim.polarity === 'UNKNOWN'
    || extracted.polarity === 'UNKNOWN';

  let semanticRelation = CandidateRelation.NO_MATCH;
  if (exactRaw || (subjectMatch && predicateMatch && objectMatch && polarityMatch)) {
    semanticRelation = CandidateRelation.SUPPORTS;
  } else if (subjectMatch && predicateMatch && objectKnown && !objectMatch && claim.polarity !== extracted.polarity) {
    semanticRelation = CandidateRelation.CONTRADICTS;
  }

  const extractedScope = {
    subject: extracted.subject,
    property: extracted.predicate,
    time_scope: candidate.updated_at || candidate.published_at || 'UNKNOWN',
    jurisdiction: candidate.jurisdiction || candidate.fields?.jurisdiction || 'UNKNOWN',
    version_scope: candidate.version || candidate.fields?.version || extracted.version_scope || 'UNKNOWN'
  };
  const scope = scopeCompatibility(claim, extractedScope, policy, extracted.condition || null);
  const relation = semanticRelation !== CandidateRelation.NO_MATCH && !scope.compatible
    ? CandidateRelation.PARTIALLY_SUPPORTS
    : semanticRelation;

  return bindingBase(claim, candidate, relation, {
    extracted_subject: extracted.subject,
    extracted_predicate: extracted.predicate,
    extracted_object_or_value: extracted.object_or_value,
    extracted_polarity: extracted.polarity,
    extracted_condition: extracted.condition || null,
    extracted_scope: extractedScope,
    scope_compatibility: scope,
    parse_unresolved: false,
    reasons: scope.reasons,
    diagnostics: []
  });
}

function localBinding(claim) {
  if (claim.verification_line?.passed !== true) return null;
  const relation = CandidateRelation.SUPPORTS;
  const span = claim.canonical_source_position || `${claim.source_span?.start ?? 0}:${claim.source_span?.end ?? 0}`;
  const candidateId = `local:${claim.fragment_id}`;
  return deepFreeze({
    evidence_binding_id: createEvidenceBindingId({ claimId: claim.claim_id, candidateId, sourceSpan: span, relation }),
    claim_id: claim.claim_id,
    candidate_id: candidateId,
    source_span: span,
    relation,
    evidence_source: EvidenceSource.LOCAL_INPUT_EVIDENCE,
    source_roles: ['LOCAL'],
    source_family_id: `local:${claim.fragment_id}`,
    authority_id: null,
    parse_unresolved: false,
    reasons: [],
    diagnostics: []
  });
}

function bindClaimEvidence(claim, policy, rawEvidence) {
  if (!policy.external_search_required) {
    const local = localBinding(claim);
    return deepFreeze({ bindings: local ? [local] : [], candidate_by_id: new Map() });
  }
  const candidates = Array.isArray(rawEvidence?.evidence) ? rawEvidence.evidence : [];
  const bindings = candidates.map((candidate) => bindExternalCandidate(claim, candidate, policy));
  const candidateById = new Map(candidates.map((candidate) => [
    candidate.candidate_id || candidate.canonical_record_id || sourceSpan(candidate),
    candidate
  ]));
  return deepFreeze({ bindings, candidate_by_id: candidateById });
}

module.exports = {
  CandidateRelation,
  EvidenceSource,
  candidateText,
  candidateClaim,
  scopeCompatibility,
  bindExternalCandidate,
  bindClaimEvidence,
  localBinding
};
