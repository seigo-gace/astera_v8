'use strict';

const crypto = require('node:crypto');
const {
  normalizeEvidencePacket,
  tokenOverlap,
  unique
} = require('./judgment-materials-analyzer');

const QUERY_ROLES = Object.freeze({
  OFFICIAL: 'OFFICIAL',
  PRIMARY: 'PRIMARY',
  INDEPENDENT: 'INDEPENDENT',
  VERSION: 'VERSION',
  COUNTER: 'COUNTER',
  NUMERIC_LOWER: 'NUMERIC_LOWER',
  NUMERIC_UPPER: 'NUMERIC_UPPER',
  NUMERIC_ALTERNATE: 'NUMERIC_ALTERNATE'
});

const CONFIRMED = 'CONFIRMED';
const UNDETERMINED = 'UNDETERMINED';

function normalizeText(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(prefix, value) {
  return `${prefix}_${crypto.createHash('sha256').update(stable(value)).digest('hex').slice(0, 24)}`;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function sourceRoleFor(containerRole, quotationRole) {
  if (containerRole === 'FENCED_CONTAINER') return 'CODE_OR_QUOTED_BLOCK';
  if (quotationRole === 'QUOTED') return 'ATTRIBUTED_OR_QUOTED';
  return 'DIRECT_INPUT';
}

function fragmentText(text, baseOffset = 0) {
  const input = String(text || '');
  const fragments = [];
  let cursor = 0;
  let index = 0;

  const push = (start, end, containerRole = 'PLAIN_CONTAINER', contentRole = 'TEXT', quotationRole = 'DIRECT') => {
    const raw = input.slice(start, end);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    const from = start + left;
    const to = end - right;
    if (to <= from) return;
    const value = input.slice(from, to);
    const normalized = normalizeText(value);
    if (!normalized) return;
    index += 1;
    const span = { start: baseOffset + from, end: baseOffset + to };
    fragments.push(freeze({
      fragment_id: hash('frag', { span, normalized, containerRole, contentRole, quotationRole }),
      index,
      text: value,
      normalized_fragment: normalized,
      span,
      source_axes: {
        container_role: [containerRole],
        content_role: [contentRole],
        quotation_role: [quotationRole]
      },
      source_role: sourceRoleFor(containerRole, quotationRole)
    }));
  };

  const fenced = /```[\s\S]*?```/gu;
  for (const match of input.matchAll(fenced)) {
    if (match.index > cursor) {
      splitPlain(input, cursor, match.index, push);
    }
    push(match.index, match.index + match[0].length, 'FENCED_CONTAINER', 'CODE_OR_QUOTED_BLOCK', 'DIRECT');
    cursor = match.index + match[0].length;
  }
  if (cursor < input.length) splitPlain(input, cursor, input.length, push);
  return freeze(fragments);
}

function splitPlain(input, from, to, push) {
  let start = from;
  let quoteDepth = 0;
  for (let i = from; i < to; i += 1) {
    const ch = input[i];
    if (['「', '『', '“'].includes(ch)) quoteDepth += 1;
    if (['」', '』', '”'].includes(ch)) quoteDepth = Math.max(0, quoteDepth - 1);
    const boundary = quoteDepth === 0 && /[。！？!?;；\n]/u.test(ch);
    if (!boundary) continue;
    const part = input.slice(start, i + 1);
    const quotationRole = /[「『“][\s\S]+[」』”]/u.test(part) ? 'QUOTED' : 'DIRECT';
    push(start, i + 1, 'PLAIN_CONTAINER', 'TEXT', quotationRole);
    start = i + 1;
  }
  if (start < to) {
    const part = input.slice(start, to);
    const quotationRole = /[「『“][\s\S]+[」』”]/u.test(part) ? 'QUOTED' : 'DIRECT';
    push(start, to, 'PLAIN_CONTAINER', 'TEXT', quotationRole);
  }
}

function assertionType(text) {
  const value = normalizeText(text);
  if (!value) return 'UNKNOWN';
  if (/[?？]$/u.test(value) || /^(?:何|なぜ|どう|いつ|どこ|誰|what|why|how|when|where|who)\b/i.test(value)) return 'QUESTION';
  if (/(?:しろ|せよ|してください|してくれ|実装しろ|確認しろ|変更しろ|do not|must not|please\s+(?:build|implement|verify|change)|\bimplement\b|\bverify\b)/i.test(value)) return 'COMMAND';
  if (/(?:と思う|かもしれない|たぶん|推測|maybe|probably|I think)/i.test(value)) return 'EVALUATION';
  return 'ASSERTION';
}

function modality(text) {
  const value = normalizeText(text);
  if (/(?:場合|なら|ならば|とき|時は|if\b|when\b|provided that)/i.test(value)) return 'CONDITIONAL_RULE';
  if (/(?:可能|できる|can\b|may\b|possible)/i.test(value)) return 'POSSIBILITY';
  return 'OBSERVED';
}

function polarity(text) {
  const value = normalizeText(text);
  const negatives = value.match(/(?:ない|ません|不可|禁止|ではない|じゃない|not\b|no\b|never\b|without\b)/gi) || [];
  if (negatives.length >= 2 && /(?:わけではない|とは限らない|not\s+impossible|not\s+un)/i.test(value)) return 'AFFIRMATIVE';
  return negatives.length ? 'NEGATIVE' : 'AFFIRMATIVE';
}

function timeScope(text) {
  const value = normalizeText(text);
  if (/(?:現在|現行|最新|今日|今|current|latest|today|now)/i.test(value)) return 'CURRENT';
  if (/(?:昨日|過去|以前|当時|previous|past|yesterday)/i.test(value)) return 'PAST';
  if (/(?:今後|将来|予定|future|will\b)/i.test(value)) return 'FUTURE';
  return 'UNKNOWN';
}

function parseStructure(text, fallbackTarget = '') {
  const value = normalizeText(text).replace(/[。！？!?]+$/u, '');
  let match = /^(.{1,120}?)(?:は|が)(.{1,180})$/u.exec(value);
  if (match) return { subject: normalizeText(match[1]), predicate: 'IS', object_or_value: normalizeText(match[2]), resolved: true };
  match = /^(.{1,120}?)\s+(?:is|are|was|were|has|have|supports?|requires?)\s+(.{1,180})$/i.exec(value);
  if (match) return { subject: normalizeText(match[1]), predicate: 'IS', object_or_value: normalizeText(match[2]), resolved: true };
  if (fallbackTarget) {
    return { subject: normalizeText(fallbackTarget), predicate: 'STATED_CONTENT', object_or_value: value, resolved: Boolean(value) };
  }
  return { subject: 'UNKNOWN', predicate: 'UNKNOWN', object_or_value: value || 'UNKNOWN', resolved: false };
}

function numericClaim(structure) {
  return /\d/.test(String(structure.object_or_value || ''));
}

function policyFor(claim) {
  if (claim.claim_origin === 'CODE_STRUCTURE') {
    return freeze({
      claim_policy_id: 'POLICY_CODE_STRUCTURE',
      external_search_required: false,
      planned_query_roles: [],
      required_scope_fields: ['subject', 'predicate'],
      verifiable_modalities: ['OBSERVED'],
      independence_requirement: 'LOCAL_INPUT_ONLY',
      allowed_evidence_sources: ['LOCAL_INPUT_EVIDENCE']
    });
  }
  if (claim.claim_origin === 'ATTRIBUTED_ASSERTION') {
    return freeze({
      claim_policy_id: 'POLICY_ATTRIBUTION',
      external_search_required: false,
      planned_query_roles: [],
      required_scope_fields: ['subject', 'predicate'],
      verifiable_modalities: ['OBSERVED', 'POSSIBILITY', 'CONDITIONAL_RULE'],
      independence_requirement: 'LOCAL_INPUT_ONLY',
      allowed_evidence_sources: ['LOCAL_INPUT_EVIDENCE']
    });
  }
  const current = claim.time_scope === 'CURRENT';
  const numeric = numericClaim(claim);
  const roles = [QUERY_ROLES.OFFICIAL, QUERY_ROLES.PRIMARY, QUERY_ROLES.INDEPENDENT];
  if (current) roles.push(QUERY_ROLES.VERSION);
  roles.push(QUERY_ROLES.COUNTER);
  if (numeric) roles.push(QUERY_ROLES.NUMERIC_LOWER, QUERY_ROLES.NUMERIC_UPPER, QUERY_ROLES.NUMERIC_ALTERNATE);
  return freeze({
    claim_policy_id: numeric ? 'POLICY_NUMERIC_FACT' : current ? 'POLICY_CURRENT_FACT' : 'POLICY_GENERAL_FACT',
    external_search_required: true,
    planned_query_roles: roles,
    required_scope_fields: ['subject', 'predicate'],
    verifiable_modalities: ['OBSERVED', 'POSSIBILITY', 'CONDITIONAL_RULE'],
    independence_requirement: 'AUTHORITY_PLUS_INDEPENDENT_OR_TWO_FAMILIES',
    allowed_evidence_sources: ['EXTERNAL_RETRIEVED_EVIDENCE']
  });
}

function claimFromFragment(fragment, task, { forced = false } = {}) {
  const type = assertionType(fragment.normalized_fragment);
  if (!forced && type !== 'ASSERTION') return null;
  const structure = parseStructure(fragment.normalized_fragment, task.target || '');
  const origin = fragment.source_axes.container_role.includes('FENCED_CONTAINER')
    ? 'CODE_STRUCTURE'
    : fragment.source_axes.quotation_role.includes('QUOTED')
      ? 'ATTRIBUTED_ASSERTION'
      : 'DIRECT_ASSERTION';
  const payload = {
    task_id: task.id,
    fragment_id: fragment.fragment_id,
    subject: structure.subject,
    predicate: structure.predicate,
    object_or_value: structure.object_or_value,
    polarity: polarity(fragment.normalized_fragment),
    modality: modality(fragment.normalized_fragment),
    time_scope: timeScope(fragment.normalized_fragment),
    jurisdiction: 'UNKNOWN',
    version_scope: 'UNKNOWN',
    claim_origin: origin
  };
  const verificationLine = structure.resolved && structure.subject !== 'UNKNOWN' && structure.predicate !== 'UNKNOWN';
  return freeze({
    ...payload,
    claim_id: hash('claim', payload),
    raw_text: fragment.normalized_fragment,
    source_span: fragment.span,
    source_axes: fragment.source_axes,
    assertion_type: type,
    verification_line: { passed: verificationLine, line: origin === 'CODE_STRUCTURE' ? 'CODE_STRUCTURE_LINE' : 'NATURAL_ASSERTION_LINE' },
    unresolved: verificationLine ? [] : ['claim_structure']
  });
}

function claimsForTask(task) {
  const claims = [];
  const seen = new Set();
  const baseOffset = Number(task.source_span?.start || 0);
  const premiseTexts = Array.isArray(task.premises) ? task.premises.filter(Boolean) : [];
  const sourceText = String(task.source_span?.text || task.raw_text || '');
  const inputs = premiseTexts.length ? premiseTexts.map((text) => ({ text, forced: true, base: baseOffset })) : [{ text: sourceText, forced: false, base: baseOffset }];

  for (const input of inputs) {
    for (const fragment of fragmentText(input.text, input.base)) {
      const claim = claimFromFragment(fragment, task, { forced: input.forced });
      if (!claim || seen.has(claim.claim_id)) continue;
      seen.add(claim.claim_id);
      claims.push(claim);
    }
  }

  if (!claims.length && task.evidence_need?.required) {
    const text = normalizeText(task.target || task.source_span?.text || task.objective || 'UNKNOWN');
    const payload = {
      task_id: task.id,
      fragment_id: hash('frag', { task_id: task.id, text }),
      subject: text || 'UNKNOWN',
      predicate: 'VERIFICATION_TARGET',
      object_or_value: 'UNKNOWN',
      polarity: 'AFFIRMATIVE',
      modality: 'OBSERVED',
      time_scope: timeScope(text),
      jurisdiction: 'UNKNOWN',
      version_scope: 'UNKNOWN',
      claim_origin: 'DIRECT_ASSERTION'
    };
    claims.push(freeze({
      ...payload,
      claim_id: hash('claim', payload),
      raw_text: text,
      source_span: task.source_span || null,
      source_axes: { container_role: ['TASK_TARGET'], content_role: ['VERIFICATION_TARGET'], quotation_role: ['DIRECT'] },
      assertion_type: 'VERIFICATION_TARGET',
      verification_line: { passed: text !== 'UNKNOWN', line: 'TASK_TARGET_LINE' },
      unresolved: text === 'UNKNOWN' ? ['claim_structure', 'target'] : []
    }));
  }
  return freeze(claims);
}

function queryText(role, claim) {
  const subject = normalizeText(claim.subject);
  const predicate = normalizeText(claim.predicate === 'STATED_CONTENT' || claim.predicate === 'VERIFICATION_TARGET' ? '' : claim.predicate);
  const value = normalizeText(claim.object_or_value === 'UNKNOWN' ? '' : claim.object_or_value);
  const base = normalizeText([subject, predicate, value].filter(Boolean).join(' '));
  if (role === QUERY_ROLES.OFFICIAL) return normalizeText(`${base} 公式`);
  if (role === QUERY_ROLES.PRIMARY) return normalizeText(`${base} 一次資料`);
  if (role === QUERY_ROLES.INDEPENDENT) return normalizeText(`${base} 独立資料`);
  if (role === QUERY_ROLES.VERSION) return normalizeText(`${base} version current`);
  if (role === QUERY_ROLES.NUMERIC_LOWER) return normalizeText(`${subject} ${predicate} 下限`);
  if (role === QUERY_ROLES.NUMERIC_UPPER) return normalizeText(`${subject} ${predicate} 上限`);
  if (role === QUERY_ROLES.NUMERIC_ALTERNATE) return normalizeText(`${subject} ${predicate} 別値`);
  if (role === QUERY_ROLES.COUNTER) {
    if (claim.modality === 'CONDITIONAL_RULE') return normalizeText(`${subject} ${predicate} 反例 条件不成立 例外`);
    if (claim.polarity === 'NEGATIVE') return normalizeText(`${subject} ${predicate} 肯定形`);
    return normalizeText(`${subject} ${predicate} 否定形`);
  }
  throw Object.assign(new Error(`unsupported query role: ${role}`), { code: 'QUERY_ROLE_UNSUPPORTED' });
}

function queriesForClaim(claim, policy, domainId = null) {
  if (!policy.external_search_required) return freeze([]);
  if (!policy.planned_query_roles.includes(QUERY_ROLES.COUNTER)) {
    throw Object.assign(new Error('counter query role is mandatory'), { code: 'COUNTER_ROLE_REQUIRED_BY_DESIGN' });
  }
  return freeze(policy.planned_query_roles.map((role) => {
    const text = queryText(role, claim);
    return freeze({
      query_id: hash('query', { claim_id: claim.claim_id, role, text, version: 'v4-restored-1' }),
      claim_id: claim.claim_id,
      role,
      text,
      normalized_query_text: text,
      domain_id: domainId,
      query_template_version: 'v4-restored-1'
    });
  }));
}

function buildCanonicalTaskPlan(task, domain = {}) {
  const claims = claimsForTask(task);
  const policyByClaim = {};
  const queries = [];
  for (const claim of claims) {
    const policy = policyFor(claim);
    policyByClaim[claim.claim_id] = policy;
    queries.push(...queriesForClaim(claim, policy, domain.primary?.id || null));
  }
  return freeze({
    schema_version: 'astera.canonical-task-plan.v1',
    task_id: task.id,
    claims,
    policy_by_claim_id: policyByClaim,
    search_plan: {
      schema_version: 'astera.upstream-search-plan.v1',
      planning_authority: 'ASTERA_DECISION_MATERIALS_V4',
      task_id: task.id,
      query_template_version: 'v4-restored-1',
      planned_query_roles: unique(queries.map((query) => query.role)),
      queries
    }
  });
}

function evidenceIdentity(item) {
  return item.source_family_id || item.authority_id || item.source_id || item.id || item.url || '';
}

function bindEvidence(claim, policy, compactEvidence) {
  if (!policy.external_search_required) {
    if (claim.claim_origin === 'CODE_STRUCTURE' || claim.claim_origin === 'ATTRIBUTED_ASSERTION') {
      return freeze([{ relation: 'SUPPORTS', evidence_source: 'LOCAL_INPUT_EVIDENCE', source_roles: ['local'], candidate_id: claim.fragment_id, source_family_id: `local:${claim.fragment_id}` }]);
    }
    return freeze([]);
  }
  const matches = (compactEvidence.evidence || [])
    .map((item) => ({ item, overlap: tokenOverlap(claim.raw_text || `${claim.subject} ${claim.object_or_value}`, item.claim || '') }))
    .filter((entry) => entry.overlap >= 0.28)
    .sort((a, b) => b.overlap - a.overlap)
    .map((entry) => freeze({
      relation: 'SUPPORTS',
      evidence_source: 'EXTERNAL_RETRIEVED_EVIDENCE',
      candidate_id: entry.item.id,
      source_role: entry.item.source_role,
      source_roles: [entry.item.source_role],
      source_family_id: entry.item.source_family_id,
      authority_id: entry.item.authority_id,
      url: entry.item.url,
      overlap: Number(entry.overlap.toFixed(3))
    }));
  return freeze(matches);
}

function g4Independence(policy, bindings) {
  if (!policy.external_search_required) return bindings.some((item) => item.evidence_source === 'LOCAL_INPUT_EVIDENCE');
  const external = bindings.filter((item) => item.evidence_source === 'EXTERNAL_RETRIEVED_EVIDENCE');
  const authorities = new Set(external.filter((item) => ['OFFICIAL', 'PRIMARY'].includes(item.source_role)).map(evidenceIdentity).filter(Boolean));
  const independent = new Set(external.filter((item) => !['OFFICIAL', 'PRIMARY'].includes(item.source_role)).map(evidenceIdentity).filter(Boolean));
  const families = new Set(external.map(evidenceIdentity).filter(Boolean));
  return (authorities.size >= 1 && independent.size >= 1) || families.size >= 2;
}

function retrievalGate(policy, rawEvidence, compactEvidence) {
  if (!policy.external_search_required) return true;
  const planned = new Set((rawEvidence?.planned_query_roles || rawEvidence?.query_plan?.planned_query_roles || []).map(String));
  const rolesPresent = policy.planned_query_roles.every((role) => planned.has(role));
  const runs = [
    ...(rawEvidence?.provider_execution?.initial || []),
    ...(rawEvidence?.provider_execution?.reinforcement || [])
  ];
  const failures = runs.filter((run) => run.status && !['FULFILLED', 'NOT_FOUND'].includes(String(run.status).toUpperCase()));
  const authority = String(rawEvidence?.planning_authority || rawEvidence?.query_plan?.planning_authority || '');
  return rolesPresent && failures.length === 0 && authority === 'UPSTREAM_CANONICAL' && compactEvidence.state !== 'NOT_PROVIDED';
}

function evaluateClaim(claim, policy, rawEvidence) {
  const compactEvidence = normalizeEvidencePacket(rawEvidence);
  const bindings = bindEvidence(claim, policy, compactEvidence);
  const missingScopeFields = policy.required_scope_fields.filter((field) => {
    const value = claim[field];
    return value === null || value === undefined || String(value).trim() === '' || String(value) === 'UNKNOWN';
  });
  const g1 = claim.verification_line?.passed === true;
  const g2 = policy.verifiable_modalities.includes(claim.modality);
  const g3 = missingScopeFields.length === 0;
  const g4 = g4Independence(policy, bindings);
  const g5 = retrievalGate(policy, rawEvidence, compactEvidence);
  const g6 = compactEvidence.conflict_detected !== true;
  const g7 = claim.claim_origin === 'DIRECT_ASSERTION'
    ? bindings.some((binding) => binding.evidence_source === 'EXTERNAL_RETRIEVED_EVIDENCE')
    : bindings.some((binding) => binding.evidence_source === 'LOCAL_INPUT_EVIDENCE');
  const gates = freeze({ G1:g1, G2:g2, G3:g3, G4:g4, G5:g5, G6:g6, G7:g7 });
  const status = Object.values(gates).every(Boolean) ? CONFIRMED : UNDETERMINED;
  const reasons = [];
  if (!g1) reasons.push('G1_VERIFICATION_LINE_INCOMPLETE');
  if (!g2) reasons.push('G2_MODALITY_NOT_VERIFIABLE');
  if (!g3) reasons.push(`G3_SCOPE_UNKNOWN:${missingScopeFields.join(',')}`);
  if (!g4) reasons.push('G4_EVIDENCE_OR_INDEPENDENCE_INSUFFICIENT');
  if (!g5) reasons.push('G5_PLANNED_QUERY_RETRIEVAL_INCOMPLETE');
  if (!g6) reasons.push('G6_UNRESOLVED_CONFLICT');
  if (!g7) reasons.push('G7_ORIGIN_CONFIRMABILITY_NOT_SATISFIED');
  return freeze({
    claim_id: claim.claim_id,
    task_id: claim.task_id,
    status,
    reasons,
    gates,
    missing_scope_fields: missingScopeFields,
    supported_scope: { subject:claim.subject, property:claim.predicate, time:claim.time_scope, jurisdiction:claim.jurisdiction, version:claim.version_scope },
    bindings,
    evidence_state: compactEvidence.state,
    evidence_quality_status: compactEvidence.source_status,
    evidence_quality_score_bp: compactEvidence.quality_score_bp
  });
}

function evaluateCanonicalTaskPlan(plan, rawEvidence) {
  const records = plan.claims.map((claim) => {
    const policy = plan.policy_by_claim_id[claim.claim_id];
    const confirmation = evaluateClaim(claim, policy, rawEvidence);
    return freeze({ claim, policy, confirmation });
  });
  return freeze({
    schema_version: 'astera.canonical-claim-records.v1',
    task_id: plan.task_id,
    search_plan: plan.search_plan,
    records,
    confirmed_count: records.filter((record) => record.confirmation.status === CONFIRMED).length,
    undetermined_count: records.filter((record) => record.confirmation.status === UNDETERMINED).length
  });
}

function domainArray(domain, names) {
  for (const name of names) {
    if (Array.isArray(domain?.primary?.[name])) return domain.primary[name];
  }
  return [];
}

function projectFiveLanes({ task, canonical, domain = {} }) {
  const records = canonical?.records || [];
  const confirmed = records.filter((record) => record.confirmation.status === CONFIRMED);
  const undetermined = records.filter((record) => record.confirmation.status === UNDETERMINED);
  const riskLens = domainArray(domain, ['risk_lens', 'risk_checks', 'risks', 'safety_checks']);
  const multiLens = domainArray(domain, ['multi_lens', 'perspectives']);
  const compareLens = domainArray(domain, ['compare_lens', 'comparison_dimensions']);
  const evidenceNeeds = domainArray(domain, ['evidence_to_collect', 'required_evidence']);
  const hardConstraints = unique([...(task.constraints || []), ...(task.prohibitions || []), ...(task.preserve || [])]);

  const fact = freeze({
    lane:'fact',
    confirmed_claim_ids: confirmed.map((record) => record.claim.claim_id).sort(),
    undetermined_claim_ids: undetermined.map((record) => record.claim.claim_id).sort(),
    confirmed: confirmed.map((record) => ({ claim_id:record.claim.claim_id, text:record.claim.raw_text, status:CONFIRMED, supported_scope:record.confirmation.supported_scope, bindings:record.confirmation.bindings })),
    unconfirmed: undetermined.map((record) => ({ claim_id:record.claim.claim_id, text:record.claim.raw_text, status:UNDETERMINED, reasons:record.confirmation.reasons })),
    opinions:[],
    evidence_need: undetermined.map((record) => ({ item:record.claim.raw_text, reason:record.confirmation.reasons.join(' / ') })),
    evidence_gaps: undetermined.map((record) => ({ item:record.claim.raw_text, reason:record.confirmation.reasons.join(' / ') }))
  });

  const risk = freeze({
    lane:'risk',
    source:'CANONICAL_CLAIM_RECORDS_AND_DOMAIN_RULES',
    risk_count: riskLens.length + (task.hard_blockers || []).length,
    risks: [
      ...riskLens.map((item, index) => ({ key:`domain-risk-${index + 1}`, impact:String(item), weight:20, source:'DOMAIN_LENS' })),
      ...(task.hard_blockers || []).map((item, index) => ({ key:`hard-blocker-${index + 1}`, impact:String(item), weight:100, source:'TASK_GRAPH' }))
    ],
    unresolved_claim_count:undetermined.length,
    hard_constraints:hardConstraints,
    safety_gates:unique(task.prohibitions || []),
    level:(task.hard_blockers || []).length?'high':riskLens.length?'medium':'low'
  });
  risk.highest = risk.risks[0] || null;

  const multi = freeze({
    lane:'multi',
    perspectives: multiLens.map((item, index) => ({ id:`domain-perspective-${index + 1}`, focus:String(item), source:'DOMAIN_LENS', claim_ids:confirmed.map((record) => record.claim.claim_id) })),
    supported_scopes: confirmed.map((record) => ({ claim_id:record.claim.claim_id, ...record.confirmation.supported_scope })),
    trade_off_map: multiLens.map((item, index) => ({ id:`domain-perspective-${index + 1}`, dimension:String(item), status:'MATERIAL_ONLY' }))
  });

  const inquiry = freeze({
    lane:'inquiry',
    problem_health:{ healthy:undetermined.length===0 && !(task.hard_blockers || []).length, reason:undetermined.length?'Canonical Claims remain UNDETERMINED.':'Canonical Claims are traceable.' },
    missing_fields:unique(undetermined.flatMap((record) => record.confirmation.missing_scope_fields.map((field) => `${record.claim.claim_id}:${field}`))),
    missing_questions:unique([...undetermined.flatMap((record) => record.confirmation.reasons), ...evidenceNeeds]),
    open_items:undetermined.map((record) => ({ claim_id:record.claim.claim_id, reasons:record.confirmation.reasons, missing_scope_fields:record.confirmation.missing_scope_fields }))
  });

  const denominator = records.length;
  const compare = freeze({
    lane:'compare',
    material_only:true,
    counts:{ claims:records.length, confirmed:confirmed.length, undetermined:undetermined.length, conflicts:undetermined.filter((record) => record.confirmation.reasons.includes('G6_UNRESOLVED_CONFLICT')).length },
    coverage:denominator?{ numerator:confirmed.length, denominator, ratio:confirmed.length/denominator }:null,
    dimensions:compareLens.map(String),
    scope_booleans:records.map((record) => ({ claim_id:record.claim.claim_id, required_scope_defined:record.policy.required_scope_fields.length>0, all_required_scope_confirmed:record.confirmation.status===CONFIRMED && record.confirmation.missing_scope_fields.length===0 })),
    selected_candidate:null,
    candidate_ranking:[],
    rejected_candidates:[],
    verdict:{ decision:'MATERIAL_ONLY', reason:'Astera does not select, rank, recommend, adopt, or reject candidates.', objective:task.objective || '' }
  });

  return freeze({ fact, risk, multi, inquiry, compare });
}

function deterministicPerspectiveExpansion({ task, canonical, domain = {} }) {
  const records = canonical?.records || [];
  const confirmed = records.filter((record) => record.confirmation.status === CONFIRMED).length;
  const undetermined = records.length - confirmed;
  return freeze({
    engine:'Astera Deterministic Perspective Expansion',
    mode:'MATERIAL_ONLY',
    candidates:[],
    selected:null,
    rejected:[],
    perspectives:[
      { id:'forward', focus:task.objective || task.target || '', basis:{ confirmed, undetermined, rule_id:'PERSPECTIVE-FORWARD-MATERIAL' } },
      { id:'counter', focus:'Counter-evidence and failure conditions', basis:{ query_role:QUERY_ROLES.COUNTER, rule_id:'PERSPECTIVE-COUNTER-MATERIAL' } },
      { id:'constraint', focus:unique([...(task.constraints || []), ...(task.prohibitions || []), ...(task.preserve || [])]), basis:{ rule_id:'PERSPECTIVE-CONSTRAINT-MATERIAL' } },
      { id:'domain', focus:domainArray(domain, ['multi_lens', 'perspectives']).map(String), basis:{ lens_id:domain.primary?.id || null, rule_id:'PERSPECTIVE-DOMAIN-MATERIAL' } }
    ]
  });
}

module.exports = {
  QUERY_ROLES,
  CONFIRMED,
  UNDETERMINED,
  fragmentText,
  claimsForTask,
  policyFor,
  queriesForClaim,
  buildCanonicalTaskPlan,
  evaluateCanonicalTaskPlan,
  projectFiveLanes,
  deterministicPerspectiveExpansion
};
