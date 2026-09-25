'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../quality-completion-evaluator/utils/stable-json');

const REGISTRY_SCHEMA_VERSION = 'astera.evidence-registry.v1';
const ENTRY_SCHEMA_VERSION = 'astera.evidence-registry-entry.v1';
const BINDINGS_SCHEMA_VERSION = 'astera.evidence-bindings.v1';
const BINDING_SCHEMA_VERSION = 'astera.evidence-binding.v1';

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function queryRecords(queryExecution = {}) {
  const records = [];
  for (const phase of ['initial', 'reinforcement']) {
    for (const query of Array.isArray(queryExecution?.[phase]) ? queryExecution[phase] : []) {
      records.push({ phase: phase.toUpperCase(), query });
    }
  }
  return records;
}

function candidateLookup(candidates = []) {
  const lookup = new Map();
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue;
    for (const key of [candidate.candidate_id, candidate.canonical_record_id]) {
      const normalized = String(key || '').trim();
      if (normalized) lookup.set(normalized, candidate);
    }
  }
  return lookup;
}

function buildBindings({ candidates = [], queryExecution = {}, requestId = '' }) {
  const lookup = candidateLookup(candidates);
  const bindings = [];
  const seen = new Set();

  for (const { phase, query } of queryRecords(queryExecution)) {
    for (const providerRecord of Array.isArray(query?.provider_records) ? query.provider_records : []) {
      if (providerRecord?.status !== 'FOUND') continue;
      for (const candidateRecordId of Array.isArray(providerRecord.candidate_record_ids) ? providerRecord.candidate_record_ids : []) {
        const candidate = lookup.get(String(candidateRecordId || '').trim());
        if (!candidate) continue;
        const base = {
          schema_version: BINDING_SCHEMA_VERSION,
          request_id: String(requestId || ''),
          phase,
          query_id: String(query.query_id || ''),
          claim_id: query.claim_id == null ? null : String(query.claim_id),
          query_role: query.role == null ? null : String(query.role),
          relation: 'SUPPORTS_QUERY',
          evidence_id: String(candidate.candidate_id),
          candidate_id: String(candidate.candidate_id),
          canonical_record_id: String(candidate.canonical_record_id || ''),
          provider_id: String(providerRecord.provider_id || candidate.provider_id || ''),
          source_role: String(candidate.source_role || ''),
          source_family_id: String(candidate.source_family_id || ''),
          authority_id: String(candidate.authority_id || ''),
          url: candidate.canonical_locator?.url || null
        };
        const dedupeKey = stableStringify(base);
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        const bindingId = `evb_${sha256(base).slice(0, 24)}`;
        const withId = { ...base, binding_id: bindingId };
        bindings.push(deepFreeze({ ...withId, binding_hash: sha256(withId) }));
      }
    }
  }

  bindings.sort((a, b) => a.binding_id.localeCompare(b.binding_id));
  return Object.freeze(bindings);
}

function buildEntry(candidate, bindings, metadata) {
  const related = bindings.filter((binding) => binding.evidence_id === candidate.candidate_id);
  const base = {
    schema_version: ENTRY_SCHEMA_VERSION,
    evidence_id: String(candidate.candidate_id),
    evidence_type: 'EXTERNAL_RECORD',
    candidate_id: String(candidate.candidate_id),
    source: {
      provider_id: String(candidate.provider_id || ''),
      source_class: String(candidate.source_class || ''),
      source_family_id: String(candidate.source_family_id || ''),
      source_id: String(candidate.source_id || ''),
      capability_id: String(candidate.capability_id || ''),
      canonical_locator: candidate.canonical_locator || null,
      canonical_record_id: String(candidate.canonical_record_id || ''),
      publisher: candidate.publisher || null,
      authority_id: String(candidate.authority_id || ''),
      source_role: String(candidate.source_role || '')
    },
    content: {
      title: String(candidate.title || ''),
      excerpt: String(candidate.excerpt || ''),
      language: String(candidate.language || ''),
      jurisdiction: String(candidate.jurisdiction || ''),
      published_at: candidate.published_at || null,
      updated_at: candidate.updated_at || null,
      version: candidate.version || null,
      revision_id: candidate.revision_id || null,
      content_hash: candidate.content_hash || null,
      fields: candidate.fields || {}
    },
    provenance: {
      request_id: String(metadata.requestId || ''),
      query_plan_hash: String(metadata.queryPlanHash || ''),
      query_ids: [...new Set(related.map((binding) => binding.query_id).filter(Boolean))].sort(),
      claim_ids: [...new Set(related.map((binding) => binding.claim_id).filter(Boolean))].sort(),
      binding_ids: related.map((binding) => binding.binding_id).sort(),
      retrieval_trace: candidate.retrieval_trace || {},
      lineage_fingerprint: candidate.lineage_fingerprint || {},
      collected_at: metadata.executionTime || null,
      effective_as_of: metadata.effectiveAsOf || null
    }
  };
  return deepFreeze({
    ...base,
    integrity: deepFreeze({
      algorithm: 'sha256',
      content_hash: candidate.content_hash || null,
      entry_hash: sha256(base)
    })
  });
}

function emptyEvidenceRegistry() {
  const entries = Object.freeze([]);
  return deepFreeze({ schema_version: REGISTRY_SCHEMA_VERSION, entries, registry_hash: sha256(entries) });
}

function emptyEvidenceBindings() {
  const bindings = Object.freeze([]);
  return deepFreeze({ schema_version: BINDINGS_SCHEMA_VERSION, bindings, bindings_hash: sha256(bindings) });
}

function buildEvidenceRegistry({ candidates = [], queryExecution = {}, requestId = '', queryPlanHash = '', executionTime = null, effectiveAsOf = null } = {}) {
  const bindings = buildBindings({ candidates, queryExecution, requestId });
  const entries = candidates
    .map((candidate) => buildEntry(candidate, bindings, { requestId, queryPlanHash, executionTime, effectiveAsOf }))
    .sort((a, b) => a.evidence_id.localeCompare(b.evidence_id));
  const frozenEntries = Object.freeze(entries);
  const registry = deepFreeze({ schema_version: REGISTRY_SCHEMA_VERSION, entries: frozenEntries, registry_hash: sha256(frozenEntries) });
  const bindingSet = deepFreeze({ schema_version: BINDINGS_SCHEMA_VERSION, bindings, bindings_hash: sha256(bindings) });
  return deepFreeze({ registry, bindings: bindingSet });
}

module.exports = {
  REGISTRY_SCHEMA_VERSION,
  ENTRY_SCHEMA_VERSION,
  BINDINGS_SCHEMA_VERSION,
  BINDING_SCHEMA_VERSION,
  buildEvidenceRegistry,
  emptyEvidenceRegistry,
  emptyEvidenceBindings
};
