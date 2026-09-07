'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { stableStringify } = require('../utils/stable-json');

const PROFILE_PATH = path.join(__dirname, 'profiles.v1.json');
let cachedProfiles = null;

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function loadProfiles() {
  if (cachedProfiles) return cachedProfiles;
  const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
  const weights = profile.criterion_weights || {};
  const total = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0);
  if (total !== 10_000) throw Object.assign(new Error('information quality criterion weights must total 10000'), { code: 'INFORMATION_PROFILE_INVALID' });
  for (let i = 1; i <= 38; i += 1) {
    const id = `G${String(i).padStart(2, '0')}`;
    if (!profile.domain_profile_map?.[id]) throw Object.assign(new Error(`missing domain profile: ${id}`), { code: 'INFORMATION_PROFILE_INVALID' });
  }
  cachedProfiles = Object.freeze({ ...profile, profile_hash: sha256(profile) });
  return cachedProfiles;
}

function resolveProfile(request, profiles) {
  const domainId = String(request.domain_lens?.id || '').toUpperCase();
  const groupId = profiles.domain_profile_map[domainId];
  if (!groupId || !profiles.profile_groups[groupId]) throw Object.assign(new Error(`unsupported domain profile: ${domainId}`), { code: 'INFORMATION_PROFILE_INVALID' });
  let resolved = { ...profiles.profile_groups[groupId], group_id: groupId };
  for (const overlayId of request.overlays || []) {
    const overlay = profiles.overlay_profiles?.[overlayId];
    if (!overlay) continue;
    if (overlay.profile_group && profiles.profile_groups[overlay.profile_group]) resolved = { ...resolved, ...profiles.profile_groups[overlay.profile_group], group_id: overlay.profile_group };
    resolved = {
      ...resolved,
      ...overlay,
      freshness_policy: { ...(resolved.freshness_policy || {}), ...(overlay.freshness_policy || {}) },
      required_source_roles: [...new Set([...(resolved.required_source_roles || []), ...(overlay.required_source_roles || [])])]
    };
  }
  return Object.freeze(resolved);
}

function scoreAccuracy(request, blocking) {
  const conditions = request.conditions || [];
  const measurements = new Map((request.measurements?.conditions || []).map((item) => [item.condition_id, item]));
  const groups = { CORE: [], REQUIRED_CONTEXT: [], OPTIONAL: [] };
  for (const condition of conditions) if (groups[condition.class]) groups[condition.class].push(condition);
  if (!groups.CORE.length) blocking.push('NO_CORE_CONDITION');
  const section = (className, max) => {
    const items = groups[className];
    if (!items.length) return max;
    let confirmed = 0;
    for (const condition of items) {
      const measured = measurements.get(condition.condition_id);
      if (measured?.status === 'CONFIRMED') confirmed += 1;
      if (className === 'CORE' && measured?.status === 'CONTRADICTED') blocking.push('CORE_CONDITION_CONTRADICTED');
    }
    return Math.floor(max * confirmed / items.length);
  };
  return section('CORE', 1750) + section('REQUIRED_CONTEXT', 500) + section('OPTIONAL', 250);
}

function completenessRatio(candidates, predicate) {
  if (!candidates.length) return 0;
  const count = candidates.filter(predicate).length;
  if (count === candidates.length) return 1;
  if (count > 0) return 0.5;
  return 0;
}

function scoreProvenance(candidates) {
  const rules = [
    [500, (c) => c.canonical_locator?.replayable === true],
    [300, (c) => Boolean(c.authority_id || c.publisher?.id || c.publisher?.name)],
    [250, (c) => Boolean(c.canonical_record_id)],
    [250, (c) => Boolean(c.content_hash)],
    [200, (c) => Boolean(c.revision_id || c.version)],
    [150, (c) => c.retrieval_trace && Object.keys(c.retrieval_trace).length > 0],
    [150, (c) => c.rights && Object.keys(c.rights).length > 0]
  ];
  return rules.reduce((sum, [max, predicate]) => sum + Math.floor(max * completenessRatio(candidates, predicate)), 0);
}

function scoreSuitability(request, candidates, profile, blocking) {
  if (!candidates.length) return 0;
  const requiredRoles = profile.required_source_roles || [];
  const roleMatches = candidates.filter((candidate) => ['PRIMARY', 'OFFICIAL'].includes(candidate.source_role)).length;
  const sourceRole = requiredRoles.length
    ? (requiredRoles.every((role) => candidates.some((candidate) => candidate.source_role === role)) ? 400 : 0)
    : (roleMatches ? 400 : 300);
  if (requiredRoles.length && sourceRole === 0) blocking.push('REQUIRED_SOURCE_ROLE_MISSING');
  const domain = candidates.every((candidate) => !candidate.fields?.domain_id || String(candidate.fields.domain_id).toUpperCase() === request.domain_lens.id) ? 300 : 0;
  const requestedJurisdictions = request.jurisdictions || [];
  const jurisdiction = !requestedJurisdictions.length ? 200 : candidates.some((candidate) => requestedJurisdictions.includes(candidate.jurisdiction)) ? 200 : 0;
  const temporal = request.measurements?.freshness?.overall_state === 'STALE' ? 0 : 150;
  const contentType = candidates.every((candidate) => candidate.title || candidate.excerpt) ? 100 : 0;
  const language = candidates.every((candidate) => candidate.language || candidate.retrieval_trace?.translation_trace) ? 50 : 25;
  return sourceRole + domain + jurisdiction + temporal + contentType + language;
}

function scoreCorroboration(request, profile) {
  const lineage = request.measurements?.lineage || {};
  const phase = String(request.phase || 'INITIAL').toUpperCase();
  const added = Number(request.new_corroboration_count || 0);
  if (profile.corroboration_mode === 'AUTHORITY_MULTI_RECORD_REQUIRED') {
    const records = Number(lineage.distinct_official_record_count ?? lineage.origin_count ?? 0);
    if (phase === 'FINAL' && added >= 1 && records >= 2) return 2000;
    if (records >= 2) return 1800;
    if (records === 1) return 1000;
    return 0;
  }
  const independent = Number(lineage.independent_origin_count || 0);
  if (phase === 'FINAL' && added >= 1 && independent >= 2) return 2000;
  if (independent >= 3) return 1800;
  if (independent >= 2) return 1600;
  if (independent === 1) return 1000;
  return 0;
}

function scoreFreshness(request, profile, blocking) {
  const state = request.measurements?.freshness?.overall_state || 'UNKNOWN';
  const currentRequired = request.measurements?.freshness?.current_required === true || profile.freshness_policy?.current_required === true;
  if (state === 'IDEAL') return 1500;
  if (state === 'WITHIN_CEILING') return 1200;
  if (state === 'METADATA_ONLY') return 900;
  if (state === 'STALE' && currentRequired) blocking.push('STALE_CURRENT_EVIDENCE');
  return 0;
}

function scoreConflictCoverage(request, blocking) {
  const coverage = request.measurements?.coverage || {};
  const registry = coverage.registry_coverage_state === 'COMPLETE_FOR_ACTIVE_REGISTRY' ? 400
    : coverage.registry_coverage_state === 'PARTIAL_ACTIVE_REGISTRY' ? 200 : 0;
  const discovery = coverage.discovery_scope_state === 'COMPLETE_FOR_QUERY_SCOPE' ? 300
    : coverage.discovery_scope_state === 'PARTIAL_FOR_QUERY_SCOPE' ? 150 : 0;
  const conflict = request.measurements?.conflict?.highest_severity || 'NONE';
  let conflictScore = 0;
  if (conflict === 'NONE') conflictScore = 300;
  else if (conflict === 'CONTEXTUAL') conflictScore = 250;
  else if (conflict === 'MINOR') conflictScore = 200;
  else if (conflict === 'MAJOR') blocking.push('MAJOR_CONFLICT_UNRESOLVED');
  else if (conflict === 'CRITICAL') blocking.push('CRITICAL_CONFLICT_UNRESOLVED');
  return registry + discovery + conflictScore;
}

function evaluateInformationQuality(request) {
  try {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw Object.assign(new Error('information quality request must be an object'), { code: 'INVALID_INFORMATION_QUALITY_REQUEST' });
    const profiles = loadProfiles();
    const profile = resolveProfile(request, profiles);
    const candidates = Array.isArray(request.candidates) ? request.candidates : [];
    const blocking = [];
    if (!candidates.length) blocking.push('NO_EVIDENCE_CANDIDATE');
    const scores = {
      accuracy: scoreAccuracy(request, blocking),
      provenance: scoreProvenance(candidates),
      suitability: scoreSuitability(request, candidates, profile, blocking),
      corroboration: scoreCorroboration(request, profile),
      freshness: scoreFreshness(request, profile, blocking),
      conflict_coverage: scoreConflictCoverage(request, blocking)
    };
    const total = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const phase = String(request.phase || 'INITIAL').toUpperCase();
    const gates = profiles.gates;
    let status;
    if (blocking.length) status = 'REJECTED_BLOCKING';
    else if (phase === 'INITIAL') status = total >= gates.initial_minimum_bp ? 'REINFORCEMENT_REQUIRED' : 'REJECTED_INITIAL_QUALITY';
    else if (Number(request.reinforcement_attempt_count || 0) !== 1) status = 'REJECTED_REINFORCEMENT_COUNT';
    else if (gates.additional_evidence_required && Number(request.new_corroboration_count || 0) < 1) status = 'REJECTED_NO_ADDITIONAL_EVIDENCE';
    else status = total >= gates.final_minimum_bp ? 'FINAL_VALID' : 'REJECTED_FINAL_QUALITY';
    const result = {
      schema_version: 'astera.information-quality-result.v1',
      phase,
      status,
      score_bp: total,
      criterion_scores: scores,
      blocking_reasons: [...new Set(blocking)].sort(),
      profile_version: profiles.profile_version,
      profile_hash: profiles.profile_hash,
      profile_group: profile.group_id,
      gates: { initial_minimum_bp: gates.initial_minimum_bp, final_minimum_bp: gates.final_minimum_bp }
    };
    return Object.freeze({ ...result, result_hash: sha256(result) });
  } catch (error) {
    return Object.freeze({ schema_version: 'astera.information-quality-result.v1', phase: String(request?.phase || 'INITIAL').toUpperCase(), status: 'ERROR', score_bp: 0, criterion_scores: {}, blocking_reasons: [error.code || 'INFORMATION_QUALITY_ERROR'], error: error.message });
  }
}

module.exports = { evaluateInformationQuality, loadInformationQualityProfiles: loadProfiles };
