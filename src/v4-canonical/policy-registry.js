'use strict';

const { ClaimOrigin, Modality, deepFreeze } = require('./core');

const QUERY_ROLES = Object.freeze({
  OFFICIAL: 'OFFICIAL',
  PRIMARY: 'PRIMARY',
  INDEPENDENT: 'INDEPENDENT',
  VERSION: 'VERSION',
  COUNTER: 'COUNTER',
  NUMERIC_LOWER: 'NUMERIC_LOWER',
  NUMERIC_UPPER: 'NUMERIC_UPPER',
  NUMERIC_ALTERNATE: 'NUMERIC_ALTERNATE'
});
const VERIFIABLE = Object.freeze([
  Modality.OBSERVED,
  Modality.PAST_FACT,
  Modality.REPORTED_PLAN,
  Modality.CONDITIONAL_RULE
]);

function known(value) {
  return value !== null
    && value !== undefined
    && String(value).trim() !== ''
    && String(value).trim().toUpperCase() !== 'UNKNOWN';
}

function policyForClaim(claim) {
  if (claim.claim_origin === ClaimOrigin.ATTRIBUTED_ASSERTION) {
    return deepFreeze({ claim_policy_id: 'POLICY_ATTRIBUTION', external_search_required: false, planned_query_roles: [], required_scope_fields: ['subject', 'predicate'], verifiable_modalities: [Modality.OBSERVED], verification_line: 'ATTRIBUTED_ASSERTION_LINE', independence_requirement: 'LOCAL_INPUT_ONLY', allowed_evidence_sources: ['LOCAL_INPUT_EVIDENCE'], confirmable_origin_scope: 'ATTRIBUTION_ONLY' });
  }
  if (claim.claim_origin === ClaimOrigin.CODE_STRUCTURE) {
    return deepFreeze({ claim_policy_id: 'POLICY_CODE_STRUCTURE', external_search_required: false, planned_query_roles: [], required_scope_fields: ['subject', 'predicate'], verifiable_modalities: [Modality.OBSERVED], verification_line: 'CODE_STRUCTURE_LINE', independence_requirement: 'LOCAL_INPUT_ONLY', allowed_evidence_sources: ['LOCAL_INPUT_EVIDENCE'], confirmable_origin_scope: 'STATIC_STRUCTURE_ONLY' });
  }
  if (claim.claim_origin === ClaimOrigin.LOG_OBSERVATION) {
    return deepFreeze({ claim_policy_id: 'POLICY_LOG_RECORD', external_search_required: false, planned_query_roles: [], required_scope_fields: ['subject', 'predicate'], verifiable_modalities: [Modality.OBSERVED, Modality.PAST_FACT], verification_line: 'LOG_OBSERVATION_LINE', independence_requirement: 'LOCAL_INPUT_ONLY', allowed_evidence_sources: ['LOCAL_INPUT_EVIDENCE'], confirmable_origin_scope: 'RECORDED_EVENT_ONLY' });
  }
  if (claim.claim_origin === ClaimOrigin.TABLE_OBSERVATION) {
    return deepFreeze({ claim_policy_id: 'POLICY_TABLE_VALUE', external_search_required: false, planned_query_roles: [], required_scope_fields: ['subject', 'predicate'], verifiable_modalities: [Modality.OBSERVED], verification_line: 'TABLE_OBSERVATION_LINE', independence_requirement: 'LOCAL_INPUT_ONLY', allowed_evidence_sources: ['LOCAL_INPUT_EVIDENCE'], confirmable_origin_scope: 'RECORDED_VALUE_ONLY' });
  }

  const numeric = claim.claim_policy_id === 'POLICY_NUMERIC_FACT' || /\d/.test(String(claim.object_or_value ?? ''));
  const current = claim.claim_policy_id === 'POLICY_CURRENT_FACT' || known(claim.time_scope);
  const roles = [QUERY_ROLES.OFFICIAL, QUERY_ROLES.PRIMARY, QUERY_ROLES.INDEPENDENT];
  if (current || known(claim.version_scope)) roles.push(QUERY_ROLES.VERSION);
  roles.push(QUERY_ROLES.COUNTER);
  if (numeric) roles.push(QUERY_ROLES.NUMERIC_LOWER, QUERY_ROLES.NUMERIC_UPPER, QUERY_ROLES.NUMERIC_ALTERNATE);

  const requiredScopeFields = ['subject', 'predicate'];
  if (current) requiredScopeFields.push('time_scope');
  if (known(claim.version_scope)) requiredScopeFields.push('version_scope');
  if (known(claim.jurisdiction)) requiredScopeFields.push('jurisdiction');

  return deepFreeze({
    claim_policy_id: numeric ? 'POLICY_NUMERIC_FACT' : current ? 'POLICY_CURRENT_FACT' : 'POLICY_GENERAL_FACT',
    external_search_required: true,
    planned_query_roles: roles,
    required_scope_fields: requiredScopeFields,
    verifiable_modalities: [...VERIFIABLE],
    verification_line: 'NATURAL_LANGUAGE_LINE',
    independence_requirement: 'AUTHORITY_PLUS_INDEPENDENT_OR_TWO_FAMILIES',
    allowed_evidence_sources: ['EXTERNAL_RETRIEVED_EVIDENCE'],
    confirmable_origin_scope: 'EXTERNAL_EVIDENCE_ONLY'
  });
}

module.exports = { QUERY_ROLES, VERIFIABLE, policyForClaim };
