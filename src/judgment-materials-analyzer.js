'use strict';

const EN_ACTIONS = [
  ['verify', /\b(?:verify|validate|audit|investigate|analy[sz]e|evaluate|check)\b/i],
  ['compare', /\b(?:compare|versus|vs)\b/i],
  ['decide', /\b(?:decide|select|choose|recommend|adopt)\b/i],
  ['improve', /\b(?:improve|optimi[sz]e|fix|refactor|strengthen)\b/i],
  ['implement', /\b(?:implement|build|create|develop|add)\b/i],
  ['integrate', /\b(?:integrate|connect|link|incorporate)\b/i],
  ['migrate', /\b(?:migrate|replace|switch)\b/i],
  ['remove', /\b(?:remove|delete|eliminate)\b/i],
  ['preserve', /\b(?:keep|preserve|retain)\b/i],
  ['explain', /\b(?:explain|describe)\b/i]
].map(([id, re]) => ({ id, re }));

const norm = (value) => String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
const unique = (items) => [...new Set((items || []).map((item) => String(item || '').trim()).filter(Boolean))];
const isJapaneseText = (text) => /[ぁ-んァ-ヶ一-龠々]/.test(String(text || ''));

function segmentSource(input) {
  const text = String(input || '');
  const parts = [];
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (!/[.!?。！？\n;]/.test(text[index])) continue;
    const end = index + 1;
    const raw = text.slice(start, end);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (end - right > start + left) parts.push({ start: start + left, end: end - right, text: text.slice(start + left, end - right) });
    start = end;
  }
  if (start < text.length) {
    const raw = text.slice(start);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (text.length - right > start + left) parts.push({ start: start + left, end: text.length - right, text: text.slice(start + left, text.length - right) });
  }
  return parts;
}

const splitSentences = (value) => segmentSource(norm(value)).map((item) => item.text);

function englishAction(text) {
  for (const item of EN_ACTIONS) {
    const match = item.re.exec(text);
    if (match) return { id: item.id, index: match.index, match: match[0] };
  }
  return { id: 'analyze', index: -1, match: '' };
}

function englishTarget(text, action) {
  const before = action.index > 0 ? text.slice(0, action.index).trim() : '';
  if (before) return before.replace(/^(?:please|then|next)\s+/i, '').replace(/\b(?:to|and)\s*$/i, '').trim().slice(0, 160);
  const after = action.index >= 0 ? text.slice(action.index + action.match.length).trim() : text.trim();
  return (after || 'input target').replace(/^[\s:,-]+/, '').slice(0, 160);
}

function objectiveFor(action, target) {
  const name = target || 'the target';
  const map = {
    verify: `Verify ${name} while separating supported facts, unresolved claims, risks, and evidence gaps.`,
    compare: `Compare viable options for ${name} under the same explicit criteria.`,
    decide: `Decide ${name} from explicit evidence, risk, constraints, and unresolved state.`,
    improve: `Improve ${name} while preserving stated constraints and acceptance conditions.`,
    implement: `Implement ${name} while preserving dependencies, hard constraints, and verification conditions.`,
    integrate: `Integrate ${name} while preserving boundaries, dependencies, and failure handling.`,
    migrate: `Migrate ${name} without losing required behavior, compatibility, or rollback.`,
    remove: `Remove ${name} without breaking preserved behavior or dependencies.`,
    preserve: `Preserve ${name} while related changes proceed.`,
    explain: `Explain ${name} using explicit facts, constraints, and decision implications.`,
    analyze: `Structure ${name} into deterministic decision material.`
  };
  return map[action] || map.analyze;
}

function opaqueJapaneseRequest(question, context = '') {
  const q = String(question || '');
  const task = {
    id: 'JP-MCP-REQUIRED',
    source_span: { start: 0, end: q.length, text: q },
    raw_text: q,
    clause_type: 'opaque_japanese_input', actionable: true, action: 'analyze', target: 'UNRESOLVED_JAPANESE_INPUT',
    objective: 'Deterministic Japanese Parser MCP result is required before Astera can build decision material.',
    deliverables: [], premises: [], constraints: [], prohibitions: [], preserve: [], replace: [], conditions: [], exceptions: [], deadlines: [],
    priority: 'normal', order: 1, depends_on: [], parallelizable: false,
    success_criteria: [], verification: [], completion_criteria: [], unresolved: ['japanese_reading_requires_mcp'],
    evidence_need: { required: false, reasons: [], queries: [] }, external_action: false,
    hard_blockers: ['JAPANESE_READING_REQUIRES_MCP']
  };
  return {
    schema_version: 'astera.request-model.v2', language: 'ja', normalized_question: q,
    target: task.target, target_confidence: 'unresolved', action: task.action, objective: task.objective,
    success_criteria: [], constraints: [], prohibitions: [], preserve: [], replace: [], verification: [], query_terms: [],
    context_present: Boolean(context), context_length: String(context || '').length,
    instruction_map: { clause_count: 0, task_count: 1, correction_count: 0, prohibition_count: 0, preserve_count: 0, verification_count: 0 },
    analysis_task_packet: {
      schema_version: 'astera.analysis-task-packet.v1', intent: 'analyze', tasks: [task], dependencies: [], execution_waves: [['JP-MCP-REQUIRED']],
      constraints: [], prohibitions: [], preserve: [], replace: [], verification: [], completion_criteria: [],
      unresolved: ['JAPANESE_READING_REQUIRES_MCP'], conflicts: [], hard_blockers: ['JAPANESE_READING_REQUIRES_MCP'],
      source_spans: [{ task_id: task.id, ...task.source_span }]
    }
  };
}

function analyzeRequest({ question = '', context = '' } = {}) {
  const q = norm(question);
  const ctx = norm(context);
  if (isJapaneseText(q)) return opaqueJapaneseRequest(q, ctx);
  const spans = segmentSource(q);
  const tasks = (spans.length ? spans : [{ start: 0, end: q.length, text: q }]).filter((span) => span.text.trim()).map((span, index) => {
    const action = englishAction(span.text);
    const target = englishTarget(span.text, action);
    const dependsOn = index > 0 && /^(?:then|next|after|finally)\b/i.test(span.text.trim()) ? [`T${String(index).padStart(2, '0')}`] : [];
    return {
      id: `T${String(index + 1).padStart(2, '0')}`,
      source_span: { ...span }, raw_text: span.text, clause_type: 'instruction', actionable: true, action: action.id, target,
      objective: objectiveFor(action.id, target), deliverables: [], premises: [], constraints: [], prohibitions: [], preserve: [], replace: [], conditions: [], exceptions: [], deadlines: [],
      priority: 'normal', order: index + 1, depends_on: dependsOn, parallelizable: dependsOn.length === 0,
      success_criteria: [], verification: [], completion_criteria: [], unresolved: [], evidence_need: { required: false, reasons: [], queries: [] }, external_action: ['implement', 'improve', 'integrate', 'migrate', 'remove'].includes(action.id), hard_blockers: []
    };
  });
  const dependencies = tasks.flatMap((task) => task.depends_on.map((from) => ({ from, to: task.id, type: 'ORDER_AFTER', reason: 'explicit_english_order' })));
  return {
    schema_version: 'astera.request-model.v2', language: 'en', normalized_question: q,
    target: tasks[0]?.target || 'input target', target_confidence: 'best_effort_non_japanese', action: tasks[0]?.action || 'analyze', objective: tasks[0]?.objective || objectiveFor('analyze', 'input target'),
    success_criteria: [], constraints: [], prohibitions: [], preserve: [], replace: [], verification: [], query_terms: extractTerms(`${q}\n${ctx}`),
    context_present: Boolean(ctx), context_length: ctx.length,
    instruction_map: { clause_count: spans.length, task_count: tasks.length, correction_count: 0, prohibition_count: 0, preserve_count: 0, verification_count: tasks.filter((task) => task.action === 'verify').length },
    analysis_task_packet: { schema_version: 'astera.analysis-task-packet.v1', intent: tasks[0]?.action || 'analyze', tasks, dependencies, execution_waves: buildExecutionWaves(tasks, dependencies), constraints: [], prohibitions: [], preserve: [], replace: [], verification: [], completion_criteria: [], unresolved: [], conflicts: [], hard_blockers: [], source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span })) }
  };
}

function extractTerms(text) {
  return unique((norm(text).match(/[A-Za-z][A-Za-z0-9_.:/-]{1,}|\d+(?:\.\d+){0,3}/g) || []).map((item) => item.toLowerCase())).slice(0, 64);
}

function deriveEvidenceNeed(task = {}, domain = {}) {
  const reasons = unique(task.evidence_need?.reasons || []);
  if (task.evidence_need?.required) reasons.push('task_contract_requires_evidence');
  if (['verify', 'compare', 'decide'].includes(task.action) && (domain.primary?.evidence_to_collect || []).length) reasons.push(`action:${task.action}`);
  const overlays = (domain.overlays || []).map((item) => item.id);
  if (overlays.includes('current_information')) reasons.push('overlay:current_information');
  if (overlays.includes('evidence_strict')) reasons.push('overlay:evidence_strict');
  return { required: reasons.length > 0, reasons: unique(reasons), queries: unique([...(task.evidence_need?.queries || []), ...(reasons.length ? (domain.primary?.evidence_to_collect || []) : [])]).slice(0, 16) };
}

function buildExecutionWaves(tasks = [], dependencies = []) {
  const ids = new Set(tasks.map((task) => task.id));
  const incoming = new Map(tasks.map((task) => [task.id, new Set()]));
  for (const dependency of dependencies) if (ids.has(dependency.from) && ids.has(dependency.to)) incoming.get(dependency.to).add(dependency.from);
  const remaining = new Set(ids);
  const waves = [];
  while (remaining.size) {
    const ready = [...remaining].filter((id) => [...incoming.get(id)].every((parent) => !remaining.has(parent))).sort();
    if (!ready.length) { waves.push([...remaining].sort()); break; }
    waves.push(ready);
    ready.forEach((id) => remaining.delete(id));
  }
  return waves;
}

function evidenceClaim(item) {
  return norm(item?.fields?.claim || item?.excerpt || item?.title || item?.canonical_record_id || '');
}

function normalizeEvidencePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return Object.freeze({ schema_version: 'astera.evidence-packet.compact.v1', state: 'NOT_PROVIDED', source_status: null, quality_score_bp: null, coverage_state: 'UNKNOWN', conflict_detected: false, evidence: Object.freeze([]), provider_failures: Object.freeze([]) });
  const source = packet.result && packet.schema_version === 'astera.evidence-search.module-response.v1' ? packet.result : packet;
  const status = String(source.status || 'UNKNOWN');
  const quality = source.quality?.final || {};
  const evidence = (Array.isArray(source.evidence) ? source.evidence : []).map((item) => Object.freeze({
    id: String(item.candidate_id || item.canonical_record_id || ''), claim: evidenceClaim(item), source_role: String(item.source_role || '').toUpperCase(), authority_id: String(item.authority_id || item.publisher?.id || ''), source_id: String(item.source_id || item.provider_id || ''),
    url: item.canonical_locator?.url || null, replayable: item.canonical_locator?.replayable === true, updated_at: item.updated_at || item.published_at || null, version: item.version || null, fields: Object.freeze({ ...(item.fields || {}) })
  })).filter((item) => item.claim || item.id);
  const failures = [...(source.provider_execution?.initial || []), ...(source.provider_execution?.reinforcement || [])].filter((item) => item.status && item.status !== 'FULFILLED').map((item) => ({ provider_id: item.provider_id || '', error_code: item.error_code || 'PROVIDER_FAILED' }));
  return Object.freeze({
    schema_version: 'astera.evidence-packet.compact.v1',
    state: status === 'FINAL_VALID' ? 'VALID' : status.startsWith('REJECTED') ? 'REJECTED' : status === 'NOT_REQUIRED' ? 'NOT_REQUIRED' : 'PARTIAL',
    source_status: status, quality_score_bp: Number.isInteger(quality.score_bp) ? quality.score_bp : null,
    coverage_state: String(source.coverage?.discovery_scope_state || source.coverage?.registry_coverage_state || 'UNKNOWN'),
    conflict_detected: /CONFLICT/.test(JSON.stringify(quality).toUpperCase()), effective_as_of: source.effective_as_of || null,
    evidence: Object.freeze(evidence), provider_failures: Object.freeze(failures)
  });
}

function characterGrams(text) {
  const compact = norm(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (!compact) return [];
  if (compact.length <= 3) return [compact];
  const grams = [];
  for (let index = 0; index <= compact.length - 3; index += 1) grams.push(compact.slice(index, index + 3));
  return unique(grams);
}

function tokenOverlap(left, right) {
  const a = norm(left).toLowerCase();
  const b = norm(right).toLowerCase();
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 1;
  const x = new Set(characterGrams(a));
  const y = new Set(characterGrams(b));
  if (!x.size || !y.size) return 0;
  let hits = 0;
  for (const gram of x) if (y.has(gram)) hits += 1;
  return hits / Math.max(1, Math.min(x.size, y.size));
}

function matchingEvidence(text, packet, threshold = 0.25) {
  return (packet?.evidence || []).map((item) => ({ item, overlap: tokenOverlap(text, item.claim) })).filter((entry) => entry.overlap >= threshold).sort((a, b) => b.overlap - a.overlap);
}

module.exports = {
  analyzeRequest, opaqueJapaneseRequest, normalizeEvidencePacket, normalizeText: norm, splitSentences, segmentSource,
  extractTerms, matchingEvidence, tokenOverlap, unique, deriveEvidenceNeed, buildExecutionWaves, isJapaneseText
};
