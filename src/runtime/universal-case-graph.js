'use strict';

const { buildUniversalSourceUnderstanding } = require('./universal-source-graph');

const EXTERNAL_EVIDENCE_CUE = /(?:検証|事実確認|ファクトチェック|裏取り|調査|リサーチ|根拠|出典|公式(?:根拠|情報|Source)?|\bverify\b|\bvalidate\b|fact\s*check|\bresearch\b|\binvestigate\b|\bevidence\b|\bsource\b)/iu;
const GLOBAL_SCOPE_CUE = /(?:全体|すべて|全て|全部|共通|各要求|全要求|各Task|各タスク|globally|across\s+all|all\s+requests|every\s+request)/iu;
const SEQUENCE_CUE = /^(?:その後|次に|続いて|最後に)|\b(?:after|then|next|finally|subsequently)\b/iu;
const USER_OBSERVATION_CUE = /(?:(?:した|している|すると|したら|したところ|した際|した時)[^。！？!?]{0,120}(?:が|は)[^。！？!?]{0,80}(?:はいる|入る|入った|出る|出た|表示される|表示された|残る|残った|消える|消えた|起きる|起きた|なる|なった|動かない|反応しない)|(?:when|after)\b[^.!?]{0,120}\b(?:appears?|shows?|remains?|disappears?|fails?|breaks?|does\s+not|doesn't)\b)/iu;
const CONTEXT_ATOM_TYPES = new Set([
  'PROHIBITION', 'PRESERVE', 'CONDITION', 'EXCEPTION', 'OBLIGATION', 'PERMISSION',
  'UNRESOLVED', 'DEADLINE', 'ACCEPTANCE_CRITERION', 'RISK_SIGNAL', 'EVIDENCE_REQUIREMENT',
  'OBSERVATION', 'ASSUMPTION', 'QUESTION', 'SCOPE', 'STAKEHOLDER'
]);

function norm(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}
function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}
function spanLength(span = {}) {
  const start = Number(span.start);
  const end = Number(span.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0;
}
function intersection(left = {}, right = {}) {
  const start = Math.max(Number(left.start || 0), Number(right.start || 0));
  const end = Math.min(Number(left.end || 0), Number(right.end || 0));
  return Math.max(0, end - start);
}
function sourceSpanForTask(task = {}, source = '') {
  const direct = task.source_span || task.original_span || {};
  const start = Number(direct.start);
  const end = Number(direct.end);
  if (Number.isFinite(start) && Number.isFinite(end) && end > start && start >= 0 && end <= source.length) {
    return { start, end, text: source.slice(start, end) };
  }
  const raw = String(task.raw_text || task.source_text || task.purpose || task.objective || task.target || '').trim();
  if (!raw) return null;
  const exact = source.indexOf(raw);
  if (exact >= 0) return { start: exact, end: exact + raw.length, text: source.slice(exact, exact + raw.length) };
  const normalizedSource = source.normalize('NFKC');
  const normalizedRaw = raw.normalize('NFKC');
  const normalizedIndex = normalizedSource.indexOf(normalizedRaw);
  if (normalizedIndex >= 0 && normalizedSource.length === source.length && normalizedRaw.length === raw.length) {
    return { start: normalizedIndex, end: normalizedIndex + raw.length, text: source.slice(normalizedIndex, normalizedIndex + raw.length) };
  }
  return null;
}
function nextTaskNumber(tasks = []) {
  let max = 0;
  for (const task of tasks) {
    const match = /^T(\d+)$/iu.exec(String(task?.id || ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}
function taskId(number) {
  return `T${String(number).padStart(2, '0')}`;
}
function requestRecords(understanding) {
  return (understanding?.semantic_atoms?.request_atoms || []).map((atom, index) => ({
    id: `R${String(index + 1).padStart(2, '0')}`,
    order: index + 1,
    action: atom.operation || 'analyze',
    request_text: String(atom.text || '').trim(),
    source_span: { ...atom.source_span, text: atom.text },
    source_origin: 'UNIVERSAL_SOURCE_GRAPH',
    source_atom_id: atom.id,
    parser_task_ids: [],
    external_evidence_requested: EXTERNAL_EVIDENCE_CUE.test(norm(atom.text)),
    objectives: [],
    local_context: {
      deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [],
      obligations: [], permissions: [], acceptance_criteria: [], assumptions: [], questions: [], risk_signals: []
    }
  }));
}
function nearestRequest(atom, requests) {
  if (!requests.length) return null;
  let best = null;
  let bestScore = -1;
  for (const request of requests) {
    const overlap = intersection(atom.source_span, request.source_span);
    const atomLen = Math.max(1, spanLength(atom.source_span));
    const requestLen = Math.max(1, spanLength(request.source_span));
    if (overlap > 0) {
      const score = 10 + overlap / atomLen + overlap / requestLen;
      if (score > bestScore) { best = request; bestScore = score; }
      continue;
    }
    const distance = atom.source_span.end <= request.source_span.start
      ? request.source_span.start - atom.source_span.end
      : atom.source_span.start >= request.source_span.end
        ? atom.source_span.start - request.source_span.end
        : 0;
    if (distance <= 240) {
      const score = 1 - distance / 241;
      if (score > bestScore) { best = request; bestScore = score; }
    }
  }
  return best;
}
function pushContext(target, key, text) {
  if (!target[key]) target[key] = [];
  target[key] = unique([...target[key], text]);
}
function contextKey(type) {
  return ({
    DEADLINE: 'deadlines', PRESERVE: 'preserve', PROHIBITION: 'prohibitions', UNRESOLVED: 'unresolved',
    CONDITION: 'conditions', EXCEPTION: 'exceptions', OBLIGATION: 'obligations', PERMISSION: 'permissions',
    ACCEPTANCE_CRITERION: 'acceptance_criteria', ASSUMPTION: 'assumptions', QUESTION: 'questions', RISK_SIGNAL: 'risk_signals'
  })[type] || null;
}
function attachSemanticOwnership(understanding, requests) {
  const atoms = understanding?.semantic_atoms?.atoms || [];
  const globalContext = {
    deadlines: [], preserve: [], prohibitions: [], unresolved: [], conditions: [], exceptions: [],
    obligations: [], permissions: [], acceptance_criteria: [], assumptions: [], questions: [], risk_signals: []
  };
  const observations = [];
  let observationIndex = 0;

  for (const atom of atoms) {
    if (atom.type === 'REQUEST') continue;
    const text = String(atom.text || '').trim();
    if (!text) continue;
    const owner = nearestRequest(atom, requests);
    const global = GLOBAL_SCOPE_CUE.test(norm(text));
    if (atom.type === 'OBJECTIVE') {
      if (owner && !global) owner.objectives = unique([...owner.objectives, text]);
      continue;
    }
    if (atom.type === 'EVIDENCE_REQUIREMENT') {
      if (owner && !global) owner.external_evidence_requested = true;
      continue;
    }
    if (atom.type === 'OBSERVATION') {
      observations.push({
        id: `O${String(++observationIndex).padStart(2, '0')}`,
        text,
        source_span: { ...atom.source_span, text: atom.text },
        source_atom_id: atom.id,
        truth_state: 'USER_REPORTED_UNVERIFIED',
        request_ids: owner && !global ? [owner.id] : []
      });
      continue;
    }
    const key = contextKey(atom.type);
    if (!key) continue;
    if (owner && !global) pushContext(owner.local_context, key, text);
    else pushContext(globalContext, key, text);
  }

  for (const request of requests) {
    request.objectives = request.objectives.length ? request.objectives : [request.request_text];
    for (const key of Object.keys(request.local_context)) request.local_context[key] = unique(request.local_context[key]);
    const alreadyObserved = observations.some((item) => intersection(item.source_span, request.source_span) > 0);
    if (!alreadyObserved && USER_OBSERVATION_CUE.test(norm(request.request_text))) {
      observations.push({
        id: `O${String(++observationIndex).padStart(2, '0')}`,
        text: request.request_text,
        source_span: { ...request.source_span },
        source_atom_id: request.source_atom_id,
        truth_state: 'USER_REPORTED_UNVERIFIED',
        request_ids: [request.id],
        inference: 'SOURCE_REPORTED_EVENT_WITH_REQUEST'
      });
    }
  }
  for (const key of Object.keys(globalContext)) globalContext[key] = unique(globalContext[key]);
  return { globalContext, observations };
}
function taskRequestScore(taskSpan, requestSpan) {
  const overlap = intersection(taskSpan, requestSpan);
  if (!overlap) return 0;
  const requestCoverage = overlap / Math.max(1, spanLength(requestSpan));
  const taskCoverage = overlap / Math.max(1, spanLength(taskSpan));
  if (requestCoverage < 0.45) return 0;
  if (taskCoverage < 0.15 && spanLength(taskSpan) > spanLength(requestSpan) * 3) return 0;
  return requestCoverage * 0.65 + taskCoverage * 0.35;
}
function semanticContextForSpan(understanding, span) {
  return (understanding?.semantic_atoms?.atoms || [])
    .filter((atom) => CONTEXT_ATOM_TYPES.has(atom.type) && intersection(atom.source_span, span) > 0)
    .map((atom) => ({ id: atom.id, type: atom.type, text: atom.text, source_span: atom.source_span }));
}
function syntheticDocumentTask(task, span, source) {
  const observableSource = String(task?.observable_material?.source || '');
  const provenance = Object.values(task?.field_provenance || {}).flat().map((item) => String(item?.source || ''));
  const wholeDocument = source.length > 0 && span.start === 0 && span.end === source.length;
  return wholeDocument && (observableSource === 'ORIGINAL_QUESTION' || provenance.includes('STANDALONE_API_AUTO_MATERIAL'));
}
function mapParserTasks(tasks, requests, source, understanding = null) {
  const mapped = [];
  const dropped = [];
  const absorbed = [];
  for (const task of tasks || []) {
    const span = sourceSpanForTask(task, source);
    if (!span) { dropped.push({ task_id: task.id, reason: 'NO_SOURCE_SPAN' }); continue; }
    if (requests.length > 1 && syntheticDocumentTask(task, span, source)) {
      absorbed.push({ task_id: task.id, reason: 'SYNTHETIC_DOCUMENT_SCOPE_REPLACED_BY_CASE_GRAPH', source_span: span });
      continue;
    }
    let owner = null;
    let score = 0;
    for (const request of requests) {
      const next = taskRequestScore(span, request.source_span);
      if (next > score) { score = next; owner = request; }
    }
    if (!owner) {
      const contextAtoms = semanticContextForSpan(understanding, span);
      if (contextAtoms.length) {
        absorbed.push({
          task_id: task.id,
          reason: 'SEMANTIC_CONTEXT_NOT_INDEPENDENT_REQUEST',
          source_span: span,
          semantic_atom_ids: contextAtoms.map((atom) => atom.id),
          semantic_atom_types: unique(contextAtoms.map((atom) => atom.type))
        });
      } else {
        dropped.push({ task_id: task.id, reason: 'BROAD_OR_UNMAPPED_SOURCE_SPAN', source_span: span });
      }
      continue;
    }
    owner.parser_task_ids = unique([...owner.parser_task_ids, task.id]);
    const sourceSemantic = owner.objectives?.[0] || owner.request_text;
    const previousProvenance = task.field_provenance || {};
    mapped.push({
      task: {
        ...task,
        request_id: owner.id,
        source_span: span,
        purpose: sourceSemantic,
        objective: sourceSemantic,
        field_provenance: {
          ...previousProvenance,
          purpose: [
            ...(previousProvenance.purpose || []),
            { source: 'UNIVERSAL_SOURCE_GRAPH', source_atom_id: owner.source_atom_id }
          ],
          objective: [
            ...(previousProvenance.objective || []),
            { source: 'UNIVERSAL_SOURCE_GRAPH', source_atom_id: owner.source_atom_id }
          ]
        }
      },
      owner,
      score
    });
  }
  return { mapped, dropped, absorbed };
}
function recoveredTask(request, id) {
  const ctx = request.local_context || {};
  const evidenceRequired = request.external_evidence_requested === true;
  return {
    id,
    order: request.order,
    request_id: request.id,
    action: request.action || 'analyze',
    target: request.request_text,
    objective: request.objectives?.[0] || request.request_text,
    purpose: request.objectives?.[0] || request.request_text,
    user_goal: request.objectives?.[0] || request.request_text,
    material_only: true,
    source_span: { ...request.source_span },
    raw_text: request.request_text,
    source_role: 'DIRECT_INPUT',
    source_axes: { container_role: ['PLAIN_CONTAINER'], content_role: ['JUDGMENT_REQUEST'], quotation_role: ['DIRECT'] },
    actionable: true,
    premises: [],
    constraints: unique([...(ctx.deadlines || []), ...(ctx.conditions || []), ...(ctx.obligations || [])]),
    prohibitions: unique(ctx.prohibitions || []),
    preserve: unique(ctx.preserve || []),
    replace: [], verification: [],
    completion_criteria: unique(ctx.acceptance_criteria || []),
    success_criteria: unique(ctx.acceptance_criteria || []),
    conditions: unique(ctx.conditions || []),
    exceptions: unique(ctx.exceptions || []),
    deadlines: unique(ctx.deadlines || []),
    priority_records: [], deliverables: [],
    unresolved: unique(ctx.unresolved || []),
    hard_blockers: [], depends_on: [], branches: [], conditional_branch: null,
    execution_gate: 'ALWAYS', parallel_group: null, supersedes: [], superseded_by: [],
    evidence_need: {
      required: evidenceRequired,
      queries: evidenceRequired ? [request.request_text] : [],
      reasons: evidenceRequired ? ['EXPLICIT_EXTERNAL_EVIDENCE_REQUEST'] : []
    },
    field_provenance: {
      purpose: [{ source: 'UNIVERSAL_SOURCE_GRAPH', source_atom_id: request.source_atom_id }],
      target: [{ source: 'UNIVERSAL_SOURCE_GRAPH', source_atom_id: request.source_atom_id }],
      universal_recovery: [{ source: 'UNIVERSAL_CASE_GRAPH_V2' }]
    }
  };
}
function sequenceRelations(requests, understanding) {
  const sequenceOwners = new Set(
    (understanding?.semantic_atoms?.atoms || [])
      .filter((atom) => atom.type === 'SEQUENCE')
      .map((atom) => nearestRequest(atom, requests)?.id)
      .filter(Boolean)
  );
  const relations = [];
  for (let i = 1; i < requests.length; i += 1) {
    const current = requests[i];
    if (SEQUENCE_CUE.test(norm(current.request_text)) || sequenceOwners.has(current.id)) {
      relations.push({
        type: 'depends_on',
        from_request_id: requests[i - 1].id,
        to_request_id: current.id,
        reason: 'EXPLICIT_SOURCE_SEQUENCE'
      });
    }
  }
  return relations;
}
function buildWaves(tasks) {
  const ids = new Set(tasks.map((task) => String(task.id)));
  const remaining = new Map(tasks.map((task) => [String(task.id), { ...task, depends_on: unique((task.depends_on || []).filter((id) => ids.has(String(id)))) }]));
  const done = new Set();
  const waves = [];
  while (remaining.size) {
    const ready = [...remaining.values()].filter((task) => (task.depends_on || []).every((dep) => done.has(String(dep))));
    if (!ready.length) return { valid: false, waves: [], cycle: [...remaining.keys()] };
    const wave = ready.map((task) => String(task.id));
    waves.push(wave);
    for (const id of wave) { remaining.delete(id); done.add(id); }
  }
  return { valid: true, waves, cycle: [] };
}
function shouldApplyUniversalCaseGraph(prepared, understanding, input = {}) {
  const requests = understanding?.semantic_atoms?.request_atoms || [];
  const sourceLength = String(input.question ?? prepared?.original_question ?? '').length;
  const overall = String(prepared?.instruction_understanding?.overall_status || '').toUpperCase();
  const markers = [
    ...(prepared?.analysis_task_packet?.hard_blockers || []),
    ...(prepared?.analysis_task_packet?.unresolved || [])
  ].map(String).join(' ');
  return requests.length >= 2 || sourceLength >= 1200 || overall === 'PARTIAL' || /TIMEOUT|PARSER_ACTION_GUARD_BLOCKED|NO_EXECUTABLE_ACTION/iu.test(markers);
}
function recoveredCaseHardBlockers(values = []) {
  return unique(values).filter((value) => !/NO_EXECUTABLE_ACTION|PARSER_ACTION_GUARD_BLOCKED/iu.test(String(value)));
}
function applyUniversalCaseGraph(prepared, input = {}) {
  if (!prepared?.analysis_task_packet) return prepared;
  const source = String(input.question ?? prepared.original_question ?? prepared.normalized_question ?? '');
  if (!source) return prepared;
  const understanding = buildUniversalSourceUnderstanding(source, input.language || prepared.language || '');
  const requests = requestRecords(understanding);
  if (!requests.length || !shouldApplyUniversalCaseGraph(prepared, understanding, input)) {
    return {
      ...prepared,
      universal_source_graph: understanding.source_graph,
      universal_semantic_atoms: understanding.semantic_atoms
    };
  }

  const { globalContext, observations } = attachSemanticOwnership(understanding, requests);
  const packet = prepared.analysis_task_packet;
  const originalTasks = Array.isArray(packet.tasks) ? packet.tasks : [];
  const { mapped, dropped, absorbed } = mapParserTasks(originalTasks, requests, source, understanding);
  let nextNumber = nextTaskNumber(originalTasks);
  const tasks = mapped.map((row) => ({ ...row.task }));
  for (const request of requests) {
    if (request.parser_task_ids.length) continue;
    const id = taskId(nextNumber++);
    const task = recoveredTask(request, id);
    request.parser_task_ids = [id];
    tasks.push(task);
  }

  const firstTaskByRequest = new Map();
  for (const request of requests) {
    const ids = unique(tasks.filter((task) => String(task.request_id) === request.id).map((task) => task.id));
    request.parser_task_ids = unique([...request.parser_task_ids, ...ids]);
    if (ids[0]) firstTaskByRequest.set(request.id, ids[0]);
  }
  const relations = sequenceRelations(requests, understanding);
  for (const relation of relations) {
    const fromTask = firstTaskByRequest.get(relation.from_request_id);
    const toTask = firstTaskByRequest.get(relation.to_request_id);
    if (!fromTask || !toTask) continue;
    const task = tasks.find((item) => String(item.id) === String(toTask));
    if (task) task.depends_on = unique([...(task.depends_on || []), fromTask]);
  }

  const taskIds = new Set(tasks.map((task) => String(task.id)));
  for (const task of tasks) task.depends_on = unique((task.depends_on || []).filter((dep) => taskIds.has(String(dep))));
  const wavePlan = buildWaves(tasks);
  if (!wavePlan.valid) return prepared;

  const requestTaskIds = {};
  const taskMapping = {};
  for (const request of requests) {
    const ids = unique(tasks.filter((task) => String(task.request_id) === request.id).map((task) => task.id));
    requestTaskIds[request.id] = ids;
    if (ids[0]) taskMapping[request.id] = ids[0];
  }
  const model = {
    schema: 'astera.case-graph.v2',
    compatibility_schema: 'astera.case-model.v1',
    source_graph_schema: understanding.source_graph.schema,
    semantic_atom_schema: understanding.semantic_atoms.schema,
    request_count: requests.length,
    judgment_requests: requests,
    observations,
    global_context: globalContext,
    request_relations: relations,
    multi_judgment: requests.length > 1,
    request_task_ids: requestTaskIds,
    task_mapping: taskMapping,
    representation_mode: 'UNIVERSAL_CASE_GRAPH_V2',
    parser_task_mapping: {
      original_task_ids: originalTasks.map((task) => task.id),
      retained_task_ids: mapped.map((row) => row.task.id),
      absorbed_tasks: absorbed,
      dropped_tasks: dropped,
      recovered_request_ids: requests.filter((request) => !mapped.some((row) => row.owner.id === request.id)).map((request) => request.id)
    }
  };
  const caseGoal = requests.map((request) => request.request_text).join(' / ');
  const observableMaterial = {
    ...(packet.observable_material || prepared.observable_material || {}),
    source: 'UNIVERSAL_SOURCE_GRAPH',
    case_model: model,
    input_observations: observations.map((item) => item.text)
  };
  const dependencies = tasks.flatMap((task) => (task.depends_on || []).map((dep) => ({ from: dep, to: task.id })));
  const contextUnion = (key) => unique([
    ...(packet[key] || []),
    ...(globalContext[key] || []),
    ...requests.flatMap((request) => request.local_context?.[key] || [])
  ]);

  return {
    ...prepared,
    target: caseGoal,
    objective: caseGoal,
    user_goal: caseGoal,
    universal_source_graph: understanding.source_graph,
    universal_semantic_atoms: understanding.semantic_atoms,
    observable_material: observableMaterial,
    analysis_task_packet: {
      ...packet,
      tasks,
      dependencies,
      execution_waves: wavePlan.waves,
      user_goal: caseGoal,
      observable_material: observableMaterial,
      case_model: model,
      constraints: unique([...(packet.constraints || []), ...contextUnion('deadlines'), ...contextUnion('conditions'), ...contextUnion('obligations')]),
      prohibitions: contextUnion('prohibitions'),
      preserve: contextUnion('preserve'),
      deadlines: contextUnion('deadlines'),
      conditions: contextUnion('conditions'),
      exceptions: contextUnion('exceptions'),
      unresolved: contextUnion('unresolved'),
      hard_blockers: recoveredCaseHardBlockers(packet.hard_blockers || []),
      universal_case_graph: {
        applied: true,
        schema: model.schema,
        request_count: requests.length,
        retained_parser_tasks: mapped.length,
        absorbed_parser_tasks: absorbed.length,
        dropped_parser_tasks: dropped.length,
        recovered_requests: model.parser_task_mapping.recovered_request_ids,
        source_length: source.length
      },
      task_graph_validation: {
        ...(packet.task_graph_validation || {}),
        valid: true,
        cycle: [],
        dependency_count: dependencies.length,
        wave_count: wavePlan.waves.length
      }
    }
  };
}

module.exports = {
  applyUniversalCaseGraph,
  buildWaves,
  mapParserTasks,
  taskRequestScore,
  shouldApplyUniversalCaseGraph
};