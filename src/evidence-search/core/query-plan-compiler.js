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
const UPSTREAM_QUERY_ROLES = Object.freeze(new Set([
  'OFFICIAL', 'PRIMARY', 'INDEPENDENT', 'VERSION', 'COUNTER',
  'NUMERIC_LOWER', 'NUMERIC_UPPER', 'NUMERIC_ALTERNATE'
]));

function sha256(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function providerSearchText(text) {
  const normalized = normalizeText(text);
  const cves = [...new Set((normalized.match(/CVE-\d{4}-\d+/gi) || []))];
  if (cves.length) return cves.join(' ');
  const ascii = normalized
    .replace(/VERIFICATION_TARGET/gi, ' ')
    .replace(/\b(VER|OFFICIAL|PRIMARY|COUNTER|\d{3})\b/gi, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (ascii.length >= 3) return ascii;
  return normalized;
}

function integerInRange(value, field, minimum, maximum, fallback) {
  const parsed = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    const error = new Error(`${field} must be an integer from ${minimum} to ${maximum}`);
    error.code = 'INVALID_SEARCH_REQUEST';
    throw error;
  }
  return parsed;
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

const VALID_DOMAIN_LENS_PATTERN = /^G(?:0[1-9]|[12][0-9]|3[0-8])$/;

function resolveDomainLens(payload) {
  const rawLens = payload.domain_lens;
  if (rawLens === undefined || rawLens === null) {
    return { domainId: null, domainLens: null };
  }
  if (typeof rawLens !== 'object' || Array.isArray(rawLens)) {
    const error = new Error('domain_lens must be an object when provided');
    error.code = 'INVALID_DOMAIN_LENS';
    throw error;
  }
  const domainId = String(rawLens.id || '').toUpperCase();
  if (!VALID_DOMAIN_LENS_PATTERN.test(domainId)) {
    const error = new Error('domain_lens.id must be G01-G38');
    error.code = 'INVALID_DOMAIN_LENS';
    throw error;
  }
  const domainLens = {
    id: domainId,
    taxonomy_version: String(rawLens.taxonomy_version || '1.0.0')
  };
  for (const [key, value] of Object.entries(rawLens)) {
    if (key !== 'id' && key !== 'taxonomy_version' && value !== undefined) {
      domainLens[key] = value;
    }
  }
  return { domainId, domainLens };
}

function normalizeUpstreamQueries(payload, domainId) {
  const raw = payload.upstream_search_plan?.queries || payload.preplanned_queries;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const queries = raw.map((query, index) => {
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      const error = new Error(`upstream_search_plan.queries[${index}] must be an object`);
      error.code = 'INVALID_UPSTREAM_SEARCH_PLAN';
      throw error;
    }
    const role = String(query.role || '').toUpperCase();
    const text = normalizeText(query.normalized_query_text || query.text);
    const claimId = normalizeText(query.claim_id);
    if (!UPSTREAM_QUERY_ROLES.has(role) || !text || !claimId) {
      const error = new Error(`upstream_search_plan.queries[${index}] is incomplete`);
      error.code = 'INVALID_UPSTREAM_SEARCH_PLAN';
      throw error;
    }
    return Object.freeze({
      query_id: normalizeText(query.query_id || `upstream_${index + 1}`),
      class: role,
      role,
      claim_id: claimId,
      text: providerSearchText(text) || text,
      domain_id: domainId,
      identifiers: Object.freeze([]),
      aliases: Object.freeze([]),
      jurisdictions: Object.freeze([])
    });
  });
  const byClaim = new Map();
  for (const query of queries) {
    if (!byClaim.has(query.claim_id)) byClaim.set(query.claim_id, new Set());
    byClaim.get(query.claim_id).add(query.role);
  }
  for (const [claimId, roles] of byClaim) {
    if (!roles.has('COUNTER')) {
      const error = new Error(`counter query is mandatory for claim ${claimId}`);
      error.code = 'COUNTER_ROLE_REQUIRED_BY_DESIGN';
      throw error;
    }
  }
  return Object.freeze(queries);
}

function compileQueryPlan(payload, context = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    const error = new Error('search payload must be an object');
    error.code = 'INVALID_SEARCH_REQUEST';
    throw error;
  }
  if (payload.paid_search?.enabled === true) {
    const error = new Error('paid provider execution is disabled; this module currently uses free providers only');
    error.code = 'PAID_SEARCH_DISABLED';
    throw error;
  }

  const question = normalizeText(payload.question);
  if (!question) {
    const error = new Error('question is required');
    error.code = 'INVALID_SEARCH_REQUEST';
    throw error;
  }
  const { domainId, domainLens } = resolveDomainLens(payload);

  const conditions = Array.isArray(payload.conditions) && payload.conditions.length
    ? payload.conditions.map(normalizeCondition)
    : [normalizeCondition({ class:'CORE', field:'text', operator:'CONTAINS', expected_value:question }, 0)];
  if (!conditions.some((item) => item.class === 'CORE')) {
    const error = new Error('at least one CORE condition is required');
    error.code = 'NO_CORE_CONDITION';
    throw error;
  }

  const aliases = [...new Set((payload.aliases || []).map(normalizeText).filter(Boolean))].sort();
  const identifiers = [...new Set((payload.identifiers || []).map(normalizeText).filter(Boolean))].sort();
  const jurisdictions = [...new Set((payload.jurisdictions || []).map((value) => normalizeText(value).toUpperCase()).filter(Boolean))].sort();
  const effectiveAsOf = context.effective_as_of || payload.as_of || context.execution_time || new Date().toISOString();
  const upstream = normalizeUpstreamQueries(payload, domainId);

  let primaryQuerySet;
  let reinforcementQuerySet;
  let planningAuthority;
  let plannedQueryRoles;

  if (upstream) {
    primaryQuerySet = upstream;
    reinforcementQuerySet = upstream
      .filter((query) => ['COUNTER', 'INDEPENDENT', 'OFFICIAL', 'PRIMARY'].includes(query.role))
      .map((query, index) => Object.freeze({ ...query, query_id:`retry_${index + 1}_${query.query_id}`, class:`RETRY_${query.role}` }));
    planningAuthority = 'UPSTREAM_CANONICAL';
    plannedQueryRoles = [...new Set(upstream.map((query) => query.role))].sort();
  } else {
    const baseQuery = Object.freeze({ query_id:'primary_1', class:'PRIMARY', text:providerSearchText(question) || question, domain_id:domainId, identifiers, aliases, jurisdictions });
    const reinforcement = [];
    for (const alias of aliases) reinforcement.push({ class:'ALIAS_VARIANT', text:alias });
    for (const identifier of identifiers) reinforcement.push({ class:'IDENTIFIER_LOOKUP', text:identifier });
    reinforcement.push({ class:'OFFICIAL_RECORD_LOOKUP', text:question });
    reinforcement.push({ class:'INDEPENDENT_ORIGIN_LOOKUP', text:question });
    primaryQuerySet = [baseQuery];
    reinforcementQuerySet = reinforcement.slice(0, 8).map((query, index) => Object.freeze({
      query_id:`reinforcement_${index + 1}`,
      class:query.class,
      text:normalizeText(query.text),
      domain_id:domainId,
      identifiers,
      aliases,
      jurisdictions
    }));
    planningAuthority = 'EVIDENCE_SEARCH_LEGACY_COMPATIBILITY';
    plannedQueryRoles = [];
  }

  const plan = {
    schema_version:'astera.evidence-search.query-plan.v2',
    question,
    domain_lens: domainLens,
    effective_as_of:String(effectiveAsOf),
    conditions,
    primary_query_set:Object.freeze(primaryQuerySet),
    reinforcement_query_set:Object.freeze(reinforcementQuerySet),
    planning_authority:planningAuthority,
    planned_query_roles:Object.freeze(plannedQueryRoles),
    source_policy:{
      free_projection:payload.search?.free_projection !== false,
      free_current:payload.search?.free_current !== false,
      paid_enabled:false,
      provider_allowlist:[...new Set((payload.provider_allowlist || []).map(normalizeText).filter(Boolean))].sort(),
      provider_denylist:[...new Set((payload.provider_denylist || []).map(normalizeText).filter(Boolean))].sort()
    },
    maximum_results:integerInRange(payload.maximum_results, 'maximum_results', 1, 128, 32),
    deadline_ms:integerInRange(payload.deadline_ms, 'deadline_ms', 1000, 60_000, 8000)
  };
  return Object.freeze({ ...plan, plan_hash:sha256(plan) });
}

module.exports = {
  CONDITION_CLASS_WEIGHTS,
  REINFORCEMENT_CLASSES,
  UPSTREAM_QUERY_ROLES,
  compileQueryPlan,
  normalizeText
};
