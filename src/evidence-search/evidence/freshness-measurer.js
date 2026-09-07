'use strict';

const DEFAULT_WINDOWS_MS = Object.freeze({ REALTIME: 15 * 60_000, FREQUENT: 6 * 60 * 60_000, REVISIONED: 72 * 60 * 60_000, IMMUTABLE: Number.MAX_SAFE_INTEGER });

function parseTime(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : null;
}

function measureFreshness(candidates, plan, policy = {}) {
  const effective = parseTime(plan.effective_as_of) ?? Date.now();
  const policyClass = String(policy.class || 'REVISIONED').toUpperCase();
  const idealWindowMs = Math.max(1, Number(policy.ideal_window_ms || DEFAULT_WINDOWS_MS[policyClass] || DEFAULT_WINDOWS_MS.REVISIONED));
  const staleCeilingMs = Math.max(idealWindowMs, Number(policy.stale_ceiling_ms || idealWindowMs * 2));
  const currentRequired = policy.current_required === true || policyClass === 'REALTIME' || policyClass === 'FREQUENT';
  const measurements = candidates.map((candidate) => {
    const observed = parseTime(candidate.updated_at) ?? parseTime(candidate.published_at);
    const ageMs = observed == null ? null : Math.max(0, effective - observed);
    const pointerVerified = candidate.retrieval_trace?.current_pointer_verified === true || Boolean(candidate.revision_id || candidate.version);
    let state = 'UNKNOWN';
    if (policyClass === 'IMMUTABLE' && candidate.content_hash && (candidate.version || candidate.revision_id)) state = 'IDEAL';
    else if (ageMs != null && ageMs <= idealWindowMs && (!currentRequired || pointerVerified)) state = 'IDEAL';
    else if (ageMs != null && ageMs <= staleCeilingMs && (!currentRequired || pointerVerified)) state = 'WITHIN_CEILING';
    else if (ageMs != null && ageMs <= staleCeilingMs) state = 'METADATA_ONLY';
    else if (ageMs != null) state = 'STALE';
    return Object.freeze({ candidate_id: candidate.candidate_id, observed_at: observed == null ? null : new Date(observed).toISOString(), age_ms: ageMs, current_pointer_verified: pointerVerified, state });
  });
  const states = measurements.map((item) => item.state);
  const overallState = !measurements.length ? 'UNKNOWN'
    : states.every((state) => state === 'IDEAL') ? 'IDEAL'
      : states.every((state) => state === 'IDEAL' || state === 'WITHIN_CEILING') ? 'WITHIN_CEILING'
        : states.some((state) => state === 'STALE') ? 'STALE'
          : 'METADATA_ONLY';
  return Object.freeze({ policy_class: policyClass, current_required: currentRequired, ideal_window_ms: idealWindowMs, stale_ceiling_ms: staleCeilingMs, overall_state: overallState, measurements: Object.freeze(measurements) });
}

module.exports = { DEFAULT_WINDOWS_MS, measureFreshness };
