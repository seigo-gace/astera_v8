'use strict';

function candidateKey(candidate) {
  return [candidate.canonical_record_id || '', candidate.content_hash || '', candidate.lineage_fingerprint?.normalized_text_fingerprint || ''].join('|');
}

function rank(candidate) {
  let score = 0;
  if (candidate.source_role === 'PRIMARY' || candidate.source_role === 'OFFICIAL') score += 100;
  if (candidate.canonical_locator?.replayable) score += 30;
  if (candidate.content_hash) score += 20;
  if (candidate.revision_id || candidate.version) score += 10;
  if (candidate.updated_at || candidate.published_at) score += 5;
  if (candidate.cost?.class === 'FREE') score += 1;
  return score;
}

function deduplicateCandidates(candidates) {
  const byKey = new Map();
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const existing = byKey.get(key);
    if (!existing || rank(candidate) > rank(existing)) byKey.set(key, candidate);
  }
  return [...byKey.values()].sort((a, b) => rank(b) - rank(a) || a.candidate_id.localeCompare(b.candidate_id));
}

module.exports = { deduplicateCandidates };
