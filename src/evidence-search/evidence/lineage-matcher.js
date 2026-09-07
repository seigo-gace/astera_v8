'use strict';

function sameNonEmpty(a, b) {
  return Boolean(a) && Boolean(b) && a === b;
}

function compareLineage(a, b) {
  const af = a.lineage_fingerprint || {};
  const bf = b.lineage_fingerprint || {};
  if (sameNonEmpty(af.origin_record_id, bf.origin_record_id)) return 'DEPENDENT';
  if (sameNonEmpty(af.normalized_text_fingerprint, bf.normalized_text_fingerprint)) return 'DEPENDENT';
  if (sameNonEmpty(af.content_fingerprint, bf.content_fingerprint)) return 'DEPENDENT';
  if (a.source_family_id && b.source_family_id && a.source_family_id === b.source_family_id) return 'PARTIALLY_SHARED';
  if (af.upstream_source_ids?.some((id) => bf.upstream_source_ids?.includes(id))) return 'PARTIALLY_SHARED';
  if (sameNonEmpty(af.dataset_id, bf.dataset_id) || sameNonEmpty(af.method_id, bf.method_id)) return 'PARTIALLY_SHARED';
  if (af.authority_id && bf.authority_id && af.publisher_id && bf.publisher_id) {
    if (af.authority_id !== bf.authority_id && af.publisher_id !== bf.publisher_id) return 'INDEPENDENT';
    return 'PARTIALLY_SHARED';
  }
  return 'UNKNOWN';
}

function analyzeLineage(candidates) {
  const pairs = [];
  const independentGraph = new Map(candidates.map((candidate) => [candidate.candidate_id, new Set()]));
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const status = compareLineage(candidates[i], candidates[j]);
      pairs.push({ left: candidates[i].candidate_id, right: candidates[j].candidate_id, status });
      if (status === 'INDEPENDENT') {
        independentGraph.get(candidates[i].candidate_id).add(candidates[j].candidate_id);
        independentGraph.get(candidates[j].candidate_id).add(candidates[i].candidate_id);
      }
    }
  }
  const origins = new Set(candidates.map((candidate) => candidate.lineage_fingerprint?.origin_record_id || candidate.canonical_record_id).filter(Boolean));
  const authorities = new Set(candidates.map((candidate) => candidate.authority_id).filter(Boolean));
  const sourceFamilies = new Set(candidates.map((candidate) => candidate.source_family_id).filter(Boolean));
  let independentOriginCount = candidates.length ? 1 : 0;
  if ([...independentGraph.values()].some((set) => set.size > 0)) {
    independentOriginCount = Math.min(candidates.length, Math.max(2, authorities.size));
  }
  return Object.freeze({
    pair_measurements: Object.freeze(pairs),
    origin_count: origins.size,
    authority_count: authorities.size,
    source_family_count: sourceFamilies.size,
    independent_origin_count: independentOriginCount
  });
}

module.exports = { analyzeLineage, compareLineage };
