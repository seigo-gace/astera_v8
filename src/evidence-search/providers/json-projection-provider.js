'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

const DEFAULT_MAX_RECORDS = 1_000_000;
const DEFAULT_MAX_SEARCH_TEXT_CHARS = 100_000;
const DEFAULT_MAX_CANDIDATE_POOL = 10_000;

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function tokens(value) {
  return [...new Set(
    normalize(value)
      .split(/[^\p{L}\p{N}+#.\-]+/u)
      .filter((token) => token.length >= 2)
  )];
}

function trigrams(value) {
  const text = `  ${normalize(value)}  `;
  const grams = new Set();
  for (let index = 0; index <= text.length - 3; index += 1) {
    grams.add(text.slice(index, index + 3));
  }
  return grams;
}

function trigramSimilaritySets(left, right) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const gram of left) if (right.has(gram)) intersection += 1;
  return (2 * intersection) / (left.size + right.size);
}

function trigramSimilarity(left, right) {
  return trigramSimilaritySets(trigrams(left), trigrams(right));
}

function loadRecords(options) {
  if (Array.isArray(options.records)) return options.records;
  if (!options.filePath) return [];
  const raw = fs.readFileSync(options.filePath, 'utf8');
  if (options.filePath.endsWith('.jsonl')) {
    return raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : parsed.records || [];
}

function addToIndex(index, key, recordIndex) {
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(recordIndex);
}

function recordText(record, maximumChars) {
  return normalize([
    record.title,
    record.excerpt,
    record.text,
    ...(record.aliases || []),
    ...(record.identifiers || []),
    ...Object.values(record.fields || {})
  ].join(' ')).slice(0, maximumChars);
}

function buildIndex(rawRecords, options) {
  const maximumRecords = Math.max(1, Number(options.maximumRecords || DEFAULT_MAX_RECORDS));
  if (rawRecords.length > maximumRecords) {
    const error = new Error(`projection contains ${rawRecords.length} records; maximum is ${maximumRecords}`);
    error.code = 'PROJECTION_RECORD_LIMIT_EXCEEDED';
    throw error;
  }

  const maximumChars = Math.max(
    1024,
    Number(options.maximumSearchTextChars || DEFAULT_MAX_SEARCH_TEXT_CHARS)
  );
  const records = [];
  const tokenIndex = new Map();
  const trigramIndex = new Map();
  const exactIndex = new Map();

  for (const [index, rawRecord] of rawRecords.entries()) {
    if (!rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) continue;
    const text = recordText(rawRecord, maximumChars);
    if (!text) continue;
    const recordTokens = new Set(tokens(text));
    const recordTrigrams = trigrams(text);
    const document = Object.freeze({
      record: rawRecord,
      original_index: index,
      search_text: text,
      tokens: recordTokens,
      trigrams: recordTrigrams
    });
    const documentIndex = records.length;
    records.push(document);
    addToIndex(exactIndex, text, documentIndex);
    for (const token of recordTokens) addToIndex(tokenIndex, token, documentIndex);
    for (const gram of recordTrigrams) addToIndex(trigramIndex, gram, documentIndex);
  }

  for (const index of [tokenIndex, trigramIndex, exactIndex]) {
    for (const values of index.values()) Object.freeze(values);
  }

  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify(rawRecords.map((record) => [
      record.canonical_record_id || record.id || '',
      record.revision_id || record.version || '',
      record.content_hash || ''
    ])))
    .digest('hex');

  return Object.freeze({
    records: Object.freeze(records),
    token_index: tokenIndex,
    trigram_index: trigramIndex,
    exact_index: exactIndex,
    source_record_count: rawRecords.length,
    indexed_record_count: records.length,
    fingerprint
  });
}

function candidateIndexes(index, queryTexts, maximumPool) {
  const scores = new Map();
  function hit(recordIndex, weight) {
    scores.set(recordIndex, (scores.get(recordIndex) || 0) + weight);
  }

  for (const rawQuery of queryTexts) {
    const query = normalize(rawQuery);
    if (!query) continue;
    for (const recordIndex of index.exact_index.get(query) || []) hit(recordIndex, 10_000);
    for (const token of tokens(query)) {
      for (const recordIndex of index.token_index.get(token) || []) hit(recordIndex, 100);
    }
    for (const gram of trigrams(query)) {
      for (const recordIndex of index.trigram_index.get(gram) || []) hit(recordIndex, 1);
    }
  }

  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .slice(0, maximumPool)
    .map(([recordIndex]) => recordIndex);
}

function scoreDocument(document, queryTexts, domainId) {
  const record = document.record;
  const declaredDomain = record.domain_id || record.fields?.domain_id;
  if (declaredDomain && String(declaredDomain).toUpperCase() !== domainId) return -1;

  let score = 0;
  for (const queryText of queryTexts) {
    const query = normalize(queryText);
    if (!query) continue;
    if (document.search_text === query) score += 1000;
    else if (document.search_text.includes(query)) score += 600;
    else {
      const queryTokens = tokens(query);
      score += queryTokens.filter((token) => document.tokens.has(token)).length * 100;
      score += Math.floor(
        trigramSimilaritySets(document.trigrams, trigrams(query)) * 200
      );
    }
  }
  if (record.source_role === 'OFFICIAL' || record.source_role === 'PRIMARY') score += 50;
  if (record.revision_id || record.version) score += 10;
  return score;
}

function createJsonProjectionProvider(options = {}) {
  const providerId = String(options.provider_id || 'json-projection');
  const sourceClass = String(options.source_class || 'FREE_PROJECTION').toUpperCase();
  const sourceFamilyId = String(options.source_family_id || providerId);
  const maximumCandidatePool = Math.max(
    100,
    Number(options.maximumCandidatePool || DEFAULT_MAX_CANDIDATE_POOL)
  );
  let cache = null;
  let cacheMtime = null;

  function currentIndex() {
    if (Array.isArray(options.records)) {
      if (!cache) cache = buildIndex(options.records, options);
      return cache;
    }
    const stat = fs.statSync(options.filePath);
    if (!cache || cacheMtime !== stat.mtimeMs) {
      cache = buildIndex(loadRecords(options), options);
      cacheMtime = stat.mtimeMs;
    }
    return cache;
  }

  return Object.freeze({
    provider_id: providerId,
    source_class: sourceClass,
    source_family_id: sourceFamilyId,
    priority: Number.isInteger(options.priority) ? options.priority : 100,
    domains: Object.freeze([...(options.domains || [])]),
    capabilities: Object.freeze([...(options.capabilities || [])]),
    latency_p50_ms: Number(options.latency_p50_ms || 10),
    latency_p95_ms: Number(options.latency_p95_ms || 50),
    maximum_cost_minor: 0,
    certified: options.certified !== false,

    async search(plan) {
      const startedAt = Date.now();
      const queryTexts = (plan.query_set || []).map((query) => query.text);
      const index = currentIndex();
      const indexes = candidateIndexes(index, queryTexts, maximumCandidatePool);
      const ranked = indexes
        .map((recordIndex) => ({
          document: index.records[recordIndex],
          score: scoreDocument(index.records[recordIndex], queryTexts, plan.domain_lens.id)
        }))
        .filter((entry) => entry.score > 0)
        .sort((left, right) =>
          right.score - left.score
          || String(
            left.document.record.canonical_record_id
            || left.document.record.id
            || left.document.original_index
          ).localeCompare(String(
            right.document.record.canonical_record_id
            || right.document.record.id
            || right.document.original_index
          ))
        )
        .slice(0, plan.maximum_results)
        .map(({ document }) => ({
          ...document.record,
          source_family_id: document.record.source_family_id || sourceFamilyId,
          capability_id: document.record.capability_id || 'projection_search',
          retrieval_trace: {
            ...(document.record.retrieval_trace || {}),
            provider_id: providerId,
            query_plan_hash: plan.query_plan_hash,
            projection_fingerprint: index.fingerprint,
            current_pointer_verified:
              document.record.retrieval_trace?.current_pointer_verified === true
          }
        }));

      return Object.freeze({
        coverage_state: 'COMPLETE_FOR_QUERY_SCOPE',
        candidates: Object.freeze(ranked),
        usage: Object.freeze({
          requests: 1,
          results: ranked.length,
          records_indexed: index.indexed_record_count,
          candidate_records_scored: indexes.length,
          duration_ms: Date.now() - startedAt
        }),
        provider_pricing: null
      });
    },

    describe() {
      const index = currentIndex();
      return Object.freeze({
        provider_id: providerId,
        source_class: sourceClass,
        source_family_id: sourceFamilyId,
        source_record_count: index.source_record_count,
        indexed_record_count: index.indexed_record_count,
        projection_fingerprint: index.fingerprint
      });
    }
  });
}

module.exports = {
  buildIndex,
  candidateIndexes,
  createJsonProjectionProvider,
  normalize,
  tokens,
  trigrams,
  trigramSimilarity
};
