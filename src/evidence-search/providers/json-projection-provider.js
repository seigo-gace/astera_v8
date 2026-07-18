'use strict';

const fs = require('node:fs');

function normalize(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function trigrams(value) {
  const text = `  ${normalize(value)}  `;
  const grams = new Set();
  for (let i = 0; i <= text.length - 3; i += 1) grams.add(text.slice(i, i + 3));
  return grams;
}

function trigramSimilarity(left, right) {
  const a = trigrams(left);
  const b = trigrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const gram of a) if (b.has(gram)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
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

function scoreRecord(record, queryTexts, domainId) {
  if (record.domain_id && String(record.domain_id).toUpperCase() !== domainId) return -1;
  const haystack = normalize([
    record.title,
    record.excerpt,
    record.text,
    ...(record.aliases || []),
    ...(record.identifiers || []),
    ...Object.values(record.fields || {})
  ].join(' '));
  let score = 0;
  for (const queryText of queryTexts) {
    const query = normalize(queryText);
    if (!query) continue;
    if (haystack === query) score += 1000;
    else if (haystack.includes(query)) score += 600;
    else {
      const words = query.split(' ').filter(Boolean);
      score += words.filter((word) => haystack.includes(word)).length * 100;
      score += Math.floor(trigramSimilarity(haystack, query) * 200);
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
  let cache = null;
  let cacheMtime = null;

  function records() {
    if (Array.isArray(options.records)) return options.records;
    const stat = fs.statSync(options.filePath);
    if (!cache || cacheMtime !== stat.mtimeMs) {
      cache = loadRecords(options);
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
    latency_p95_ms: Number(options.latency_p95_ms || 50),
    maximum_cost_minor: sourceClass === 'PAID_PROVIDER' ? Number(options.maximum_cost_minor || 0) : 0,
    certified: options.certified !== false,

    async search(plan) {
      const queryTexts = (plan.query_set || []).map((query) => query.text);
      const ranked = records()
        .map((record, index) => ({ record, index, score: scoreRecord(record, queryTexts, plan.domain_lens.id) }))
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score || String(a.record.canonical_record_id || a.record.id || a.index).localeCompare(String(b.record.canonical_record_id || b.record.id || b.index)))
        .slice(0, plan.maximum_results)
        .map(({ record }) => ({
          ...record,
          source_family_id: record.source_family_id || sourceFamilyId,
          capability_id: record.capability_id || 'projection_search',
          retrieval_trace: {
            ...(record.retrieval_trace || {}),
            provider_id: providerId,
            query_plan_hash: plan.query_plan_hash,
            current_pointer_verified: record.retrieval_trace?.current_pointer_verified === true
          }
        }));

      return Object.freeze({
        coverage_state: 'COMPLETE_FOR_QUERY_SCOPE',
        candidates: Object.freeze(ranked),
        usage: Object.freeze({
          requests: 1,
          results: ranked.length,
          records_scanned: records().length
        }),
        provider_pricing: options.provider_pricing
          ? Object.freeze({ ...options.provider_pricing })
          : null
      });
    }
  });
}

module.exports = { createJsonProjectionProvider, trigramSimilarity };
