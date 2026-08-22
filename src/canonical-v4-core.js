'use strict';

const crypto = require('node:crypto');

const VERIFIABLE_MODALITIES = new Set(['OBSERVED', 'PAST_FACT', 'REPORTED_PLAN', 'CONDITIONAL_RULE']);
const unique = (items) => [...new Set((items || []).map((v) => String(v || '').trim()).filter(Boolean))];
const normalize = (value) => String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function sourceAxes({ containerRole = 'PLAIN_CONTAINER', contentRole = 'TEXT', quotationRole = 'DIRECT', origin = 'question' } = {}) {
  return Object.freeze({ container_role: [containerRole], content_role: [contentRole], quotation_role: [quotationRole], input_role: origin });
}

function pushFragment(out, inputDocumentId, text, start, end, roles) {
  const normalized = normalize(text);
  if (!normalized) return;
  const axes = sourceAxes(roles);
  out.push(Object.freeze({
    fragment_id: hash(`${inputDocumentId}|${start}:${end}|${normalized}`),
    input_document_id: inputDocumentId,
    text,
    normalized_fragment: normalized,
    canonical_source_position: `${start}:${end}`,
    span: Object.freeze({ start, end }),
    source_axes: axes,
    actionable: axes.input_role === 'question' && axes.container_role[0] === 'PLAIN_CONTAINER' && axes.quotation_role[0] === 'DIRECT'
  }));
}

function fragmentInput({ inputDocumentId = 'input', text = '', origin = 'question' } = {}) {
  const source = String(text || '');
  const fragments = [];
  const fence = /```[\s\S]*?```|---FILE---/gu;
  let cursor = 0;
  const segments = [];
  for (const match of source.matchAll(fence)) {
    if (match.index > cursor) segments.push({ text: source.slice(cursor, match.index), start: cursor, role: 'PLAIN_CONTAINER' });
    segments.push({ text: match[0], start: match.index, role: match[0] === '---FILE---' ? 'FILE_SEPARATOR' : 'FENCED_CONTAINER' });
    cursor = match.index + match[0].length;
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), start: cursor, role: 'PLAIN_CONTAINER' });

  for (const segment of segments) {
    if (segment.role !== 'PLAIN_CONTAINER') {
      pushFragment(fragments, inputDocumentId, segment.text, segment.start, segment.start + segment.text.length, {
        containerRole: segment.role,
        contentRole: segment.role === 'FILE_SEPARATOR' ? 'BOUNDARY' : 'CODE_OR_QUOTED_BLOCK',
        quotationRole: segment.role === 'FENCED_CONTAINER' ? 'QUOTED' : 'DIRECT',
        origin
      });
      continue;
    }
    let localStart = 0;
    const lines = segment.text.split(/(?<=\n)/u);
    for (const lineWithBreak of lines) {
      const line = lineWithBreak.replace(/\r?\n$/u, '');
      const quotePrefix = line.match(/^\s*>\s?/u);
      const prefix = line.match(/^\s*(?:[・*\-]|\d+[.)．])\s*/u);
      const bodyStart = quotePrefix ? 0 : (prefix ? prefix[0].length : 0);
      const body = line.slice(bodyStart);
      if (body.trim()) {
        let sentenceStart = 0;
        const boundaries = [];
        for (let i = 0; i < body.length; i += 1) {
          const ch = body[i];
          const identifierDot = ch === '.' && /[\p{L}\p{N}]/u.test(body[i - 1] || '') && /[\p{L}\p{N}]/u.test(body[i + 1] || '');
          if ('。.!?！？'.includes(ch) && !identifierDot) boundaries.push(i + 1);
        }
        boundaries.push(body.length);
        for (const end of boundaries) {
          if (end <= sentenceStart) continue;
          const sentence = body.slice(sentenceStart, end);
          if (sentence.trim()) {
            const absStart = segment.start + localStart + bodyStart + sentenceStart;
            const absEnd = segment.start + localStart + bodyStart + end;
            const quoted = Boolean(quotePrefix) || /[『「][^』」]+[』」]/u.test(sentence);
            pushFragment(fragments, inputDocumentId, sentence, absStart, absEnd, {
              containerRole: 'PLAIN_CONTAINER', contentRole: 'TEXT', quotationRole: quoted ? 'QUOTED' : 'DIRECT', origin
            });
          }
          sentenceStart = end;
        }
      }
      localStart += lineWithBreak.length;
    }
  }
  return Object.freeze(fragments);
}

function classifyContract(text) {
  const v = normalize(text);
  if (!v) return null;
  if (/(?:must\s+not|do\s+not|never|禁止|するな|してはいけ|変更禁止|削除禁止)/i.test(v)) return 'prohibition';
  if (/(?:preserve|keep|retain|維持|保持|残す|壊さない|変えない)/i.test(v)) return 'preserve';
  if (/(?:out\s+of\s+scope|対象外|触らない|変更対象外)/i.test(v)) return 'out_of_scope';
  if (/(?:must|required|only|限定|必須|原則|条件|のみ)/i.test(v)) return 'constraint';
  return null;
}

function extractContextContracts(context = '') {
  const fragments = fragmentInput({ inputDocumentId: 'context', text: context, origin: 'context' });
  return fragments.map((fragment) => {
    const type = classifyContract(fragment.text);
    return type ? Object.freeze({ type, value: normalize(fragment.text), source: { input_role: 'context', fragment_id: fragment.fragment_id, span: fragment.span } }) : null;
  }).filter(Boolean);
}

function inferDeliverables(text = '') {
  const source = normalize(text);
  const rules = [
    ['README', /\bREADME(?:\.md)?\b/i], ['CODE', /\bcode\b|コード/i], ['TEST', /\btests?\b|テスト|試験/i],
    ['REPORT', /\breport\b|報告書|レポート/i], ['DOCUMENT', /\bdocs?|document(?:ation)?\b|文書|資料/i], ['CONFIG', /\bconfig(?:uration)?\b|設定/i]
  ];
  return rules.filter(([, re]) => re.test(source)).map(([id]) => id);
}

function referenceUnresolved(text = '', target = '') {
  if (!/(?:\bthis\b|\bthat\b|\bit\b|これ|それ|あれ|前者|後者)/i.test(text)) return [];
  if (target && !/(?:input target|入力対象|UNRESOLVED)/i.test(target)) return [];
  return ['reference'];
}

function attachContextContracts(task, contracts) {
  const out = { ...task };
  const provenance = { ...(task.field_provenance || {}) };
  for (const contract of contracts) {
    const key = contract.type === 'out_of_scope' ? 'constraints' : (contract.type === 'prohibition' ? 'prohibitions' : contract.type);
    out[key] = unique([...(out[key] || []), contract.value]);
    provenance[key] = [...(provenance[key] || []), contract.source];
  }
  out.context_contracts = contracts;
  out.field_provenance = provenance;
  return out;
}

function enrichTasks(tasks = [], { question = '', context = '' } = {}) {
  const contracts = extractContextContracts(context);
  const questionFragments = fragmentInput({ inputDocumentId: 'question', text: question, origin: 'question' });
  return tasks.map((task, index) => {
    const sourceText = String(task.source_span?.text || task.raw_text || '');
    const matching = questionFragments.find((fragment) => fragment.span.start <= Number(task.source_span?.start || 0) && fragment.span.end >= Number(task.source_span?.end || 0));
    let enriched = attachContextContracts(task, contracts);
    enriched = {
      ...enriched,
      source_role: matching?.source_axes || sourceAxes({ origin: 'question' }),
      deliverables: unique([...(task.deliverables || []), ...inferDeliverables(sourceText)]),
      unresolved: unique([...(task.unresolved || []), ...referenceUnresolved(sourceText, task.target)]),
      field_provenance: {
        ...(enriched.field_provenance || {}),
        action: [{ input_role: 'question', span: task.source_span || null }],
        target: [{ input_role: 'question', span: task.source_span || null }],
        source_role: matching ? [{ input_role: 'question', fragment_id: matching.fragment_id, span: matching.span }] : []
      },
      actionable: matching ? matching.actionable : task.actionable !== false,
      supersedes: task.supersedes || null,
      parallel_group: task.parallel_group || null,
      conditional_branch: task.conditional_branch || null
    };
    if (/(?:instead|correction|rather than|訂正|ではなく|じゃなく|代わりに)/i.test(sourceText) && index > 0) enriched.supersedes = tasks[index - 1].id;
    return enriched;
  });
}

function validateTaskGraph(tasks = [], dependencies = []) {
  const ids = tasks.map((t) => String(t.id));
  const idSet = new Set(ids);
  const errors = [];
  if (idSet.size !== ids.length) errors.push({ code: 'TASK_ID_DUPLICATE' });
  const incoming = new Map(ids.map((id) => [id, new Set()]));
  for (const edge of dependencies || []) {
    const from = String(edge.from || '');
    const to = String(edge.to || '');
    if (!idSet.has(from) || !idSet.has(to)) { errors.push({ code: 'TASK_DEPENDENCY_DANGLING', from, to }); continue; }
    if (from === to) { errors.push({ code: 'TASK_DEPENDENCY_SELF_CYCLE', from, to }); continue; }
    incoming.get(to).add(from);
  }
  const remaining = new Set(ids);
  const waves = [];
  while (remaining.size) {
    const ready = [...remaining].filter((id) => [...incoming.get(id)].every((parent) => !remaining.has(parent))).sort();
    if (!ready.length) {
      const cycle = [...remaining].sort();
      errors.push({ code: 'TASK_DEPENDENCY_CYCLE', task_ids: cycle });
      break;
    }
    waves.push(ready);
    ready.forEach((id) => remaining.delete(id));
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), execution_waves: Object.freeze(waves.map((w) => Object.freeze(w))) });
}

function modalityOf(text = '') {
  const v = normalize(text);
  if (/(?:if|when|provided that|場合|なら|とき)/i.test(v)) return 'CONDITIONAL_RULE';
  if (/(?:will|plan to|予定|する予定|見込み)/i.test(v)) return 'REPORTED_PLAN';
  if (/(?:was|were|did|had|した|だった|であった)/i.test(v)) return 'PAST_FACT';
  if (/(?:may|might|could|perhaps|maybe|かもしれ|可能性)/i.test(v)) return 'HYPOTHETICAL_SCENARIO';
  return 'OBSERVED';
}

function polarityOf(text = '') {
  return /(?:\bnot\b|\bno\b|never|ない|ぬ|ません|禁止)/i.test(normalize(text)) ? 'NEGATIVE' : 'AFFIRMATIVE';
}

function claimOriginFromTask(task) {
  const axes = task.source_role || {};
  if ((axes.content_role || []).includes('CODE_OR_QUOTED_BLOCK')) return 'CODE_STRUCTURE';
  if ((axes.quotation_role || []).includes('QUOTED')) return 'ATTRIBUTED_ASSERTION';
  return 'DIRECT_ASSERTION';
}

const POLICIES = Object.freeze({
  DIRECT_ASSERTION: Object.freeze({ id: 'POLICY_DIRECT_ASSERTION', required_scope_fields: ['subject'], allowed_evidence_sources: ['EXTERNAL_RETRIEVED_EVIDENCE'], independence_requirement: 'ONE_ALLOWED_SOURCE', external_search_required: true, planned_query_roles: ['support', 'counter'], verifiable_modalities: [...VERIFIABLE_MODALITIES] }),
  ATTRIBUTED_ASSERTION: Object.freeze({ id: 'POLICY_ATTRIBUTED_ASSERTION', required_scope_fields: ['subject'], allowed_evidence_sources: ['LOCAL_INPUT'], independence_requirement: 'NONE', external_search_required: false, planned_query_roles: [], verifiable_modalities: ['OBSERVED', 'PAST_FACT', 'REPORTED_PLAN'] }),
  CODE_STRUCTURE: Object.freeze({ id: 'POLICY_CODE_STRUCTURE', required_scope_fields: ['subject'], allowed_evidence_sources: ['LOCAL_INPUT'], independence_requirement: 'NONE', external_search_required: false, planned_query_roles: [], verifiable_modalities: ['OBSERVED', 'PAST_FACT'] })
});

function assertionLike(text = '') {
  const v = normalize(text);
  if (!v) return false;
  if (/(?:してください|しろ|せよ|やれ|実装|変更|削除|確認しろ|please\b|implement\b|build\b|remove\b|change\b)/i.test(v)) return false;
  return /(?:です|である|だった|ある|ない|is\b|are\b|was\b|were\b|has\b|have\b|=|:)/i.test(v);
}

function extractCanonicalClaims(task = {}) {
  const sources = unique([...(task.premises || []), ...(task.claims || []), ...(assertionLike(task.raw_text || task.source_span?.text || '') ? [task.raw_text || task.source_span?.text] : [])]);
  const origin = claimOriginFromTask(task);
  const policy = POLICIES[origin] || POLICIES.DIRECT_ASSERTION;
  return sources.map((statement, index) => {
    const normalized = normalize(statement);
    const subject = normalize(task.target || '') || 'UNKNOWN';
    const modality = modalityOf(normalized);
    const polarity = polarityOf(normalized);
    const canonicalPayload = { subject, predicate: normalized, object_or_value: null, polarity, modality, time_scope: 'UNKNOWN', jurisdiction: 'UNKNOWN', version_scope: 'UNKNOWN', claim_origin: origin, claim_policy_id: policy.id };
    const claimId = hash(`${task.id}|${index}|${JSON.stringify(canonicalPayload)}`);
    return Object.freeze({ claim_id: claimId, task_id: task.id, source_span: task.source_span || null, statement: normalized, ...canonicalPayload, policy });
  });
}

function createSearchPlan(claim) {
  if (!claim.policy.external_search_required) return Object.freeze({ claim_id: claim.claim_id, required: false, query_roles: Object.freeze([]) });
  const counterPolarity = claim.polarity === 'NEGATIVE' ? 'AFFIRMATIVE' : 'NEGATIVE';
  const queryRoles = [
    Object.freeze({ role: 'support', query_id: hash(`${claim.claim_id}|support|${claim.statement}`), normalized_query_text: claim.statement, polarity_target: claim.polarity }),
    Object.freeze({ role: 'counter', query_id: hash(`${claim.claim_id}|counter|${claim.statement}|${counterPolarity}`), normalized_query_text: claim.statement, polarity_target: counterPolarity })
  ];
  return Object.freeze({ claim_id: claim.claim_id, required: true, counter_required: true, query_roles: Object.freeze(queryRoles) });
}

function tokenSet(text) {
  return new Set(normalize(text).toLowerCase().match(/[\p{L}\p{N}_./:-]+/gu) || []);
}

function overlap(a, b) {
  const aa = tokenSet(a); const bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;
  let hit = 0; for (const token of aa) if (bb.has(token)) hit += 1;
  return hit / Math.max(aa.size, bb.size);
}

function bindEvidence(claim, normalizedEvidence = {}) {
  const evidence = Array.isArray(normalizedEvidence.evidence) ? normalizedEvidence.evidence : [];
  const candidates = evidence.map((item) => ({ item, overlap: overlap(claim.statement, item.claim || '') })).filter((entry) => entry.overlap >= 0.35).sort((a, b) => b.overlap - a.overlap || String(a.item.id).localeCompare(String(b.item.id)));
  return candidates.map((entry) => Object.freeze({
    evidence_binding_id: hash(`${claim.claim_id}|${entry.item.id}|${entry.overlap.toFixed(6)}`),
    claim_id: claim.claim_id,
    candidate_id: entry.item.id,
    relation: 'SUPPORTS',
    overlap: Number(entry.overlap.toFixed(6)),
    source_role: entry.item.source_role || null,
    source_family_id: entry.item.source_family_id || null,
    authority_id: entry.item.authority_id || null,
    source_id: entry.item.source_id || null,
    url: entry.item.url || null
  }));
}

function confirmClaim(claim, normalizedEvidence = {}) {
  const bindings = bindEvidence(claim, normalizedEvidence);
  const requiredScope = claim.policy.required_scope_fields || [];
  const g1 = Boolean(claim.policy && claim.claim_policy_id);
  const g2 = (claim.policy.verifiable_modalities || []).includes(claim.modality);
  const g3 = requiredScope.every((field) => claim[field] && claim[field] !== 'UNKNOWN');
  const localOrigin = claim.claim_origin !== 'DIRECT_ASSERTION';
  const g4 = localOrigin ? true : (normalizedEvidence.state === 'VALID' && bindings.length > 0);
  const g5 = !claim.policy.external_search_required || (normalizedEvidence.state === 'VALID' && !(normalizedEvidence.provider_failures || []).length);
  const g6 = normalizedEvidence.conflict_detected !== true;
  const g7 = ['DIRECT_ASSERTION', 'ATTRIBUTED_ASSERTION', 'CODE_STRUCTURE'].includes(claim.claim_origin);
  const gates = Object.freeze({ G1: g1, G2: g2, G3: g3, G4: g4, G5: g5, G6: g6, G7: g7 });
  const reasons = [];
  if (!g1) reasons.push('POLICY_NOT_RESOLVED');
  if (!g2) reasons.push('MODALITY_NOT_VERIFIABLE');
  if (!g3) reasons.push('SCOPE_UNKNOWN');
  if (!g4) reasons.push('INSUFFICIENT_EVIDENCE');
  if (!g5) reasons.push((normalizedEvidence.provider_failures || []).length ? 'RETRIEVAL_FAILED' : 'INSUFFICIENT_EVIDENCE');
  if (!g6) reasons.push('CONFLICT');
  if (!g7) reasons.push('PARSE_UNRESOLVED');
  const confirmed = Object.values(gates).every(Boolean);
  return Object.freeze({
    ...claim,
    search_plan: createSearchPlan(claim),
    evidence_bindings: Object.freeze(bindings),
    confirmation_gates: gates,
    status: confirmed ? 'CONFIRMED' : 'UNDETERMINED',
    undetermined_reasons: Object.freeze(unique(reasons))
  });
}

function buildCanonicalTaskRecords(tasks = [], normalizedEvidenceByTask = {}) {
  return Object.freeze(tasks.flatMap((task) => extractCanonicalClaims(task).map((claim) => confirmClaim(claim, normalizedEvidenceByTask[task.id] || {}))));
}

function projectFactLane(records = [], taskId = null) {
  const own = records.filter((record) => !taskId || record.task_id === taskId);
  return Object.freeze({
    pillar: 'fact', task_id: taskId,
    confirmed: Object.freeze(own.filter((r) => r.status === 'CONFIRMED')),
    undetermined: Object.freeze(own.filter((r) => r.status === 'UNDETERMINED')),
    opinions: Object.freeze([]),
    rule_ids: Object.freeze(['V4-FACT-CANONICAL-CLAIM-ONLY', 'V4-CONFIRMED-UNDETERMINED-ONLY']),
    authority: Object.freeze({ owns: ['claim_projection'], does_not_own: ['recommendation', 'ranking', 'selection'] })
  });
}

function projectCompareLane(records = [], task = {}, domain = {}) {
  const own = records.filter((record) => record.task_id === task.id);
  const byStatus = { CONFIRMED: own.filter((r) => r.status === 'CONFIRMED').length, UNDETERMINED: own.filter((r) => r.status === 'UNDETERMINED').length };
  const conflicts = own.filter((r) => (r.undetermined_reasons || []).includes('CONFLICT')).map((r) => r.claim_id);
  const scopeMatrix = own.map((r) => ({ claim_id: r.claim_id, subject: r.subject, time_scope: r.time_scope, jurisdiction: r.jurisdiction, version_scope: r.version_scope, status: r.status }));
  return Object.freeze({
    pillar: 'compare', task_id: task.id,
    counts: Object.freeze(byStatus),
    scope_matrix: Object.freeze(scopeMatrix),
    conflicts: Object.freeze(conflicts),
    compare_lens: Object.freeze([...(domain.primary?.compare_lens || [])]),
    evidence_bound_claim_count: own.filter((r) => (r.evidence_bindings || []).length > 0).length,
    authority: Object.freeze({ owns: ['counts', 'scope_matrix', 'conflicts', 'compare_lens'], does_not_own: ['score', 'candidate_ranking', 'selected_candidate', 'rejected_candidates', 'decision', 'recommendation'] })
  });
}

module.exports = {
  normalize,
  unique,
  fragmentInput,
  extractContextContracts,
  enrichTasks,
  validateTaskGraph,
  extractCanonicalClaims,
  createSearchPlan,
  bindEvidence,
  confirmClaim,
  buildCanonicalTaskRecords,
  projectFactLane,
  projectCompareLane,
  POLICIES
};
