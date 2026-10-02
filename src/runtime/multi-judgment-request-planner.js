'use strict';

const EXTERNAL_EVIDENCE_CUE = /(?:検証|事実確認|ファクトチェック|裏取り|調査|リサーチ|根拠|出典|公式(?:根拠|情報|Source)?|verify|validate|fact\s*check|research|investigate|evidence|source)/iu;
const PURE_PROHIBITION = /(?:最終判断|最終結論|推奨|採用|選定)[^。！？!?]{0,80}(?:しない|しないで|禁止|せず|出さない)|(?:must\s+not|do\s+not|never)\b/iu;
const UMBRELLA_MATERIAL = /(?:判断材料|decision\s+material)[^。！？!?]{0,100}(?:整理|まとめ|構造化|organize|structure)/iu;
const REQUEST_CUE = /(?:して(?:ください|くれ|ほしい)?|しろ|せよ|するように|ようにしろ|なくせ|なくして|消して|削除して|除去して|外して|直して|見直して|改善して|修正して|調整して|検討して|確認して|調査して|比較して|整理して|表示して|入れて|付けて|追加して|実装して|対応して|してください|please\b|should\b|need\s+to|must\b)/iu;
const ISSUE_CUE = /(?:エラー|失敗|できない|表示されない|表示される|出る|でる|入る|はいる|崩れる|消える|残る|線|不具合|問題|error|fail|broken|unexpected|line\b|artifact)/iu;
const PREVIOUS_REQUEST_SEQUENCE = /^(?:その後|次に|続いて|最後に)|(?:前(?:の|述)|直前|上記|それ|これ)[^。！？!?]{0,60}(?:完了|終了|確認|成功|失敗)[^。！？!?]{0,30}(?:後|たら|れば)|(?:前(?:の|述)|直前|上記|それ|これ)[^。！？!?]{0,60}(?:してから|終わったら)/iu;

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
  if (/(?:削除|除去|なく(?:す|せ)|消(?:す|して|せ)|外(?:す|して|せ)|remove|delete|eliminate)/iu.test(value)) return 'remove';
  if (/(?:検証|事実確認|ファクトチェック|裏取り|監査|確認|調査|リサーチ|verify|validate|audit|research|investigate|check)/iu.test(value)) return 'verify';
  if (/(?:追加|実装|作成|構築|入れ(?:る|て|ろ)|付け(?:る|て|ろ)|設け(?:る|て|ろ)|表示(?:する|して|しろ)|implement|build|create|add|display|show)/iu.test(value)) return 'implement';
  if (/(?:改善|改良|修正|見直|直(?:す|して|せ)|調整|整理|improve|fix|refactor|adjust|organize)/iu.test(value)) return 'improve';
  if (/(?:検討|考慮|吟味|consider|review)/iu.test(value)) return 'analyze';
  return 'analyze';
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
  return REQUEST_CUE.test(value);
}
function extractJudgmentRequests(text) {
  const spans = sentenceSpans(text);
  const candidates = spans
    .filter((span) => isRequestSpan(span.text))
    .map((span) => ({
      source_span: span,
      request_text: requestText(span.text),
      action: requestAction(span.text),
      umbrella: UMBRELLA_MATERIAL.test(span.text)
    }));
  const substantive = candidates.filter((item) => !item.umbrella);
  const selected = substantive.length ? substantive : candidates;
  return selected.map((item, index) => ({
    id: `R${String(index + 1).padStart(2, '0')}`,
    order: index + 1,
    action: item.action,
    request_text: item.request_text,
    source_span: item.source_span,
    external_evidence_requested: EXTERNAL_EVIDENCE_CUE.test(item.request_text)
  }));
}
function extractInputObservations(text, requests = []) {
  const requestSpans = requests.map((item) => item.source_span);
  const out = [];
  for (const span of sentenceSpans(text)) {
    const value = requestText(span.text);
    if (!ISSUE_CUE.test(value)) continue;
    const isRequest = requestSpans.some((item) => item.start === span.start && item.end === span.end);
    out.push({
      id: `O${String(out.length + 1).padStart(2, '0')}`,
      text: value,
      source_span: span,
      source_type: isRequest ? 'USER_REPORTED_STATE_WITH_REQUEST' : 'USER_REPORTED_STATE'
    });
  }
  return out;
}
function extractGlobalContext(text) {
  const context = { deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [] };
  for (const span of sentenceSpans(text)) {
    const value = requestText(span.text);
    if (!value) continue;
    if (/(?:期限|締切|納期|までに|今日中|明日まで|今週中|来週|来月|deadline|due\s+date|\bby\s+\w+)/iu.test(value)) context.deadlines.push(value);
    if (/(?:変えない|変えず|変更しない|変更せず|維持|保持|残す|keep|preserve|retain|without\s+changing)/iu.test(value)) context.preserve.push(value);
    if (PURE_PROHIBITION.test(value)) context.prohibitions.push(value);
    if (/(?:未確認|未完了|未成立|終わっていない|完了していない|確認していない|not\s+yet|pending|incomplete)/iu.test(value)) context.unresolved.push(value);
    if (/(?:場合|なら|ならば|とき|たら|れば|if\b|when\b|provided\s+that)/iu.test(value)) context.conditions.push(value);
    if (/(?:ただし|例外|except\b|however\b)/iu.test(value)) context.exceptions.push(value);
  }
  for (const key of Object.keys(context)) context[key] = unique(context[key]);
  return context;
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
function buildCaseModel(text) {
  const question = String(text || '');
  const judgmentRequests = extractJudgmentRequests(question);
  const observations = extractInputObservations(question, judgmentRequests);
  const globalContext = extractGlobalContext(question);
  return {
    schema_version: 'astera.case-model.v1',
    source: 'ORIGINAL_QUESTION',
    request_count: judgmentRequests.length,
    judgment_requests: judgmentRequests,
    observations,
    global_context: globalContext,
    request_relations: requestRelations(judgmentRequests),
    multi_judgment: judgmentRequests.length > 1
  };
}
function spanOverlapRatio(left = {}, right = {}) {
  const start = Math.max(Number(left.start || 0), Number(right.start || 0));
  const end = Math.min(Number(left.end || 0), Number(right.end || 0));
  if (end <= start) return 0;
  const length = Math.max(1, Number(right.end || 0) - Number(right.start || 0));
  return (end - start) / length;
}
function representedTaskIndex(tasks, request) {
  return tasks.findIndex((task) => {
    if (spanOverlapRatio(task?.source_span, request.source_span) >= 0.5) return true;
    const raw = norm(task?.raw_text || task?.source_span?.text);
    return raw && request.request_text && (raw.includes(request.request_text) || request.request_text.includes(raw));
  });
}
function globalFields(packet, caseModel) {
  const context = caseModel.global_context || {};
  return {
    constraints: unique([...(packet.constraints || []), ...(context.deadlines || [])]),
    prohibitions: unique([...(packet.prohibitions || []), ...(context.prohibitions || [])]),
    preserve: unique([...(packet.preserve || []), ...(context.preserve || [])]),
    deadlines: unique([...(packet.deadlines || []), ...(context.deadlines || [])]),
    conditions: unique([...(packet.conditions || []), ...(context.conditions || [])]),
    exceptions: unique([...(packet.exceptions || []), ...(context.exceptions || [])]),
    unresolved: unique([...(packet.unresolved || []), ...(context.unresolved || [])])
  };
}
function recoveredTask(request, index, fields, caseModel) {
  const id = `T${String(index + 1).padStart(2, '0')}`;
  const localObservations = (caseModel.observations || []).filter((item) => spanOverlapRatio(item.source_span, request.source_span) > 0);
  const evidenceRequired = request.external_evidence_requested === true;
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
    replace: [],
    verification: [],
    completion_criteria: [],
    success_criteria: [],
    conditions: fields.conditions,
    exceptions: fields.exceptions,
    deadlines: fields.deadlines,
    priority_records: [],
    deliverables: [],
    unresolved: fields.unresolved,
    hard_blockers: [],
    depends_on: [],
    branches: [],
    conditional_branch: null,
    execution_gate: 'ALWAYS',
    parallel_group: 'MULTI_JUDGMENT_REQUESTS',
    supersedes: [],
    superseded_by: [],
    evidence_need: {
      required: evidenceRequired,
      queries: evidenceRequired ? [request.request_text] : [],
      reasons: evidenceRequired ? ['EXPLICIT_EXTERNAL_EVIDENCE_REQUEST'] : []
    },
    field_provenance: {
      purpose: [{ source: 'ORIGINAL_QUESTION_REQUEST_SPAN', request_id: request.id }],
      target: [{ source: 'ORIGINAL_QUESTION_REQUEST_SPAN', request_id: request.id }],
      case_model: [{ source: 'ASTERA_MULTI_JUDGMENT_REQUEST_PLANNER', request_id: request.id }]
    }
  };
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
function expandMultiJudgmentRequest(prepared, input = {}) {
  if (!prepared?.analysis_task_packet) return prepared;
  const question = String(input.question ?? prepared.original_question ?? prepared.normalized_question ?? '');
  if (!question.trim()) return prepared;
  const caseModel = buildCaseModel(question);
  const packet = prepared.analysis_task_packet || {};
  const existingTasks = Array.isArray(packet.tasks) ? packet.tasks : [];
  const observable = {
    ...(packet.observable_material || prepared.observable_material || {}),
    case_model: caseModel,
    input_observations: (caseModel.observations || []).map((item) => item.text)
  };
  if (caseModel.request_count < 2) {
    return {
      ...prepared,
      observable_material: observable,
      analysis_task_packet: { ...packet, observable_material: observable, case_model: caseModel }
    };
  }

  const representation = caseModel.judgment_requests.map((request) => representedTaskIndex(existingTasks, request));
  const allRepresented = representation.every((index) => index >= 0) && new Set(representation).size === caseModel.request_count;
  const fields = globalFields(packet, caseModel);
  let tasks;
  let dependencies;
  let executionWaves;
  let branches;
  let branchGroups;
  if (allRepresented) {
    tasks = existingTasks.map((task, index) => {
      const requestIndex = representation.indexOf(index);
      if (requestIndex < 0) return task;
      const request = caseModel.judgment_requests[requestIndex];
      return { ...task, request_id: request.id, purpose: request.request_text, user_goal: request.request_text };
    });
    dependencies = packet.dependencies || [];
    executionWaves = Array.isArray(packet.execution_waves) && packet.execution_waves.length ? packet.execution_waves.map((wave) => [...wave]) : [tasks.map((task) => task.id)];
    branches = packet.branches || [];
    branchGroups = packet.branch_groups || [];
  } else {
    const graph = recoveredGraph(caseModel.judgment_requests.map((request, index) => recoveredTask(request, index, fields, caseModel)), caseModel);
    tasks = graph.tasks;
    dependencies = graph.dependencies;
    executionWaves = graph.execution_waves;
    branches = [];
    branchGroups = [];
  }
  const caseGoal = `入力内の${caseModel.request_count}件の要求を一つに潰さず、個別の判断材料として整理する`;
  const packetCaseModel = {
    ...caseModel,
    task_mapping: Object.fromEntries(tasks.filter((task) => task.request_id).map((task) => [task.request_id, task.id])),
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
    observable_material: observable,
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
      observable_material: observable,
      case_model: packetCaseModel,
      constraints: fields.constraints,
      prohibitions: fields.prohibitions,
      preserve: fields.preserve,
      deadlines: fields.deadlines,
      conditions: fields.conditions,
      exceptions: fields.exceptions,
      unresolved: fields.unresolved,
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
  expandMultiJudgmentRequest
};