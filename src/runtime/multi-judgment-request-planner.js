'use strict';

const EXTERNAL_EVIDENCE_CUE = /(?:検証|事実確認|ファクトチェック|裏取り|調査|リサーチ|根拠|出典|公式(?:根拠|情報|Source)?|verify|validate|fact\s*check|research|investigate|evidence|source)/iu;
const PURE_PROHIBITION = /(?:最終判断|最終結論|推奨|採用|選定)[^。！？!?]{0,80}(?:しない|しないで|禁止|せず|出さない)|(?:must\s+not|do\s+not|never)\b/iu;
const UMBRELLA_MATERIAL = /(?:判断材料|decision\s+material)[^。！？!?]{0,100}(?:整理|まとめ|構造化|organize|structure)/iu;
const REQUEST_CUE = /(?:してください|してくれ|してほしい|しろ|せよ|するように|ようにしろ|なくせ|なくして|消して|削除して|除去して|外して|直して|見直して|改善して|修正して|調整して|検討して|確認して|調査して|比較して|整理して|表示して|入れて|付けて|追加して|実装して|対応して|レビュー(?:して|する|しろ|せよ)?|please\b|should\b|need\s+to|must\b)/iu;
const REQUEST_CONTINUATIVE_CUE = /(?:見直し|改善し|修正し|調整し|検討し|確認し|調査し|比較し|整理し|表示し|追加し|実装し|対応し|削除し|除去し|消し|外し|なくし)(?:て)?$/iu;
const ISSUE_CUE = /(?:エラー|失敗|できない|表示されない|表示される|出る|でる|入る|はいる|崩れる|消える|残る|線|不具合|問題|error|fail|broken|unexpected|line\b|artifact)/iu;
const PREVIOUS_REQUEST_SEQUENCE = /^(?:その後|次に|続いて|最後に)|(?:前(?:の|述)|直前|上記|それ|これ)[^。！？!?]{0,60}(?:完了|終了|確認|成功|失敗)[^。！？!?]{0,30}(?:後|たら|れば)|(?:前(?:の|述)|直前|上記|それ|これ)[^。！？!?]{0,60}(?:してから|終わったら)/iu;
const GLOBAL_SCOPE_CUE = /(?:全体|すべて|全て|全部|共通|各要求|全要求|各Task|各タスク|globally|across\s+all|all\s+requests|every\s+request)/iu;
const CANONICAL_ACTIONS = new Set(['analyze','verify','compare','decide','improve','implement','integrate','migrate','remove','preserve','explain']);
const SUPPORT_ACTIONS = new Set(['analyze','verify']);

function norm(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
}
function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}
function sentenceSpans(text) {
  const source = String(text || '');
  const rawSpans = [];
  const re = /[^。！？!?\n]+(?:[。！？!?]|$)/gu;
  for (const match of source.matchAll(re)) {
    const raw = match[0];
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    const start = Number(match.index || 0) + left;
    const end = Number(match.index || 0) + raw.length - right;
    if (end > start) rawSpans.push({ start, end, text: source.slice(start, end) });
  }
  const spans = [];
  for (const span of rawSpans) {
    const value = norm(span.text);
    const previous = spans.at(-1);
    if (previous && /^(?:の|という|といった)/u.test(value)) {
      previous.end = span.end;
      previous.text = source.slice(previous.start, span.end);
      continue;
    }
    spans.push({ ...span });
  }
  return spans;
}
function requestAction(text) {
  const value = norm(text);
  if (/(?:比較|比べ|compare|versus|\bvs\.?\b)/iu.test(value)) return 'compare';
  if (/(?:削除|除去|なく(?:す|せ|し)|消(?:す|して|せ|し)|外(?:す|して|せ|し)|remove|delete|eliminate)/iu.test(value)) return 'remove';
  if (/(?:検証|事実確認|ファクトチェック|裏取り|監査|確認|調査|リサーチ|verify|validate|audit|research|investigate|check)/iu.test(value)) return 'verify';
  if (/(?:追加|実装|作成|構築|入れ(?:る|て|ろ)|付け(?:る|て|ろ)|設け(?:る|て|ろ)|表示(?:する|して|しろ)|implement|build|create|add|display|show)/iu.test(value)) return 'implement';
  if (/(?:改善|改良|修正|見直|直(?:す|して|せ)|調整|整理|improve|fix|refactor|adjust|organize)/iu.test(value)) return 'improve';
  if (/(?:検討|考慮|吟味|レビュー|consider|review)/iu.test(value)) return 'analyze';
  return 'analyze';
}
function canonicalTaskAction(task = {}, text = '') {
  const raw = norm(task.action || task.intent_type || task.type).toLowerCase();
  if (CANONICAL_ACTIONS.has(raw)) return raw;
  return requestAction(`${task.action || ''} ${task.intent_type || ''} ${text}`);
}
function requestText(spanText) {
  return norm(spanText)
    .replace(/^[\s、,]*(?:また|さらに|加えて|そして|それと|あと|なお)\s*/u, '')
    .replace(/[。！？!?]+$/u, '')
    .trim();
}
function isRequestSpan(text) {
  const value = norm(text);
  if (!value || PURE_PROHIBITION.test(value)) return false;
  const trimmed = value.replace(/[。！？!?]+$/u, '');
  return REQUEST_CUE.test(value) || REQUEST_CONTINUATIVE_CUE.test(trimmed);
}
function spanIntersection(left = {}, right = {}) {
  const start = Math.max(Number(left.start || 0), Number(right.start || 0));
  const end = Math.min(Number(left.end || 0), Number(right.end || 0));
  return Math.max(0, end - start);
}
function spanLength(span = {}) {
  return Math.max(0, Number(span.end || 0) - Number(span.start || 0));
}
function spanOverlapRatio(left = {}, right = {}) {
  const overlap = spanIntersection(left, right);
  if (!overlap) return 0;
  return overlap / Math.max(1, spanLength(right));
}
function spansOverlap(left = {}, right = {}) {
  return spanIntersection(left, right) > 0;
}
function sourceSpanForTask(task = {}, question = '') {
  const span = task.source_span || task.original_span || {};
  const start = Number(span.start);
  const end = Number(span.end);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return { start, end, text: String(span.text || span.source_text || question.slice(start, end)) };
  }
  const raw = norm(task.raw_text || span.text || span.source_text || task.purpose || task.objective || task.target);
  if (!raw) return null;
  const index = String(question).indexOf(raw);
  if (index < 0) return null;
  return { start: index, end: index + raw.length, text: String(question).slice(index, index + raw.length) };
}
function commaChunks(span, source) {
  const chunks = [];
  let cursor = span.start;
  const text = source.slice(span.start, span.end);
  for (const match of text.matchAll(/[、,;；]+/gu)) {
    const boundary = span.start + Number(match.index || 0);
    const raw = source.slice(cursor, boundary);
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    if (boundary - right > cursor + left) chunks.push({ start: cursor + left, end: boundary - right, text: source.slice(cursor + left, boundary - right) });
    cursor = boundary + match[0].length;
  }
  const raw = source.slice(cursor, span.end);
  const left = raw.length - raw.trimStart().length;
  const right = raw.length - raw.trimEnd().length;
  if (span.end - right > cursor + left) chunks.push({ start: cursor + left, end: span.end - right, text: source.slice(cursor + left, span.end - right) });
  return chunks;
}
function requestAtoms(span, source) {
  const chunks = commaChunks(span, source);
  const requestIndexes = chunks.map((chunk, index) => isRequestSpan(chunk.text) ? index : -1).filter((index) => index >= 0);
  if (requestIndexes.length <= 1) return isRequestSpan(span.text) || requestIndexes.length === 1 ? [span] : [];
  const atoms = [];
  let pendingStart = null;
  for (const chunk of chunks) {
    if (isRequestSpan(chunk.text)) {
      const start = pendingStart == null ? chunk.start : pendingStart;
      atoms.push({ start, end: chunk.end, text: source.slice(start, chunk.end) });
      pendingStart = null;
    } else if (pendingStart == null) {
      pendingStart = chunk.start;
    }
  }
  if (pendingStart != null && atoms.length) {
    const last = atoms[atoms.length - 1];
    last.end = span.end;
    last.text = source.slice(last.start, span.end);
  }
  return atoms;
}
function emptyContext() {
  return { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] };
}
function addContextValue(context, value) {
  const text = requestText(value);
  if (!text) return context;
  if (/(?:期限|締切|納期|までに|今日中|明日まで|今週中|来週|来月|deadline|due\s+date|\bby\s+\w+)/iu.test(text)) context.deadlines.push(text);
  if (/(?:変えない|変えず|変更しない|変更せず|維持|保持|残す|keep|preserve|retain|without\s+changing)/iu.test(text)) context.preserve.push(text);
  if (PURE_PROHIBITION.test(text)) context.prohibitions.push(text);
  if (/(?:未確認|未完了|未成立|終わっていない|完了していない|確認していない|not\s+yet|pending|incomplete)/iu.test(text)) context.unresolved.push(text);
  if (/(?:場合|なら|ならば|とき|たら|れば|if\b|when\b|provided\s+that)/iu.test(text)) context.conditions.push(text);
  if (/(?:ただし|例外|except\b|however\b)/iu.test(text)) context.exceptions.push(text);
  return context;
}
function finalizeContext(context) {
  for (const key of Object.keys(context)) context[key] = unique(context[key]);
  return context;
}
function contextForRequest(request) {
  return finalizeContext(addContextValue(emptyContext(), request.source_span?.text || request.request_text));
}
function extractJudgmentRequests(text) {
  const source = String(text || '');
  const candidates = sentenceSpans(source)
    .flatMap((span) => requestAtoms(span, source))
    .filter((span) => isRequestSpan(span.text))
    .map((span) => ({
      source_span: span,
      request_text: requestText(span.text),
      action: requestAction(span.text),
      umbrella: UMBRELLA_MATERIAL.test(span.text),
      source_origin: 'SOURCE_REQUEST_SPAN',
      parser_task_ids: []
    }));
  const substantive = candidates.filter((item) => !item.umbrella);
  const selected = substantive.length ? substantive : candidates;
  return selected.map((item, index) => {
    const request = {
      id: `R${String(index + 1).padStart(2, '0')}`,
      order: index + 1,
      action: item.action,
      request_text: item.request_text,
      source_span: item.source_span,
      source_origin: item.source_origin,
      parser_task_ids: [],
      external_evidence_requested: EXTERNAL_EVIDENCE_CUE.test(item.request_text)
    };
    return { ...request, local_context: contextForRequest(request) };
  });
}
function parserJudgmentRequests(question, tasks = []) {
  return tasks.map((task, index) => {
    const sourceSpan = sourceSpanForTask(task, question);
    const sourceText = requestText(sourceSpan?.text || task.raw_text || task.purpose || task.objective || task.target || '');
    if (!sourceText) return null;
    const request = {
      id: '',
      order: index + 1,
      action: canonicalTaskAction(task, sourceText),
      request_text: sourceText,
      source_span: sourceSpan || { start: Number.MAX_SAFE_INTEGER - index, end: Number.MAX_SAFE_INTEGER - index + sourceText.length, text: sourceText },
      source_origin: 'PARSER_TASK_GRAPH',
      parser_task_id: task.id || null,
      parser_task_ids: task.id ? [String(task.id)] : [],
      parser_external_action: task.external_action === true,
      external_evidence_requested: task.evidence_need?.required === true || EXTERNAL_EVIDENCE_CUE.test(sourceText)
    };
    return { ...request, local_context: contextForRequest(request) };
  }).filter(Boolean);
}
function sameSourceUnit(left, right) {
  const overlap = spanIntersection(left.source_span, right.source_span);
  if (!overlap) return false;
  const leftCoverage = overlap / Math.max(1, spanLength(left.source_span));
  const rightCoverage = overlap / Math.max(1, spanLength(right.source_span));
  return leftCoverage >= 0.6 && rightCoverage >= 0.35;
}
function directParserRequest(parserRequest) {
  return isRequestSpan(parserRequest.request_text)
    || parserRequest.parser_external_action === true
    || !SUPPORT_ACTIONS.has(String(parserRequest.action || 'analyze'));
}
function nearestPrecedingRequest(requests, parserRequest) {
  const start = Number(parserRequest.source_span?.start || 0);
  return [...requests]
    .filter((request) => Number(request.source_span?.start || 0) <= start)
    .sort((a, b) => Number(b.source_span?.start || 0) - Number(a.source_span?.start || 0))[0] || null;
}
function intentCanOwnParserTasks(intent, parserRequests) {
  if (!intent?.purpose) return false;
  const source = String(intent.source || '');
  if (source === 'OBSERVABLE_MATERIAL') return true;
  if (!['EXPLICIT_INSTRUCTION', 'EXPLICIT_PURPOSE_OVERRIDE'].includes(source)) return false;
  const strong = parserRequests.filter((request) => directParserRequest(request) && !SUPPORT_ACTIONS.has(String(request.action || '')));
  return strong.length <= 1;
}
function intentBackedMaterialRequest(question, intent, parserRequests) {
  if (!intentCanOwnParserTasks(intent, parserRequests)) return null;
  const source = String(intent.source || 'INTENT');
  const request = {
    id: 'R01', order: 1,
    action: requestAction(intent.purpose),
    request_text: String(intent.purpose),
    source_span: { start: 0, end: question.length, text: question },
    source_origin: `${source}_INTENT`,
    parser_task_ids: unique(parserRequests.flatMap((item) => item.parser_task_ids || [])),
    external_evidence_requested: parserRequests.some((item) => item.external_evidence_requested)
  };
  return { ...request, local_context: emptyContext() };
}
function mergeParserOnlyRequests(parserRequests = []) {
  const merged = [];
  for (const parserRequest of parserRequests) {
    const existing = merged.find((request) => sameSourceUnit(request, parserRequest));
    if (existing) {
      existing.parser_task_ids = unique([...(existing.parser_task_ids || []), ...(parserRequest.parser_task_ids || [])]);
      existing.external_evidence_requested = existing.external_evidence_requested || parserRequest.external_evidence_requested;
      if (!SUPPORT_ACTIONS.has(parserRequest.action)) existing.action = parserRequest.action;
      continue;
    }
    merged.push({ ...parserRequest, parser_task_ids: [...(parserRequest.parser_task_ids || [])] });
  }
  return merged;
}
function mergeJudgmentRequests(question, sourceRequests = [], tasks = [], intent = null) {
  const parserRequests = parserJudgmentRequests(question, tasks);
  if (!sourceRequests.length) {
    const intentRequest = intentBackedMaterialRequest(question, intent, parserRequests);
    const base = intentRequest ? [intentRequest] : mergeParserOnlyRequests(parserRequests);
    return base.map((item, index) => ({ ...item, id: `R${String(index + 1).padStart(2, '0')}`, order: index + 1 }));
  }

  const merged = sourceRequests.map((request) => ({ ...request, parser_task_ids: [] }));
  for (const parserRequest of parserRequests) {
    const overlapping = merged.filter((request) => sameSourceUnit(request, parserRequest));
    if (overlapping.length === 1) {
      const owner = overlapping[0];
      owner.parser_task_ids = unique([...(owner.parser_task_ids || []), ...(parserRequest.parser_task_ids || [])]);
      owner.external_evidence_requested = owner.external_evidence_requested || parserRequest.external_evidence_requested;
      owner.source_origin = 'PARSER_TASK_GRAPH_AND_SOURCE_SPAN';
      continue;
    }
    const covered = merged.filter((request) => spanOverlapRatio(parserRequest.source_span, request.source_span) >= 0.7);
    if (covered.length >= 2) continue;
    if (directParserRequest(parserRequest)) {
      merged.push({ ...parserRequest, parser_task_ids: [...(parserRequest.parser_task_ids || [])] });
      continue;
    }
    const owner = nearestPrecedingRequest(merged.filter((request) => request.source_origin !== 'PARSER_TASK_GRAPH'), parserRequest);
    if (owner) {
      owner.parser_task_ids = unique([...(owner.parser_task_ids || []), ...(parserRequest.parser_task_ids || [])]);
      owner.external_evidence_requested = owner.external_evidence_requested || parserRequest.external_evidence_requested;
    }
  }

  merged.sort((a, b) => Number(a.source_span?.start || 0) - Number(b.source_span?.start || 0) || Number(a.order || 0) - Number(b.order || 0));
  return merged.map((item, index) => ({
    ...item,
    id: `R${String(index + 1).padStart(2, '0')}`,
    order: index + 1,
    parser_task_ids: unique(item.parser_task_ids || []),
    ...(unique(item.parser_task_ids || []).length === 1 ? { parser_task_id: unique(item.parser_task_ids || [])[0] } : {}),
    local_context: item.local_context || contextForRequest(item)
  }));
}
function extractInputObservations(text, requests = []) {
  const out = [];
  for (const span of sentenceSpans(text)) {
    const value = requestText(span.text);
    if (!ISSUE_CUE.test(value)) continue;
    const hits = requests.filter((item) => spansOverlap(item.source_span, span));
    out.push({
      id: `O${String(out.length + 1).padStart(2, '0')}`,
      text: value,
      source_span: span,
      request_ids: hits.map((item) => item.id),
      source_type: hits.length ? 'USER_REPORTED_STATE_WITH_REQUEST' : 'USER_REPORTED_STATE'
    });
  }
  return out;
}
function extractGlobalContext(text, requests = []) {
  const context = emptyContext();
  for (const span of sentenceSpans(text)) {
    const overlapsRequest = requests.some((request) => spansOverlap(request.source_span, span));
    if (!overlapsRequest || GLOBAL_SCOPE_CUE.test(span.text)) addContextValue(context, span.text);
  }
  return finalizeContext(context);
}
function requestRelations(requests = []) {
  const relations = [];
  for (let index = 1; index < requests.length; index += 1) {
    const current = requests[index];
    if (!PREVIOUS_REQUEST_SEQUENCE.test(norm(current.source_span?.text || current.request_text))) continue;
    relations.push({
      from_request_id: requests[index - 1].id,
      to_request_id: current.id,
      type: 'EXPLICIT_SEQUENCE',
      reason: 'SOURCE_SEQUENCE_CUE'
    });
  }
  return relations;
}
function parserDependencyRelations(requests = [], tasks = [], dependencies = []) {
  const taskToRequest = new Map();
  for (const request of requests) for (const taskId of request.parser_task_ids || []) taskToRequest.set(String(taskId), request.id);
  const edges = [];
  for (const task of tasks) {
    for (const dependency of task.depends_on || []) edges.push({ from: String(dependency), to: String(task.id), type: 'PARSER_TASK_DEPENDENCY' });
  }
  for (const edge of dependencies || []) {
    if (!edge || typeof edge !== 'object') continue;
    const from = edge.from || edge.source || edge.parent_task_id || edge.depends_on;
    const to = edge.to || edge.target || edge.child_task_id || edge.task_id;
    if (from && to) edges.push({ from: String(from), to: String(to), type: edge.type || 'PARSER_TASK_DEPENDENCY' });
  }
  const out = [];
  const seen = new Set();
  for (const edge of edges) {
    const fromRequest = taskToRequest.get(edge.from);
    const toRequest = taskToRequest.get(edge.to);
    if (!fromRequest || !toRequest || fromRequest === toRequest) continue;
    const key = `${fromRequest}|${toRequest}|${edge.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from_request_id: fromRequest, to_request_id: toRequest, type: edge.type, reason: 'PARSER_TASK_GRAPH' });
  }
  return out;
}
function buildCaseModel(text, tasks = [], dependencies = [], intent = null) {
  const question = String(text || '');
  const sourceRequests = extractJudgmentRequests(question);
  const judgmentRequests = mergeJudgmentRequests(question, sourceRequests, tasks, intent);
  const observations = extractInputObservations(question, judgmentRequests);
  const globalContext = extractGlobalContext(question, judgmentRequests);
  const relations = [...requestRelations(judgmentRequests), ...parserDependencyRelations(judgmentRequests, tasks, dependencies)];
  const seenRelations = new Set();
  const requestRelationList = relations.filter((relation) => {
    const key = `${relation.from_request_id}|${relation.to_request_id}|${relation.type}`;
    if (seenRelations.has(key)) return false;
    seenRelations.add(key);
    return true;
  });
  return {
    schema_version: 'astera.case-model.v1',
    source: tasks.length ? 'PARSER_TASK_GRAPH_WITH_SOURCE_RECOVERY' : 'ORIGINAL_QUESTION',
    request_count: judgmentRequests.length,
    judgment_requests: judgmentRequests,
    observations,
    global_context: globalContext,
    request_relations: requestRelationList,
    multi_judgment: judgmentRequests.length > 1
  };
}
function requestTaskIndices(tasks, request) {
  const ids = new Set((request.parser_task_ids || []).map(String));
  if (ids.size) return tasks.map((task, index) => ids.has(String(task.id)) ? index : -1).filter((index) => index >= 0);
  return tasks.map((task, index) => spanOverlapRatio(task?.source_span, request.source_span) >= 0.5 ? index : -1).filter((index) => index >= 0);
}
function contextFields(context = {}) {
  return {
    constraints: unique(context.deadlines || []),
    prohibitions: unique(context.prohibitions || []),
    preserve: unique(context.preserve || []),
    deadlines: unique(context.deadlines || []),
    conditions: unique(context.conditions || []),
    exceptions: unique(context.exceptions || []),
    unresolved: unique(context.unresolved || [])
  };
}
function localOnlyValues(caseModel, field) {
  const contextKey = field === 'constraints' ? 'deadlines' : field;
  const global = new Set(caseModel.global_context?.[contextKey] || []);
  return new Set((caseModel.judgment_requests || []).flatMap((request) => request.local_context?.[contextKey] || []).filter((value) => !global.has(value)));
}
function globalFields(packet, caseModel) {
  const context = contextFields(caseModel.global_context || {});
  const out = {};
  for (const field of Object.keys(context)) {
    const localOnly = localOnlyValues(caseModel, field);
    out[field] = unique([...(packet[field] || []).filter((value) => !localOnly.has(value)), ...(context[field] || [])]);
  }
  return out;
}
function fieldsForRequest(request, global, caseModel) {
  const local = contextFields(request.local_context || {});
  const out = {};
  for (const field of Object.keys(global)) out[field] = unique([...(global[field] || []), ...(local[field] || [])]);
  return out;
}
function recoveredTask(request, index, global, caseModel) {
  const id = `T${String(index + 1).padStart(2, '0')}`;
  const localObservations = (caseModel.observations || []).filter((item) => (item.request_ids || []).includes(request.id) || spansOverlap(item.source_span, request.source_span));
  const evidenceRequired = request.external_evidence_requested === true;
  const fields = fieldsForRequest(request, global, caseModel);
  return {
    id,
    order: index + 1,
    request_id: request.id,
    action: request.action,
    target: request.request_text,
    objective: request.request_text,
    purpose: request.request_text,
    user_goal: request.request_text,
    material_only: true,
    source_span: { ...request.source_span },
    raw_text: request.source_span.text,
    source_role: 'DIRECT_INPUT',
    source_axes: { container_role: ['PLAIN_CONTAINER'], content_role: ['INSTRUCTION_OR_REQUEST'], quotation_role: ['DIRECT'] },
    actionable: true,
    premises: unique(localObservations.map((item) => item.text)),
    constraints: fields.constraints,
    prohibitions: fields.prohibitions,
    preserve: fields.preserve,
    replace: [], verification: [], completion_criteria: [], success_criteria: [],
    conditions: fields.conditions, exceptions: fields.exceptions, deadlines: fields.deadlines,
    priority_records: [], deliverables: [], unresolved: fields.unresolved, hard_blockers: [], depends_on: [], branches: [],
    conditional_branch: null, execution_gate: 'ALWAYS', parallel_group: 'MULTI_JUDGMENT_REQUESTS', supersedes: [], superseded_by: [],
    evidence_need: {
      required: evidenceRequired,
      queries: evidenceRequired ? [request.request_text] : [],
      reasons: evidenceRequired ? ['EXPLICIT_EXTERNAL_EVIDENCE_REQUEST'] : []
    },
    field_provenance: {
      purpose: [{ source: 'ORIGINAL_QUESTION_REQUEST_SPAN', request_id: request.id }],
      target: [{ source: 'ORIGINAL_QUESTION_REQUEST_SPAN', request_id: request.id }],
      local_context: [{ source: 'ORIGINAL_QUESTION_REQUEST_SPAN', request_id: request.id }],
      case_model: [{ source: 'ASTERA_MULTI_JUDGMENT_REQUEST_PLANNER', request_id: request.id }]
    }
  };
}
function scopePreservedTask(task, request, global, caseModel) {
  const fields = fieldsForRequest(request, global, caseModel);
  const out = { ...task, request_id: request.id };
  for (const field of Object.keys(fields)) {
    const localOnly = localOnlyValues(caseModel, field);
    out[field] = unique([...(task[field] || []).filter((value) => !localOnly.has(value)), ...(fields[field] || [])]);
  }
  return out;
}
function recoveredGraph(tasks, caseModel) {
  const taskByRequest = new Map(tasks.map((task) => [task.request_id, task.id]));
  const dependencies = [];
  for (const relation of caseModel.request_relations || []) {
    const from = taskByRequest.get(relation.from_request_id);
    const to = taskByRequest.get(relation.to_request_id);
    if (from && to && from !== to) dependencies.push({ from, to, type: relation.type, reason: relation.reason });
  }
  const incoming = new Map(tasks.map((task) => [task.id, []]));
  for (const edge of dependencies) incoming.get(edge.to)?.push(edge.from);
  const nextTasks = tasks.map((task) => ({
    ...task,
    depends_on: unique(incoming.get(task.id) || []),
    parallel_group: (incoming.get(task.id) || []).length ? null : 'MULTI_JUDGMENT_REQUESTS'
  }));
  const remaining = new Set(nextTasks.map((task) => task.id));
  const done = new Set();
  const waves = [];
  while (remaining.size) {
    const wave = nextTasks.filter((task) => remaining.has(task.id) && (task.depends_on || []).every((id) => done.has(id))).map((task) => task.id);
    if (!wave.length) return { tasks: nextTasks, dependencies, execution_waves: [], valid: false, cycle: [...remaining] };
    waves.push(wave);
    for (const id of wave) { remaining.delete(id); done.add(id); }
  }
  return { tasks: nextTasks, dependencies, execution_waves: waves, valid: true, cycle: [] };
}
function caseMapping(caseModel, tasks) {
  const requestTaskIds = {};
  const taskMapping = {};
  for (const request of caseModel.judgment_requests || []) {
    const known = new Set((request.parser_task_ids || []).map(String));
    const ids = tasks.filter((task) => task.request_id === request.id || known.has(String(task.id))).map((task) => String(task.id));
    requestTaskIds[request.id] = unique(ids);
    if (requestTaskIds[request.id][0]) taskMapping[request.id] = requestTaskIds[request.id][0];
  }
  return { request_task_ids: requestTaskIds, task_mapping: taskMapping };
}
function cleanSingleGoal(value) {
  const goal = norm(value);
  return goal && goal.length <= 2000 ? goal : '';
}
function preferredSingleGoal(packet, request, intent) {
  return cleanSingleGoal(intent?.purpose) || cleanSingleGoal(packet.user_goal) || cleanSingleGoal(request?.request_text);
}
function expandMultiJudgmentRequest(prepared, input = {}) {
  if (!prepared?.analysis_task_packet) return prepared;
  const question = String(input.question ?? prepared.original_question ?? prepared.normalized_question ?? '');
  if (!question.trim()) return prepared;
  const packet = prepared.analysis_task_packet || {};
  const existingTasks = Array.isArray(packet.tasks) ? packet.tasks : [];
  const intent = prepared.standalone_api_intent || prepared.instruction_understanding?.analysis_intent || packet.analysis_intent || null;
  const caseModel = buildCaseModel(question, existingTasks, packet.dependencies || [], intent);
  const observable = {
    ...(packet.observable_material || prepared.observable_material || {}),
    case_model: caseModel,
    input_observations: (caseModel.observations || []).map((item) => item.text)
  };

  if (caseModel.request_count < 2) {
    const singleRequest = caseModel.judgment_requests[0] || null;
    const mappedTaskIds = new Set((singleRequest?.parser_task_ids || []).map(String));
    const tasks = singleRequest
      ? existingTasks.map((task) => mappedTaskIds.has(String(task.id)) ? { ...task, request_id: singleRequest.id } : task)
      : existingTasks;
    const mapping = caseMapping(caseModel, tasks);
    const packetCaseModel = { ...caseModel, ...mapping, representation_mode: 'PARSER_TASKS_PRESERVED' };
    const singleGoal = preferredSingleGoal(packet, singleRequest, intent);
    const nextObservable = { ...observable, case_model: packetCaseModel };
    return {
      ...prepared,
      ...(singleGoal ? { target: singleGoal, objective: singleGoal, user_goal: singleGoal } : {}),
      observable_material: nextObservable,
      analysis_task_packet: {
        ...packet,
        tasks,
        ...(singleGoal ? { user_goal: singleGoal } : {}),
        observable_material: nextObservable,
        case_model: packetCaseModel
      }
    };
  }

  const representation = caseModel.judgment_requests.map((request) => requestTaskIndices(existingTasks, request));
  const representedTaskIndexes = representation.flat();
  const allRepresented = representation.every((indices) => indices.length > 0)
    && new Set(representedTaskIndexes).size === representedTaskIndexes.length;
  const global = globalFields(packet, caseModel);
  let tasks;
  let dependencies;
  let executionWaves;
  let branches;
  let branchGroups;
  if (allRepresented) {
    const taskOwners = new Map();
    caseModel.judgment_requests.forEach((request, requestIndex) => {
      for (const taskIndex of representation[requestIndex]) if (!taskOwners.has(taskIndex)) taskOwners.set(taskIndex, request.id);
    });
    tasks = existingTasks.map((task, index) => {
      if (!taskOwners.has(index)) return task;
      const request = caseModel.judgment_requests.find((item) => item.id === taskOwners.get(index));
      return scopePreservedTask(task, request, global, caseModel);
    });
    dependencies = packet.dependencies || [];
    executionWaves = Array.isArray(packet.execution_waves) && packet.execution_waves.length ? packet.execution_waves.map((wave) => [...wave]) : [tasks.map((task) => task.id)];
    branches = packet.branches || [];
    branchGroups = packet.branch_groups || [];
  } else {
    const graph = recoveredGraph(caseModel.judgment_requests.map((request, index) => recoveredTask(request, index, global, caseModel)), caseModel);
    tasks = graph.tasks;
    dependencies = graph.dependencies;
    executionWaves = graph.execution_waves;
    branches = [];
    branchGroups = [];
  }
  const mapping = caseMapping(caseModel, tasks);
  const caseGoal = (caseModel.judgment_requests || []).map((request) => request.request_text).join(' / ');
  const packetCaseModel = {
    ...caseModel,
    ...mapping,
    representation_mode: allRepresented ? 'PARSER_TASKS_PRESERVED' : 'SOURCE_REQUESTS_RECOVERED'
  };
  const recovery = {
    applied: !allRepresented,
    request_count: caseModel.request_count,
    original_task_count: existingTasks.length,
    resulting_task_count: tasks.length,
    representation_mode: packetCaseModel.representation_mode
  };
  return {
    ...prepared,
    target: caseGoal,
    objective: caseGoal,
    user_goal: caseGoal,
    observable_material: { ...observable, case_model: packetCaseModel },
    instruction_understanding: {
      ...(prepared.instruction_understanding || {}),
      multi_judgment_request: recovery
    },
    analysis_task_packet: {
      ...packet,
      tasks,
      dependencies,
      execution_waves: executionWaves,
      branches,
      branch_groups: branchGroups,
      user_goal: caseGoal,
      observable_material: { ...observable, case_model: packetCaseModel },
      case_model: packetCaseModel,
      constraints: global.constraints,
      prohibitions: global.prohibitions,
      preserve: global.preserve,
      deadlines: global.deadlines,
      conditions: global.conditions,
      exceptions: global.exceptions,
      unresolved: global.unresolved,
      multi_judgment_recovery: recovery,
      source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span })),
      task_graph_validation: {
        ...(packet.task_graph_validation || {}),
        valid: executionWaves.length > 0,
        cycle: executionWaves.length ? [] : tasks.map((task) => task.id),
        dependency_count: dependencies.length,
        wave_count: executionWaves.length,
        branch_count: branches.length,
        multi_judgment_request_count: caseModel.request_count
      }
    }
  };
}

module.exports = {
  buildCaseModel,
  extractJudgmentRequests,
  extractInputObservations,
  requestRelations,
  mergeJudgmentRequests,
  expandMultiJudgmentRequest
};
