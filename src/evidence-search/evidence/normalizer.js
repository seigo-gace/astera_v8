'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../quality-completion-evaluator/utils/stable-json');

const RETRIEVAL_STATUSES = new Set(['FOUND', 'NOT_FOUND', 'RETRIEVAL_FAILED']);

function sha256(value) {
  return crypto.createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
}

function normalizeCandidate(raw, provider, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const title = String(raw.title || '').normalize('NFKC').trim();
  const excerpt = String(raw.excerpt || raw.text || raw.content || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const canonicalUrl = String(raw.canonical_url || raw.url || raw.locator?.url || '').trim();
  const canonicalRecordId = String(raw.canonical_record_id || raw.record_id || raw.id || canonicalUrl || sha256({ title, excerpt })).trim();
  const contentHash = String(raw.content_hash || (excerpt ? sha256(excerpt) : '')).trim();
  const candidateId = String(raw.candidate_id || `evc_${sha256({ provider: provider.provider_id, canonicalRecordId, contentHash, index }).slice(0, 24)}`);
  return Object.freeze({
    schema_version: 'astera.evidence-candidate.v1',
    candidate_id: candidateId,
    provider_id: provider.provider_id,
    source_class: provider.source_class,
    source_family_id: String(raw.source_family_id || provider.source_family_id),
    source_id: String(raw.source_id || provider.provider_id),
    capability_id: String(raw.capability_id || 'search'),
    canonical_locator: Object.freeze({ url: canonicalUrl || null, locator_type: String(raw.locator_type || (canonicalUrl ? 'URL' : 'RECORD_ID')), replayable: raw.locator_replayable !== false && Boolean(canonicalUrl || canonicalRecordId) }),
    canonical_record_id: canonicalRecordId,
    official_record_discriminator: Object.freeze({ ...(raw.official_record_discriminator || {}) }),
    publisher: Object.freeze({ id: String(raw.publisher_id || raw.publisher?.id || raw.authority_id || ''), name: String(raw.publisher_name || raw.publisher?.name || '') }),
    authority_id: String(raw.authority_id || raw.publisher_id || raw.publisher?.id || ''),
    source_role: String(raw.source_role || 'SECONDARY').toUpperCase(),
    title,
    excerpt,
    language: String(raw.language || '').toLowerCase(),
    jurisdiction: String(raw.jurisdiction || '').toUpperCase(),
    published_at: raw.published_at || null,
    updated_at: raw.updated_at || null,
    version: raw.version == null ? null : String(raw.version),
    content_hash: contentHash || null,
    revision_id: raw.revision_id == null ? null : String(raw.revision_id),
    retrieval_trace: Object.freeze({ ...(raw.retrieval_trace || {}) }),
    rights: Object.freeze({ ...(raw.rights || {}) }),
    fields: Object.freeze({ ...(raw.fields || {}) }),
    lineage_fingerprint: Object.freeze({
      authority_id: String(raw.lineage_fingerprint?.authority_id || raw.authority_id || ''),
      publisher_id: String(raw.lineage_fingerprint?.publisher_id || raw.publisher_id || raw.publisher?.id || ''),
      origin_record_id: String(raw.lineage_fingerprint?.origin_record_id || canonicalRecordId),
      dataset_id: String(raw.lineage_fingerprint?.dataset_id || ''),
      method_id: String(raw.lineage_fingerprint?.method_id || ''),
      publication_event_id: String(raw.lineage_fingerprint?.publication_event_id || ''),
      upstream_source_ids: Object.freeze([...(raw.lineage_fingerprint?.upstream_source_ids || [])].map(String).sort()),
      content_fingerprint: String(raw.lineage_fingerprint?.content_fingerprint || contentHash || ''),
      normalized_text_fingerprint: String(raw.lineage_fingerprint?.normalized_text_fingerprint || (excerpt ? sha256(excerpt.toLowerCase()) : ''))
    }),
    cost: Object.freeze({ class: provider.source_class === 'PAID_PROVIDER' ? 'PAID' : 'FREE', provider_operation_id: raw.provider_operation_id || null, usage: Object.freeze({ ...(raw.usage || {}) }), provider_pricing: raw.provider_pricing ? Object.freeze({ ...raw.provider_pricing }) : null })
  });
}

function normalizeQueryResults(result, provider) {
  const rawResults = Array.isArray(result?.query_results) ? result.query_results : [];
  return Object.freeze(rawResults.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      const error = new Error(`query_results[${index}] must be an object`);
      error.code = 'PROVIDER_QUERY_RESULT_INVALID';
      throw error;
    }
    const queryId = String(item.query_id || '').trim();
    const retrievalStatus = String(item.retrieval_status || '').toUpperCase();
    if (!queryId || !RETRIEVAL_STATUSES.has(retrievalStatus)) {
      const error = new Error(`query_results[${index}] is incomplete`);
      error.code = 'PROVIDER_QUERY_RESULT_INVALID';
      throw error;
    }
    return Object.freeze({
      query_id: queryId,
      provider_id: provider.provider_id,
      source_class: provider.source_class,
      retrieval_status: retrievalStatus,
      candidate_record_ids: Object.freeze([...(item.candidate_record_ids || [])].map(String).filter(Boolean).sort()),
      error_code: item.error_code == null ? null : String(item.error_code),
      endpoint_count: Number.isInteger(item.endpoint_count) ? item.endpoint_count : null,
      completed_endpoint_count: Number.isInteger(item.completed_endpoint_count) ? item.completed_endpoint_count : null
    });
  }));
}

function normalizeProviderResult(result, provider) {
  const rawCandidates = Array.isArray(result) ? result : Array.isArray(result?.candidates) ? result.candidates : [];
  const candidates = rawCandidates.map((raw, index) => normalizeCandidate(raw, provider, index)).filter(Boolean);
  return Object.freeze({
    provider_id: provider.provider_id,
    source_class: provider.source_class,
    coverage_state: String(result?.coverage_state || 'PARTIAL_FOR_QUERY_SCOPE'),
    current_watermark: result?.current_watermark || null,
    usage: Object.freeze({ ...(result?.usage || {}) }),
    provider_pricing: result?.provider_pricing ? Object.freeze({ ...result.provider_pricing }) : null,
    query_results: normalizeQueryResults(result, provider),
    candidates: Object.freeze(candidates)
  });
}

module.exports = { RETRIEVAL_STATUSES, normalizeCandidate, normalizeProviderResult, normalizeQueryResults };
