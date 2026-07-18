'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../quality-completion-evaluator/utils/stable-json');

const CONDITION_CLASS_WEIGHTS = Object.freeze({ CORE: 5, REQUIRED_CONTEXT: 3, OPTIONAL: 1 });
const REINFORCEMENT_CLASSES = Object.freeze([
  'ALIAS_VARIANT',
  'IDENTIFIER_LOOKUP',
  'OFFICIAL_RECORD_LOOKUP',
  'SECONDARY_CAPABILITY_LOOKUP',
  'VERSION_HISTORY_LOOKUP',
  'JURISDICTIONAL_CROSSCHECK',
  'INDEPENDENT_ORIGIN_LOOKUP',
  'AUTHORITY_RECORD_LOOKUP'
]);

function sha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function normalizeCondition(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    const error = new Error(`conditions[${index}] must be an object`);
    error.code = 'INVALID_CONDITION';
    throw error;
  }
  const cls = String(raw.class || 'CORE').toUpperCase();
  if (!Object.hasOwn(CONDITION_CLASS_WEIGHTS, cls)) {
    const error = new Error(`conditions[${index}].class is invalid`);
    error.code = 'INVALID_CONDITION_CLASS';
    throw error;
  }
  const field = normalizeText(raw.field || 'text');
  const operator = String(raw.operator || 'CONTAINS').toUpperCase();
  const allowed = new Set(['EQ', 'CONTAINS', 'IN', 'GTE', 'LTE', 'BETWEEN', 'EXISTS']);
  if (!allowed.has(operator)) {
    const error = new Error(`conditions[${index}].operator is invalid`);
    error.code = 'INVALID_CONDITION_OPERATOR';
    throw error;
  }
  return Object.freeze({
    condition_id: normalizeText(raw.condition_id || `condition_${index + 1}`),
    class: cls,
    field,
    operator,
    expected_value: raw.expected_value ?? null,
    normalized_value: typeof raw.expected_value === 'string' ? normalizeText(raw.expected_value).toLowerCase() : raw.expected_value ?? null,
    weight: CONDITION_CLASS_WEIGHTS[cls],
    required: raw.required === undefined ? cls !== 'OPTIONAL' : raw.required === true
  });
}

function compileQueryPlan(payload, context = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('search payload must be an object');
    error.code = 'INVALID_SEARCH_REQUEST';
    throw error;
  }
  const question = normalizeText(payload.question);
  if (!question) {
    const error = new Error('question is required');
    error.code = 'INVALID_SEARCH_REQUEST';
    throw error;
  }
  const domainId = String(payload.domain_lens?.id || 'G01').toUpperCase();
  if (!/^G(?:0[1-9]|[12][0-9]|3[0-8])$/.test(domainId)) {
    const error = new Error('domain_lens.id must be G01-G38');
    error.code = 'INVALID_DOMAIN_LENS';
    throw error;
  }
  const conditions = Array.isArray(payload.conditions) && payload.conditions.length
    ? payload.conditions.map(normalizeCondition)
    : [normalizeCondition({ class: 'CORE', field: 'text', operator: 'CONTAINS', expected_value: question }, 0)];
  if (!conditions.some((item) => item.class === 'CORE')) {
    const error = new Error('at least one CORE condition is required');
    error.code = 'NO_CORE_CONDITION';
    throw error;
  }
  const aliases = [...new Set((payload.aliases || []).map(normalizeText).filter(Boolean))].sort();
  const identifiers = [...new Set((payload.identifiers || []).map(normalizeText).filter(Boolean))].sort();
  const jurisdictions = [...new Set((payload.jurisdictions || []).map((v) => normalizeText(v).toUpperCase()).filter(Boolean))].sort();
  const effectiveAsOf = context.effective_as_of || payload.as_of || context.execution_time || new Date().toISOString();
  const baseQuery = Object.freeze({ query_id: 'primary_1', class: 'PRIMARY', text: question, domain_id: domainId, identifiers, aliases, jurisdictions });
  const reinforcement = [];
  for (const alias of aliases) reinforcement.push({ class: 'ALIAS_VARIANT', text: alias });
  for (const id of identifiers) reinforcement.push({ class: 'IDENTIFIER_LOOKUP', text: id });
  reinforcement.push({ class: 'OFFICIAL_RECORD_LOOKUP', text: question });
  reinforcement.push({ class: 'INDEPENDENT_ORIGIN_LOOKUP', text: question });
  const reinforcementQueries = reinforcement.slice(0, 8).map((query, index) => Object.freeze({
    query_id: `reinforcement_${index + 1}`,
    class: query.class,
    text: normalizeText(query.text),
    domain_id: domainId,
    identifiers,
    aliases,
    jurisdictions
  }));
  const plan = {
    schema_version: 'astera.evidence-search.query-plan.v1',
    question,
    domain_lens: { id: domainId, taxonomy_version: String(payload.domain_lens?.taxonomy_version || '1.0.0') },
    effective_as_of: String(effectiveAsOf),
    conditions,
    primary_query_set: [baseQuery],
    reinforcement_query_set: reinforcementQueries,
    source_policy: {
      free_projection: payload.search?.free_projection !== false,
      free_current: payload.search?.free_current !== false,
      paid_enabled: payload.paid_search?.enabled === true,
      provider_allowlist: [...new Set((payload.provider_allowlist || []).map(normalizeText).filter(Boolean))].sort(),
      provider_denylist: [...new Set((payload.provider_denylist || []).map(normalizeText).filter(Boolean))].sort()
    },
    maximum_results: Math.min(128, Math.max(1, Number(payload.maximum_results || 32))),
    deadline_ms: Math.min(60_000, Math.max(1000, Number(payload.deadline_ms || 8000)))
  };
  return Object.freeze({ ...plan, plan_hash: sha256(plan) });
}

module.exports = { CONDITION_CLASS_WEIGHTS, REINFORCEMENT_CLASSES, compileQueryPlan, normalizeText };
