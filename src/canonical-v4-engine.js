'use strict';

const WorkerPool = require('./worker-pool');
const Logger = require('./logger');
const { routeDomainTemplates } = require('./domain-template-router');
const { analyzeRequest, normalizeEvidencePacket, deriveEvidenceNeed } = require('./judgment-materials-analyzer');
const { JapaneseParserMCPClient, needsJapaneseParser, isExternalActionHint, isJapaneseParserConfigured } = require('./japanese-parser-mcp-client');
const {
  unique,
  enrichTasks,
  validateTaskGraph,
  extractCanonicalClaims,
  createSearchPlan,
  confirmClaim
} = require('./canonical-v4-core');

const FIVE_LANES = Object.freeze(['fact', 'risk', 'multi', 'inquiry', 'compare']);
const ORDER = Object.freeze(['01_purpose', '02_premise', '03_facts', '04_crisis', '05_opposition', '06_comparison', '07_evidence', '08_reinstruction']);
const LABELS = Object.freeze({
  ja: Object.freeze(['01 本当の目的', '02 前提不足', '03 事実確認', '04 危機察知', '05 反対視点', '06 比較案', '07 Evidence成立状態', '08 主役AIへの再指示']),
  en: Object.freeze(['01 True Objective', '02 Missing Context', '03 Fact Check', '04 Risk Detection', '05 Opposing View', '06 Comparison', '07 Evidence State', '08 Re-instruction to Main AI'])
});

const line = (v) => String(v ?? '-').replace(/\s+/g, ' ').trim() || '-';
const join = (xs, fallback = '-') => (xs || []).map(line).filter((x) => x && x !== '-').join(' / ') || fallback;
const langOf = (input, q) => /^(en|english)$/i.test(String(input.language || input.output_language || '')) ? 'en' : /^(ja|jp|japanese)$/i.test(String(input.language || input.output_language || '')) ? 'ja' : /[ぁ-んァ-ヶ一-龠々]/.test(q) ? 'ja' : 'en';
const objectList = (items) => Array.isArray(items) ? items : [];

function notRequiredEvidence(taskId) {
  return {
    schema_version: 'astera.evidence-search.result.v1', status: 'NOT_REQUIRED', task_id: taskId,
    evidence: [], coverage: { discovery_scope_state: 'NOT_REQUIRED' },
    quality: { final: { status: 'NOT_REQUIRED', score_bp: null } },
    provider_execution: { initial: [], reinforcement: [] }, ai_used: false, payment_executed: false
  };
}

function safeSpan(span, originalText) {
  const start = Number(span?.start);
  const end = Number(span?.end);
  const valid = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && end <= originalText.length;
  if (!valid) return { start: 0, end: originalText.length, text: originalText, valid: false };
  const actual = originalText.slice(start, end);
  const claimed = String(span?.source_text ?? actual);
  return { start, end, text: actual, valid: actual === claimed };
}

function structuredValues(task, type) {
  return objectList(task?.structured_constraints).filter((item) => item?.constraint_type === type).map((item) => String(item.value || '').trim()).filter(Boolean);
}

const DEADLINE_CONSTRAINT_TYPES = new Set(['deadline', 'due', 'time', '納期', '期限', '締切', '締め切']);
const CONSTRAINT_RECORD_TYPE_MAP = Object.freeze({
  prohibition: 'PROHIBITION',
  preserve: 'PRESERVE',
  condition: 'CONDITION',
  exception: 'EXCEPTION',
  priority: 'PRIORITY',
  premise: 'PREMISE',
  deadline: 'DEADLINE',
  due: 'DEADLINE',
  time: 'DEADLINE',
  limit: 'LIMIT',
  dependency: 'DEPENDENCY',
  completion_criteria: 'COMPLETION_CRITERIA',
  verification_criteria: 'VERIFICATION',
  verification: 'VERIFICATION',
  success_criteria: 'SUCCESS_CRITERIA',
  scope: 'SCOPE',
  modify: 'REPLACE',
  remove: 'REPLACE',
  replace: 'REPLACE',
  sequence: 'SEQUENCE',
  completion: 'COMPLETION_CRITERIA',
  success: 'SUCCESS_CRITERIA'
});

function dedupeConstraintRecords(records) {
  const out = [];
  const seen = new Set();
  for (const record of records || []) {
    if (!record?.constraint_id || seen.has(record.constraint_id)) continue;
    seen.add(record.constraint_id);
    out.push(record);
  }
  return out;
}

function normalizeConstraintRecordType(rawType) {
  const key = String(rawType || '').trim().toLowerCase();
  if (CONSTRAINT_RECORD_TYPE_MAP[key]) return CONSTRAINT_RECORD_TYPE_MAP[key];
  if (DEADLINE_CONSTRAINT_TYPES.has(key)) return 'DEADLINE';
  return 'LIMIT';
}

function parserSourceSpan(span, originalText, fallbackText = '') {
  if (span && typeof span === 'object') {
    const safe = safeSpan(span, originalText);
    return { start: safe.start, end: safe.end, text: safe.text || fallbackText, valid: safe.valid };
  }
  return { start: 0, end: originalText.length, text: fallbackText || originalText, valid: true };
}

function buildConstraintRecord({
  type,
  value,
  target = null,
  scope = 'TASK',
  sourceRole = 'parser',
  sourceSpan = null,
  taskIds = [],
  status = 'ACTIVE',
  fieldProvenance = null,
  constraintId = null
}) {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) return null;
  const recordType = typeof type === 'string' && type === type.toUpperCase() ? type : normalizeConstraintRecordType(type);
  return {
    constraint_id: constraintId || `CR-${recordType}-${Buffer.from(`${normalizedValue}:${target || ''}`).toString('base64url').slice(0, 16)}`,
    type: recordType,
    value: normalizedValue,
    target: target || null,
    scope,
    source_role: sourceRole,
    source_span: sourceSpan,
    task_ids: unique(taskIds),
    status,
    field_provenance: fieldProvenance || { source: sourceRole }
  };
}

function structuredConstraintRecords(task, taskId, originalText) {
  const records = [];
  let index = 0;
  for (const item of objectList(task?.structured_constraints)) {
    const span = parserSourceSpan(item.source_span || task.original_span, originalText, String(item.value || ''));
    const record = buildConstraintRecord({
      type: item.constraint_type,
      value: item.value,
      target: item.target || task.target || null,
      scope: 'TASK',
      sourceRole: 'parser_structured_constraint',
      sourceSpan: { start: span.start, end: span.end, text: span.text },
      taskIds: [taskId],
      constraintId: item.constraint_id || `CR-SC-${taskId}-${index += 1}`
    });
    if (record) records.push(record);
  }
  for (const raw of objectList(task?.constraints)) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const split = /^([^:]+):(.+)$/.exec(text);
    const record = buildConstraintRecord({
      type: split ? split[1] : 'LIMIT',
      value: split ? split[2] : text,
      target: task.target || null,
      scope: 'TASK',
      sourceRole: 'parser_task_constraint',
      sourceSpan: parserSourceSpan(task.original_span, originalText, text),
      taskIds: [taskId],
      constraintId: `CR-TC-${taskId}-${index += 1}`
    });
    if (record) records.push(record);
  }
  return records;
}

function graphConstraintRecords(parserResult, taskIds, originalText) {
  const records = [];
  let index = 0;
  for (const item of objectList(parserResult.task_graph?.constraints)) {
    const span = parserSourceSpan(item.source_span, originalText, String(item.value || ''));
    const record = buildConstraintRecord({
      type: item.constraint_type,
      value: item.value,
      target: item.target || null,
      scope: 'GLOBAL',
      sourceRole: 'parser_task_graph_constraint',
      sourceSpan: { start: span.start, end: span.end, text: span.text },
      taskIds,
      constraintId: item.constraint_id || `CR-GC-${index += 1}`
    });
    if (record) records.push(record);
  }
  return records;
}

function propositionConstraintRecords(parserResult, taskIds, originalText) {
  const records = [];
  let index = 0;
  const intentToType = {
    prohibition: 'PROHIBITION',
    preserve: 'PRESERVE',
    condition: 'CONDITION',
    exception: 'EXCEPTION',
    priority: 'PRIORITY',
    premise: 'PREMISE',
    scope: 'SCOPE',
    dependency: 'DEPENDENCY'
  };
  for (const proposition of objectList(parserResult.meaning_graph?.propositions)) {
    const mapped = intentToType[String(proposition.intent_type || '').toLowerCase()];
    if (!mapped) continue;
    const span = parserSourceSpan(proposition.source_span, originalText, String(proposition.value || proposition.surface_predicate || ''));
    const record = buildConstraintRecord({
      type: mapped,
      value: proposition.value || proposition.surface_predicate || proposition.predicate || span.text,
      target: proposition.captures?.target || null,
      scope: 'MEANING_GRAPH',
      sourceRole: 'parser_proposition',
      sourceSpan: { start: span.start, end: span.end, text: span.text },
      taskIds,
      constraintId: proposition.proposition_id ? `CR-P-${proposition.proposition_id}` : `CR-P-${index += 1}`
    });
    if (record) records.push(record);
  }
  return records;
}

function aggregateConstraintViews(records) {
  const pick = (type) => unique(records.filter((record) => record.type === type).map((record) => record.value));
  const deadlines = pick('DEADLINE');
  return {
    constraint_records: records,
    constraints: unique(records.filter((record) => !['DEADLINE', 'PROHIBITION', 'PRESERVE'].includes(record.type)).map((record) => `${record.type}:${record.value}`)),
    prohibitions: pick('PROHIBITION'),
    preserve: pick('PRESERVE'),
    replace: pick('REPLACE'),
    conditions: pick('CONDITION'),
    exceptions: pick('EXCEPTION'),
    deadlines,
    priority_records: records.filter((record) => record.type === 'PRIORITY').map((record) => record.value),
    verification: pick('VERIFICATION'),
    completion_criteria: pick('COMPLETION_CRITERIA'),
    success_criteria: pick('SUCCESS_CRITERIA')
  };
}

function taskDeadlinesFromRecords(task, records) {
  const fromTask = objectList(task.deadlines).map((item) => String(item || '').trim()).filter(Boolean);
  const fromRecords = records.filter((record) => record.type === 'DEADLINE' && (record.task_ids.includes(task.id) || !record.task_ids.length)).map((record) => record.value);
  const fromStructured = objectList(task.structured_constraints)
    .filter((item) => DEADLINE_CONSTRAINT_TYPES.has(String(item.constraint_type || '').toLowerCase()) || normalizeConstraintRecordType(item.constraint_type) === 'DEADLINE')
    .map((item) => String(item.value || '').trim())
    .filter(Boolean);
  return unique([...fromTask, ...fromStructured, ...structuredValues(task, 'deadline'), ...structuredValues(task, 'due'), ...fromRecords]);
}

function taskPriorityFields(task, records) {
  const priorityRecords = unique([
    ...structuredValues(task, 'priority'),
    ...records.filter((record) => record.type === 'PRIORITY' && record.task_ids.includes(task.id)).map((record) => record.value)
  ]);
  return {
    priority_records: priorityRecords,
    priority: priorityRecords[0] || 'normal'
  };
}

function parserResultHardBlockers(parserResult) {
  const blocked = unique([
    ...(parserResult.execution_allowed === false ? ['PARSER_ACTION_GUARD_BLOCKED'] : []),
    ...objectList(parserResult.blocked_reasons).map((item) => String(item))
  ]);
  if (String(parserResult.overall_status || '') !== 'FAILED') {
    return blocked.filter((item) => item !== 'TIMEOUT');
  }
  return blocked;
}

function propositionHasProjectionSignal(proposition) {
  if (!proposition || typeof proposition !== 'object') return false;
  if (proposition.executable_candidate === true) return true;
  if (proposition.intent_type) return true;
  if (proposition.predicate || proposition.surface_predicate) return true;
  if (proposition.value && proposition.value !== proposition.text) return true;
  if (Array.isArray(proposition.structured_constraints) && proposition.structured_constraints.length) return true;
  return false;
}

function hasProjectableMcpMaterial(parserResult) {
  return Boolean(
    objectList(parserResult.task_graph?.constraints).length
    || objectList(parserResult.meaning_graph?.unresolved).length
    || objectList(parserResult.ambiguities).length
    || objectList(parserResult.missing_information).length
    || objectList(parserResult.meaning_graph?.propositions).some(propositionHasProjectionSignal)
  );
}

function buildProjectedParserTask(parserResult, originalText) {
  const propositions = objectList(parserResult.meaning_graph?.propositions);
  const primary = propositions.find((item) => item.executable_candidate === true)
    || propositions.find((item) => /request|action|desire|question|modify|comparison/i.test(String(item.intent_type || '')))
    || propositions[0];
  const span = parserSourceSpan(primary?.source_span, originalText, originalText);
  const intent = String(primary?.intent_type || 'request').toLowerCase() === 'desire' ? 'request' : String(primary?.intent_type || 'request');
  return {
    task_id: 'A-001',
    intent_type: intent,
    action: primary?.predicate || primary?.surface_predicate || primary?.value || null,
    target: primary?.captures?.target || primary?.arguments?.[0]?.value || primary?.arguments?.[0] || '',
    status: primary?.status || 'PARTIAL',
    original_span: { start: span.start, end: span.end, source_text: span.text },
    dependencies: [],
    external_action: parserResult.execution_allowed === false,
    constraints: [],
    structured_constraints: objectList(parserResult.task_graph?.constraints),
    completion_criteria: [],
    verification_criteria: [],
    proposition_id: primary?.proposition_id || null
  };
}

function parserTaskToAstera(task, originalText, parserResult, index, sharedRecords = []) {
  const span = safeSpan(task.original_span, originalText);
  const intent = String(task.intent_type || 'request');
  const taskId = String(task.task_id || `A-${String(index + 1).padStart(3, '0')}`);
  const actionMap = {
    preserve: 'preserve', modify: 'improve', remove: 'remove', comparison: 'compare', decision: 'analyze',
    question: 'analyze', request: 'analyze', action: 'implement', prohibition: 'analyze', condition: 'analyze',
    sequence: 'analyze', exception: 'analyze', priority: 'analyze', correction: 'improve', scope: 'analyze',
    out_of_scope: 'analyze', dependency: 'analyze', completion_criteria: 'analyze', verification_criteria: 'verify',
    premise: 'analyze', reference: 'analyze', desire: 'analyze'
  };
  const action = actionMap[intent] || 'analyze';
  const taskRecords = dedupeConstraintRecords([
    ...structuredConstraintRecords(task, taskId, originalText),
    ...sharedRecords.filter((record) => record.task_ids.includes(taskId))
  ]);
  const aggregated = aggregateConstraintViews(taskRecords);
  const deadlines = taskDeadlinesFromRecords(task, taskRecords);
  const priorityFields = taskPriorityFields(task, taskRecords);
  const constraints = unique([...(task.constraints || []), ...aggregated.constraints]);
  const prohibitions = unique([...aggregated.prohibitions, ...structuredValues(task, 'prohibition'), ...(intent === 'prohibition' && task.target ? [`${task.target}を禁止する`] : [])]);
  const preserve = unique([...aggregated.preserve, ...structuredValues(task, 'preserve'), ...(intent === 'preserve' && task.target ? [`${task.target}を維持する`] : [])]);
  const replace = unique([...aggregated.replace, ...(intent === 'modify' && task.target ? [`${task.target}を変更する`] : []), ...(intent === 'remove' && task.target ? [`${task.target}を除去する`] : [])]);
  const completion = unique([...(task.completion_criteria || []), ...aggregated.completion_criteria, ...structuredValues(task, 'completion_criteria')]);
  const verification = unique([...(task.verification_criteria || []), ...aggregated.verification, ...structuredValues(task, 'verification_criteria')]);
  const unresolved = [];
  if (String(task.status || 'RESOLVED') !== 'RESOLVED') unresolved.push(`parser_task_status:${task.status}`);
  if (!span.valid) unresolved.push('parser_source_span_mismatch');
  if (!task.target && !['question', 'request', 'action', 'desire'].includes(intent)) unresolved.push('target');
  const hardBlockers = parserResult.execution_allowed === false && task.external_action === true
    ? parserResultHardBlockers(parserResult) : [];
  const objective = String(task.action && !/実行Task|生成する/i.test(task.action) ? task.action : (task.target || span.text || '要求を判断材料へ構造化する'));
  const fieldSources = {
    action: [{ source: 'parser', source_span: { start: span.start, end: span.end, text: span.text } }],
    target: [{ source: 'parser', source_span: { start: span.start, end: span.end, text: span.text } }],
    objective: [{ source: 'parser', source_span: { start: span.start, end: span.end, text: span.text } }],
    deadlines: deadlines.length ? [{ source: 'parser', source_span: { start: span.start, end: span.end, text: span.text } }] : [],
    priority: priorityFields.priority_records.length ? [{ source: 'parser', value: priorityFields.priority_records.join(' / ') }] : [{ source: 'parser', value: priorityFields.priority }],
    constraints: constraints.length ? [{ source: 'parser', source_span: { start: span.start, end: span.end, text: span.text } }] : []
  };
  return {
    id: taskId,
    source_span: { start: span.start, end: span.end, text: span.text }, raw_text: span.text,
    clause_type: intent, actionable: true, action, target: task.target || '',
    objective,
    deliverables: [], premises: unique([...structuredValues(task, 'premise'), ...taskRecords.filter((record) => record.type === 'PREMISE').map((record) => record.value)]),
    constraints, prohibitions, preserve, replace,
    conditions: unique([...aggregated.conditions, ...structuredValues(task, 'condition')]),
    exceptions: unique([...aggregated.exceptions, ...structuredValues(task, 'exception')]),
    deadlines,
    ...priorityFields,
    constraint_records: taskRecords,
    order: Number(task.execution_order || index + 1),
    depends_on: unique(task.dependencies || []), parallelizable: !(task.dependencies || []).length,
    success_criteria: unique([...aggregated.success_criteria, ...completion]),
    verification,
    completion_criteria: completion,
    unresolved,
    evidence_need: { required: false, reasons: [], queries: [] }, external_action: task.external_action === true,
    hard_blockers: hardBlockers,
    field_sources: fieldSources,
    parser_metadata: { proposition_id: task.proposition_id || null, status: task.status || null, intent_type: intent, execution_order: Number(task.execution_order || index + 1), original_action: task.action || null }
  };
}

function requestFromParser(fastRequest, parserResult, originalText) {
  let parserTasks = objectList(parserResult.task_graph?.tasks);
  if (!parserTasks.length && hasProjectableMcpMaterial(parserResult)) {
    parserTasks = [buildProjectedParserTask(parserResult, originalText)];
  }
  const preliminaryIds = parserTasks.map((task, index) => String(task.task_id || `A-${String(index + 1).padStart(3, '0')}`));
  const sharedRecords = dedupeConstraintRecords([
    ...graphConstraintRecords(parserResult, preliminaryIds, originalText),
    ...propositionConstraintRecords(parserResult, preliminaryIds, originalText)
  ]);
  const tasks = parserTasks.map((task, index) => parserTaskToAstera(task, originalText, parserResult, index, sharedRecords));
  const dependencies = [];
  for (const task of tasks) for (const dependency of task.depends_on) dependencies.push({ from: dependency, to: task.id, type: 'PARSER_DEPENDENCY', reason: 'parser_task_graph' });
  for (const edge of objectList(parserResult.task_graph?.edges)) {
    const from = String(edge?.source || ''); const to = String(edge?.target || '');
    if (from && to && !dependencies.some((item) => item.from === from && item.to === to)) dependencies.push({ from, to, type: String(edge?.relation || 'PARSER_EDGE'), reason: 'parser_task_graph_edge' });
  }
  const packetRecords = dedupeConstraintRecords([
    ...sharedRecords,
    ...tasks.flatMap((task) => task.constraint_records || [])
  ]);
  const packetViews = aggregateConstraintViews(packetRecords);
  const constraints = unique([...tasks.flatMap((task) => task.constraints), ...packetViews.constraints]);
  const prohibitions = unique([...tasks.flatMap((task) => task.prohibitions), ...packetViews.prohibitions]);
  const preserve = unique([...tasks.flatMap((task) => task.preserve), ...packetViews.preserve]);
  const replace = unique([...tasks.flatMap((task) => task.replace), ...packetViews.replace]);
  const conditions = unique([...tasks.flatMap((task) => task.conditions || []), ...packetViews.conditions]);
  const exceptions = unique([...tasks.flatMap((task) => task.exceptions || []), ...packetViews.exceptions]);
  const deadlines = unique([...tasks.flatMap((task) => task.deadlines || []), ...packetViews.deadlines]);
  const verification = unique([...tasks.flatMap((task) => task.verification), ...packetViews.verification]);
  const completion = unique([...tasks.flatMap((task) => task.completion_criteria), ...packetViews.completion_criteria]);
  const unresolved = unique([
    ...tasks.flatMap((task) => task.unresolved.map((item) => `${task.id}:${item}`)),
    ...objectList(parserResult.meaning_graph?.unresolved).map((item, index) => `meaning_unresolved:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.ambiguities).map((item, index) => `ambiguity:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.missing_information).map((item, index) => `missing_information:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.unsupported_elements).map((item, index) => `unsupported:${index}:${JSON.stringify(item)}`),
    ...objectList(parserResult.timeouts).map((item, index) => `timeout:${index}:${JSON.stringify(item)}`),
    ...(parserResult.overall_status !== 'COMPLETE' ? [`parser_overall_status:${parserResult.overall_status}`] : []),
    ...(!parserTasks.length && !hasProjectableMcpMaterial(parserResult) ? ['parser_task_graph_empty'] : [])
  ]);
  const conflicts = objectList(parserResult.contradictions).map((item, index) => ({ type: String(item?.type || item?.code || 'PARSER_CONTRADICTION'), note: typeof item === 'string' ? item : JSON.stringify(item), parser_index: index }));
  if (parserResult.execution_allowed === false) {
    conflicts.push({ type: 'PARSER_ACTION_GUARD_BLOCKED', note: join(parserResult.blocked_reasons || [], 'execution_allowed=false') });
  }
  for (const timeout of objectList(parserResult.timeouts)) {
    conflicts.push({ type: 'PARSER_TIMEOUT', note: typeof timeout === 'string' ? timeout : JSON.stringify(timeout) });
  }
  const hardBlockers = unique([
    ...parserResultHardBlockers(parserResult),
    ...tasks.flatMap((task) => task.hard_blockers || [])
  ]);
  return {
    ...fastRequest,
    schema_version: 'astera.request-model.v3-canonical-v4',
    target: tasks[0]?.target || fastRequest.target,
    action: tasks[0]?.action || fastRequest.action,
    objective: tasks[0]?.objective || fastRequest.objective,
    success_criteria: completion, constraints, prohibitions, preserve, replace, verification,
    analysis_task_packet: {
      schema_version: 'astera.analysis-task-packet.v2-canonical-v4', intent: tasks[0]?.action || 'analyze', tasks, dependencies,
      execution_waves: [], constraints, prohibitions, preserve, replace, verification, completion_criteria: completion,
      conditions, exceptions, deadlines,
      constraint_records: packetRecords,
      priority_records: packetViews.priority_records,
      unresolved, conflicts, hard_blockers: hardBlockers, source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span }))
    },
    instruction_understanding: {
      mode: 'DEEP_PATH', parser: 'Deterministic-Japanese-Parser-MCP', overall_status: parserResult.overall_status,
      analysis_path: parserResult.analysis_path, execution_allowed: parserResult.execution_allowed,
      blocked_reasons: parserResult.blocked_reasons || [], semantic_hash: parserResult.meaning_graph?.semantic_hash || null,
      meaning_graph_version: parserResult.meaning_graph?.graph_version || null, task_graph_version: parserResult.task_graph?.graph_version || null,
      versions: parserResult.versions || {}, metrics: parserResult.metrics || {}, transport: parserResult.astera_mcp_transport || null,
      meaning_graph: parserResult.meaning_graph || null,
      task_graph: parserResult.task_graph || null,
      propositions: objectList(parserResult.meaning_graph?.propositions),
      parser_projection: {
        propositions: objectList(parserResult.meaning_graph?.propositions),
        unresolved: objectList(parserResult.meaning_graph?.unresolved),
        task_graph: parserResult.task_graph || null,
        structured_constraints: objectList(parserResult.task_graph?.constraints),
        ambiguities: objectList(parserResult.ambiguities),
        missing_information: objectList(parserResult.missing_information),
        timeouts: objectList(parserResult.timeouts)
      }
    }
  };
}

function failClosedRequest(fastRequest, error) {
  const code = String(error?.code || 'PARSER_UNAVAILABLE');
  const message = String(error?.message || code);
  return {
    ...fastRequest,
    analysis_task_packet: {
      schema_version: 'astera.analysis-task-packet.v2-canonical-v4',
      intent: 'analyze',
      tasks: [],
      dependencies: [],
      execution_waves: [],
      constraints: [],
      prohibitions: [],
      preserve: [],
      replace: [],
      verification: [],
      completion_criteria: [],
      unresolved: unique([`JAPANESE_PARSER_FAIL_CLOSED:${code}`]),
      conflicts: [{ type: 'JAPANESE_PARSER_FAIL_CLOSED', note: message }],
      hard_blockers: unique(['JAPANESE_PARSER_FAIL_CLOSED', code]),
      source_spans: []
    },
    instruction_understanding: {
      mode: 'FAIL_CLOSED',
      parser: 'deterministic-japanese-parser',
      execution_allowed: false,
      blocked_reasons: unique(['JAPANESE_PARSER_FAIL_CLOSED', code]),
      error_code: code,
      transport: error?.transport || null
    }
  };
}

function japaneseFastSkeleton(input = {}) {
  const question = String(input.question || '');
  const context = String(input.context || '');
  return {
    schema_version: 'astera.request-model.v3-canonical-v4',
    normalized_question: question,
    original_question: question,
    target: '',
    action: 'analyze',
    objective: '',
    success_criteria: [],
    constraints: [],
    prohibitions: [],
    preserve: [],
    replace: [],
    verification: [],
    query_terms: [],
    context_present: Boolean(context.trim()),
    context_length: context.trim().length,
    analysis_task_packet: {
      schema_version: 'astera.analysis-task-packet.v2-canonical-v4',
      intent: 'analyze',
      tasks: [],
      dependencies: [],
      execution_waves: [],
      constraints: [],
      prohibitions: [],
      preserve: [],
      replace: [],
      verification: [],
      completion_criteria: [],
      unresolved: ['japanese_parser_pending'],
      conflicts: [],
      hard_blockers: [],
      source_spans: []
    },
    instruction_understanding: {
      mode: 'FAST_PATH',
      parser: 'deterministic-japanese-parser',
      execution_allowed: true,
      blocked_reasons: []
    }
  };
}

async function prepareJapaneseRequestViaMcp(input = {}, { client, logger = null } = {}) {
  const question = String(input.question || '');
  const context = String(input.context || '');
  const fast = japaneseFastSkeleton({ question, context });
  if (!needsJapaneseParser(question)) return fast;
  if (!client || typeof client.analyze !== 'function') {
    return failClosedRequest(fast, { code: 'PARSER_CLIENT_NOT_CONFIGURED', message: 'Japanese Parser MCP client is not configured.' });
  }
  try {
    const parserResult = await client.analyze({
      originalText: question,
      conversationContext: context ? [context] : [],
      executionMode: isExternalActionHint(question, fast) ? 'external_action' : 'analysis',
      analysisDepth: 'auto',
      deadlineMs: Number(input.deadline_ms || input.deadlineMs || 5000)
    });
    if (parserResult.overall_status === 'FAILED') {
      return failClosedRequest(fast, {
        code: 'PARSER_OVERALL_FAILED',
        message: 'Japanese Parser MCP returned overall_status FAILED.',
        transport: parserResult.astera_mcp_transport || null
      });
    }
    return requestFromParser(fast, parserResult, question);
  } catch (error) {
    if (logger && typeof logger.write === 'function') {
      logger.write({
        tenantId: 'system',
        type: 'japanese_parser_fail_closed',
        severity: 'warn',
        text: 'Deterministic Japanese Parser MCP unavailable or invalid; Japanese semantic analysis stopped.',
        payload: { error_code: error?.code || 'PARSER_ERROR' }
      });
    }
    return failClosedRequest(fast, error);
  }
}

function taskRouteText(task) {
  return unique([task.target || '', ...(task.premises || []), task.source_span?.text || '']).join('\n');
}

function aggregateTaskResults(taskResults, records) {
  const facts = {
    pillar: 'fact',
    confirmed: taskResults.flatMap((r) => (r.facts.confirmed || []).map((x) => ({ task_id: r.task.id, ...x }))),
    unconfirmed: taskResults.flatMap((r) => (r.facts.undetermined || r.facts.unconfirmed || []).map((x) => ({ task_id: r.task.id, ...x }))),
    undetermined: taskResults.flatMap((r) => (r.facts.undetermined || []).map((x) => ({ task_id: r.task.id, ...x }))),
    opinions: [], per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.facts]))
  };
  const risks = {
    pillar: 'risk', risk_count: taskResults.reduce((sum, r) => sum + Number(r.risks.risk_count || 0), 0),
    risks: taskResults.flatMap((r) => (r.risks.risks || []).map((x) => ({ task_id: r.task.id, ...x }))),
    highest: taskResults.flatMap((r) => (r.risks.risks || []).map((x) => ({ task_id: r.task.id, ...x })))[0] || null,
    level: null, safety_gates: unique(taskResults.flatMap((r) => r.risks.safety_gates || [])),
    domain_checks: taskResults.flatMap((r) => r.risks.domain_checks || []), per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.risks]))
  };
  const inquiry = {
    pillar: 'inquiry',
    problem_health: { healthy: taskResults.every((r) => r.inquiry.problem_health?.healthy), reason: join(taskResults.filter((r) => !r.inquiry.problem_health?.healthy).map((r) => `${r.task.id}:${r.inquiry.problem_health?.reason}`), '全Taskの明示状態を追跡可能') },
    missing_fields: unique(taskResults.flatMap((r) => (r.inquiry.missing_fields || []).map((x) => `${r.task.id}:${x}`))),
    missing_questions: unique(taskResults.flatMap((r) => r.inquiry.missing_questions || [])), per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.inquiry]))
  };
  const multi = { pillar: 'multi', perspectives: taskResults.flatMap((r) => (r.multi.perspectives || []).map((x) => ({ task_id: r.task.id, ...x }))), per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.multi])) };
  const comparison = {
    pillar: 'compare',
    counts: { CONFIRMED: records.filter((r) => r.status === 'CONFIRMED').length, UNDETERMINED: records.filter((r) => r.status === 'UNDETERMINED').length },
    scope_matrix: taskResults.flatMap((r) => r.comparison.scope_matrix || []),
    conflicts: taskResults.flatMap((r) => (r.comparison.conflicts || []).map((x) => ({ task_id: r.task.id, claim_id: x }))),
    evidence_bound_claim_count: taskResults.reduce((sum, r) => sum + Number(r.comparison.evidence_bound_claim_count || 0), 0),
    compare_lens: unique(taskResults.flatMap((r) => r.comparison.compare_lens || [])),
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.comparison])),
    authority: { owns: ['counts', 'scope_matrix', 'conflicts'], does_not_own: ['score', 'candidate_ranking', 'selected_candidate', 'rejected_candidates', 'decision', 'recommendation'] }
  };
  const perspectiveExpansion = {
    engine: 'Astera Deterministic Perspective Expansion',
    per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.perspective_expansion])),
    candidates: taskResults.flatMap((r) => (r.perspective_expansion?.candidates || []).map((x) => ({ task_id: r.task.id, ...x })))
  };
  return { facts, risks, inquiry, multi, comparison, perspectiveExpansion };
}

class CanonicalV4Engine {
  constructor({ poolSize = 4, logger = new Logger(), japaneseParserClient = undefined, japaneseParserOptions = {}, evidenceSearch = null } = {}) {
    this.pool = new WorkerPool(poolSize);
    this.logger = logger;
    if (japaneseParserClient === undefined) {
      this.japaneseParserClient = isJapaneseParserConfigured(japaneseParserOptions)
        ? new JapaneseParserMCPClient(japaneseParserOptions)
        : null;
    } else {
      this.japaneseParserClient = japaneseParserClient;
    }
    this.evidenceSearch = evidenceSearch;
  }

  async prepareRequest(input = {}) {
    const question = String(input.question || '');
    const context = String(input.context || '');
    if (!needsJapaneseParser(question)) {
      const fast = analyzeRequest({ question, context });
      fast.instruction_understanding = { mode: 'FAST_PATH', parser: null, execution_allowed: true, blocked_reasons: [] };
      return fast;
    }
    return prepareJapaneseRequestViaMcp({ question, context }, { client: this.japaneseParserClient, logger: this.logger });
  }

  async process(input = {}, tenant = { id: 'unknown' }) {
    const question = String(input.question || '').trim();
    const context = String(input.context || '').trim();
    const lang = langOf(input, question);
    if (!question) return { result: { type: 'clarification_needed', questions: [lang === 'ja' ? '質問本文を入力してください。' : 'Please provide the request body.'] }, material: this.clarify([], lang), prompt: '', runtime: { ai_used: false, llm_called: false } };

    const baseRequest = input.preparedRequest?.analysis_task_packet ? input.preparedRequest : await this.prepareRequest({ question, context, language: input.language, output_language: input.output_language });
    if (!(baseRequest.analysis_task_packet?.tasks || []).length) {
      const questions = [lang === 'ja' ? '確認が必要です。対象・目的・完了条件を具体化してください。' : 'Clarification is required. Specify the target, objective, and completion condition.'];
      return { result: { type: 'clarification_needed', request_model: baseRequest, questions }, material: this.clarify(questions, lang), prompt: '', runtime: { ai_used: false, llm_called: false, engine: 'v8_canonical_v4_rules', instruction_mode: baseRequest.instruction_understanding?.mode || 'UNKNOWN' } };
    }
    if (baseRequest.instruction_understanding?.mode === 'FAIL_CLOSED' && Array.from(question).length <= 4) {
      const questions = [lang === 'ja' ? '確認が必要です。判断対象・目的・完了条件を具体化してください。' : 'Clarification is required. Specify the target, objective, and completion condition.'];
      return { result: { type: 'clarification_needed', request_model: baseRequest, questions }, material: this.clarify(questions, lang), prompt: '', runtime: { ai_used: false, llm_called: false, engine: 'v8_canonical_v4_rules', instruction_mode: 'FAIL_CLOSED' } };
    }

    const enrichedTasks = enrichTasks(baseRequest.analysis_task_packet?.tasks || [], { question, context });
    const dependencies = baseRequest.analysis_task_packet?.dependencies || [];
    const graph = validateTaskGraph(enrichedTasks, dependencies);
    const nonActionable = enrichedTasks.filter((task) => task.actionable === false);
    if (!graph.valid) {
      const reasons = graph.errors.map((error) => error.code + (error.task_ids ? `:${error.task_ids.join(',')}` : ''));
      const request = { ...baseRequest, analysis_task_packet: { ...baseRequest.analysis_task_packet, tasks: enrichedTasks, execution_waves: graph.execution_waves, graph_validation: graph, hard_blockers: unique([...(baseRequest.analysis_task_packet?.hard_blockers || []), ...reasons]) } };
      return { result: { type: 'task_graph_blocked', request_model: request, analysis_task_packet: request.analysis_task_packet, non_ai: true }, material: this.blocked(reasons, lang), prompt: '', runtime: { ai_used: false, llm_called: false, engine: 'v8_canonical_v4_rules', instruction_mode: request.instruction_understanding?.mode || 'UNKNOWN', task_count: enrichedTasks.length, wave_count: graph.execution_waves.length } };
    }

    // v4 responsibility order: Task -> Claim/Policy/Search Plan -> Domain strengthening.
    const rawClaimsByTask = Object.fromEntries(enrichedTasks.map((task) => [task.id, extractCanonicalClaims(task)]));
    const tasks = enrichedTasks.map((baseTask) => {
      const domain = routeDomainTemplates({ question: taskRouteText(baseTask), context });
      const claimSearchRequired = (rawClaimsByTask[baseTask.id] || []).some((claim) => claim.policy.external_search_required);
      const evidenceNeed = deriveEvidenceNeed(baseTask, domain);
      return { ...baseTask, evidence_need: { ...evidenceNeed, required: evidenceNeed.required || claimSearchRequired }, domain };
    });
    const activeTaskIds = new Set(tasks.filter((task) => task.actionable !== false).map((task) => task.id));
    const executionWaves = graph.execution_waves.map((wave) => wave.filter((id) => activeTaskIds.has(id))).filter((wave) => wave.length);
    const request = { ...baseRequest, analysis_task_packet: { ...baseRequest.analysis_task_packet, tasks, dependencies, execution_waves: executionWaves, graph_validation: graph, non_actionable_tasks: nonActionable.map((task) => task.id), source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span })) } };

    const taskEvidence = input.taskEvidencePackets || input.task_evidence_packets || {};
    const globalEvidence = input.evidencePacket || input.evidence_packet || null;
    const normalizedEvidenceByTask = {};
    const rawEvidenceByTask = {};
    const searchPlansByTask = {};
    for (const task of tasks) {
      const claims = rawClaimsByTask[task.id] || [];
      const searchPlans = claims.map(createSearchPlan);
      searchPlansByTask[task.id] = searchPlans;
      let raw = task.evidence_need.required ? (taskEvidence[task.id] || (tasks.length === 1 ? globalEvidence : null)) : notRequiredEvidence(task.id);
      if (!raw && globalEvidence && tasks.length > 1 && input.allow_shared_legacy_evidence === true) raw = globalEvidence;
      if (!raw && task.evidence_need.required && this.evidenceSearch && typeof this.evidenceSearch.execute === 'function') {
        raw = await this.evidenceSearch.execute({ task, claims, search_plans: searchPlans, domain: task.domain });
      }
      rawEvidenceByTask[task.id] = raw;
      normalizedEvidenceByTask[task.id] = normalizeEvidencePacket(raw);
    }
    const canonicalClaimRecords = Object.freeze(tasks.flatMap((task) => (rawClaimsByTask[task.id] || []).map((claim) => confirmClaim(claim, normalizedEvidenceByTask[task.id] || {}))));

    const completed = new Map();
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    for (const wave of executionWaves) {
      const runnable = wave.map((id) => taskById.get(id)).filter(Boolean);
      const waveResults = await Promise.all(runnable.map(async (task) => {
        const records = canonicalClaimRecords.filter((record) => record.task_id === task.id);
        const evidenceRaw = rawEvidenceByTask[task.id];
        const preflight = await this.pool.exec('inquiry', { mode: 'preflight', question: task.source_span?.text || '', human_text: question, moodAnswers: input.moodAnswers || {}, domain: task.domain, task, canonical_claim_records: records, evidence_packet: evidenceRaw });
        const [facts, risks, multi, inquiry, comparison] = await Promise.all([
          this.pool.exec('fact', { question: task.source_span?.text || '', domain: task.domain, task, canonical_claim_records: records, evidence_packet: evidenceRaw }),
          this.pool.exec('risk', { question: task.source_span?.text || '', domain: task.domain, task, canonical_claim_records: records, evidence_packet: evidenceRaw }),
          this.pool.exec('multi', { question: task.source_span?.text || '', domain: task.domain, task, canonical_claim_records: records, evidence_packet: evidenceRaw }),
          this.pool.exec('inquiry', { mode: 'analysis', question: task.source_span?.text || '', human_text: question, moodAnswers: input.moodAnswers || {}, domain: task.domain, task, canonical_claim_records: records, evidence_packet: evidenceRaw }),
          this.pool.exec('compare', { question: task.source_span?.text || '', domain: task.domain, task, canonical_claim_records: records, evidence_packet: evidenceRaw })
        ]);
        const perspectiveExpansion = await this.pool.exec('dialectic', { question: task.source_span?.text || '', facts, risks, inquiry, multi, domain: task.domain, task, evidence_packet: evidenceRaw, mood: preflight.mood, human: inquiry.human_reading || preflight.human_reading || {} });
        return { task, evidence: normalizedEvidenceByTask[task.id], canonical_claim_records: records, preflight, facts, risks, multi, inquiry, comparison, perspective_expansion: perspectiveExpansion };
      }));
      for (const result of waveResults) completed.set(result.task.id, result);
    }

    const taskResults = tasks.filter((task) => task.actionable !== false).map((task) => completed.get(task.id)).filter(Boolean);
    const aggregate = aggregateTaskResults(taskResults, canonicalClaimRecords);
    const judgment = this.frame({ request, context, taskResults, canonicalClaimRecords, aggregate, lang });
    const material = this.material(judgment);
    const fiveStage = {
      schema_version: 'astera.five-lane.v4', order: [...FIVE_LANES], execution_mode: 'INDEPENDENT_PARALLEL_FROM_CANONICAL_CLAIM_RECORDS', execution_waves: executionWaves,
      tasks: taskResults.map((r) => ({ task_id: r.task.id, lens_id: r.task.domain.primary?.id || null, claim_records: r.canonical_claim_records, fact: r.facts, risk: r.risks, multi: r.multi, inquiry: r.inquiry, compare: r.comparison, perspective_expansion: r.perspective_expansion }))
    };
    const result = {
      type: 'cognitive_map', mode: 'deterministic_canonical_v4_decision_materials', non_ai: true,
      request_model: request, analysis_task_packet: request.analysis_task_packet,
      canonical_claim_records: canonicalClaimRecords, search_plans: searchPlansByTask, evidence_search: { executor_attached: Boolean(this.evidenceSearch && typeof this.evidenceSearch.execute === 'function'), input_packet_supported: true }, five_stage: fiveStage,
      task_results: taskResults, non_actionable_tasks: nonActionable,
      domain: taskResults.length === 1 ? taskResults[0].task.domain : { taxonomy_version: taskResults[0]?.task.domain?.taxonomy_version || null, per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, r.task.domain])) },
      facts: aggregate.facts, risks: aggregate.risks, multi: aggregate.multi, inquiry: aggregate.inquiry,
      comparison: aggregate.comparison,
      hyperion: { engine: 'Astera Deterministic Perspective Expansion', mode: 'post_lane_expansion', dialectic: aggregate.perspectiveExpansion },
      judgment
    };
    this.logger.write({ tenantId: tenant.id, type: 'process_completed', text: 'Canonical v4 claim graph completed', payload: { task_count: tasks.length, active_task_count: taskResults.length, claim_count: canonicalClaimRecords.length, confirmed_count: aggregate.comparison.counts.CONFIRMED, undetermined_count: aggregate.comparison.counts.UNDETERMINED, instruction_mode: request.instruction_understanding?.mode || 'UNKNOWN', non_ai: true } });
    return { result, material, prompt: this.externalBrief(judgment), runtime: { ai_used: false, llm_called: false, engine: 'v8_canonical_v4_rules', instruction_mode: request.instruction_understanding?.mode || 'UNKNOWN', task_count: tasks.length, active_task_count: taskResults.length, wave_count: executionWaves.length } };
  }

  frame({ request, context, taskResults, canonicalClaimRecords, aggregate, lang }) {
    const labels = LABELS[lang];
    const packet = request.analysis_task_packet;
    const taskIds = taskResults.map((r) => r.task.id);
    const lensIds = unique(taskResults.map((r) => r.task.domain.primary?.id).filter(Boolean));
    const evidenceRefs = canonicalClaimRecords.flatMap((record) => record.evidence_bindings || []);
    const evidenceToCollect = unique(taskResults.flatMap((r) => r.task.domain.primary?.evidence_to_collect || []));
    const domainPerspectives = unique(taskResults.flatMap((r) => r.task.domain.primary?.multi_lens || []));
    const blockers = unique([...(packet.hard_blockers || []), ...(packet.unresolved || []), ...(packet.conflicts || []).map((x) => x.type), ...taskResults.flatMap((r) => r.task.hard_blockers || []), ...canonicalClaimRecords.filter((record) => record.status === 'UNDETERMINED').flatMap((record) => record.undetermined_reasons || [])]);
    const trace = (ruleIds, extra = {}) => ({ trace_schema: 'astera.canonical-v4-trace.v1', rule_ids: ruleIds, task_ids: taskIds, lens_ids: lensIds, evidence_refs: evidenceRefs, source_spans: packet.source_spans || [], instruction_understanding: request.instruction_understanding || null, ...extra });
    const contextPremises = unique([
      ...(packet.context_bindings || []).filter((item) => item.kind === 'premise').map((item) => item.value),
      ...taskResults.flatMap((r) => (r.task.premises || []))
    ]);
    const contextProhibitions = unique([
      ...(packet.prohibitions || []),
      ...(packet.context_bindings || []).filter((item) => item.kind === 'prohibition').map((item) => item.value)
    ]);
    const purposeItems = taskResults.map((r) => `${r.task.id}[${r.task.action}] ${r.task.objective}`);
    const premiseItems = unique([...(packet.unresolved || []).map((x) => `unresolved=${x}`), ...(packet.conflicts || []).map((x) => `conflict=${x.type}:${x.note}`), ...taskResults.flatMap((r) => (r.task.constraints || []).map((x) => `${r.task.id}:constraint=${x}`)), ...contextPremises.map((x) => `premise=${x}`), ...contextProhibitions.map((x) => `prohibition=${x}`)]);
    const factItems = canonicalClaimRecords.map((record) => `${record.task_id}:${record.status}:${record.statement}`);
    const riskItems = aggregate.risks.risks.map((risk) => `${risk.task_id}:${risk.key}:${risk.observation || risk.impact || '-'}`);
    const oppositionItems = taskResults.map((r) => {
      const op = (r.perspective_expansion?.candidates || []).find((candidate) => candidate.id === 'opposition');
      return op ? `${r.task.id}:${op.thesis}` : `${r.task.id}:${lang === 'ja' ? '反対視点なし' : 'No opposing view generated'}`;
    });
    const comparisonItems = taskResults.map((r) => `${r.task.id}: CONFIRMED=${r.comparison.counts?.CONFIRMED || 0}, UNDETERMINED=${r.comparison.counts?.UNDETERMINED || 0}, conflicts=${(r.comparison.conflicts || []).length}, evidence_bound=${r.comparison.evidence_bound_claim_count || 0}`);
    const evidenceItems = canonicalClaimRecords.map((record) => `${record.task_id}:${record.claim_id}:${record.status}: G1=${record.confirmation_gates.G1} G2=${record.confirmation_gates.G2} G3=${record.confirmation_gates.G3} G4=${record.confirmation_gates.G4} G5=${record.confirmation_gates.G5} G6=${record.confirmation_gates.G6} G7=${record.confirmation_gates.G7}${record.undetermined_reasons.length ? ` reasons=${record.undetermined_reasons.join(',')}` : ''}`);
    const reinstructionItems = unique([`Task Wave順を保持: ${(packet.execution_waves || []).map((wave, i) => `W${i + 1}[${wave.join(',')}]`).join(' -> ') || '-'}`, ...(packet.prohibitions || []).map((x) => `禁止条件を保持: ${x}`), ...(packet.preserve || []).map((x) => `維持条件を保持: ${x}`), ...(aggregate.comparison.counts.UNDETERMINED ? ['UNDETERMINED ClaimをCONFIRMEDへ推測昇格しない。'] : []), ...(blockers.length ? [`未解決境界を保持: ${blockers.join(' / ')}`] : [])]);
    const sections = {
      '01_purpose': { summary: join(purposeItems), items: purposeItems, decision_basis: trace(['V4-MAIN8-01-TASK-OBJECTIVE']) },
      '02_premise': { summary: premiseItems.length ? join(premiseItems) : (lang === 'ja' ? '明示された未解決前提なし。' : 'No explicit unresolved premise.'), items: premiseItems, decision_basis: trace(['V4-MAIN8-02-NO-GUESS-FILL']) },
      '03_facts': { summary: `CONFIRMED=${aggregate.facts.confirmed.length} / UNDETERMINED=${aggregate.facts.undetermined.length}`, items: factItems, confirmed: aggregate.facts.confirmed, undetermined: aggregate.facts.undetermined, evidence_to_collect: evidenceToCollect, decision_basis: trace(['V4-MAIN8-03-CANONICAL-CLAIM-STATE']) },
      '04_crisis': { summary: `risk_observations=${aggregate.risks.risk_count}`, items: riskItems, risks: aggregate.risks.risks, decision_basis: trace(['V4-MAIN8-04-RISK-OBSERVATION-ONLY']) },
      '05_opposition': { summary: join(oppositionItems), items: oppositionItems, domain_perspectives: domainPerspectives, decision_basis: trace(['V4-MAIN8-05-POST-LANE-PERSPECTIVE']) },
      '06_comparison': { summary: `CONFIRMED=${aggregate.comparison.counts.CONFIRMED} / UNDETERMINED=${aggregate.comparison.counts.UNDETERMINED} / conflicts=${aggregate.comparison.conflicts.length}`, items: comparisonItems, counts: aggregate.comparison.counts, scope_matrix: aggregate.comparison.scope_matrix, conflicts: aggregate.comparison.conflicts, domain_compare_lens: aggregate.comparison.compare_lens, decision_basis: trace(['V4-MAIN8-06-NON-NORMATIVE-COMPARE']) },
      '07_evidence': { summary: `CONFIRMED=${aggregate.comparison.counts.CONFIRMED} / UNDETERMINED=${aggregate.comparison.counts.UNDETERMINED}`, items: evidenceItems, claim_records: canonicalClaimRecords, decision_basis: trace(['V4-MAIN8-07-G1-G7-EVIDENCE-STATE']) },
      '08_reinstruction': { summary: join(reinstructionItems), items: reinstructionItems, decision_basis: trace(['V4-MAIN8-08-LOSSLESS-REINSTRUCTION']) }
    };
    ORDER.forEach((key, index) => { sections[key] = { label: labels[index], ...sections[key] }; });
    return {
      format: 'astera_judgment_canonical_v4', canonical_language: 'en', output_language: lang, order: [...ORDER], non_ai: true,
      authority_boundary: { astera_decides_user_action: false, final_claim_states: ['CONFIRMED', 'UNDETERMINED'], compare_normative_scoring: false, compare_auto_ranking: false, compare_selection: false },
      instruction_understanding: request.instruction_understanding || null,
      domain_template: taskResults.length === 1 ? { primary: taskResults[0].task.domain.primary || null, secondary: taskResults[0].task.domain.secondary || [], overlays: taskResults[0].task.domain.overlays || [], taxonomy_version: taskResults[0].task.domain.taxonomy_version || taskResults[0].task.domain.primary?.taxonomy_version || null } : { primary: null, secondary: [], overlays: [], taxonomy_version: taskResults[0]?.task.domain?.taxonomy_version || null },
      task_graph: { task_count: packet.tasks.length, active_task_count: taskResults.length, dependencies: packet.dependencies, execution_waves: packet.execution_waves, graph_validation: packet.graph_validation, non_actionable_tasks: packet.non_actionable_tasks || [] },
      lens_routing: { per_task: Object.fromEntries(taskResults.map((r) => [r.task.id, { primary: r.task.domain.primary || null, secondary: r.task.domain.secondary || [], overlays: r.task.domain.overlays || [] }])) },
      ...sections
    };
  }

  material(judgment) {
    const ja = judgment.output_language === 'ja';
    const blocks = judgment.order.map((key) => {
      const section = judgment[key];
      const items = (section.items || []).length ? section.items.map((item) => `- ${line(item)}`).join('\n') : '-';
      if (ja) return `## ${section.label}\n一言説明: ${section.summary}\n主役AIへ渡す内容:\n${items}\n判断基準: ${section.decision_basis.rule_ids.join(', ')}`;
      return `## ${section.label}\nOne-line summary: ${section.summary}\nContent for Main AI:\n${items}\nDecision Basis: ${section.decision_basis.rule_ids.join(', ')}`;
    });
    return { format: judgment.format, text: blocks.join('\n\n---\n\n'), compact_text: judgment.order.map((key) => `${judgment[key].label}: ${judgment[key].summary}`).join('\n'), sections: judgment.order.map((key) => judgment[key]) };
  }

  externalBrief(judgment) {
    return judgment.order.map((key) => `${judgment[key].label}: ${judgment[key].summary}`).join('\n');
  }

  clarify(questions, lang) {
    const qs = questions?.length ? questions : [lang === 'ja' ? '対象・目的・完了条件を具体化してください。' : 'Specify the target, objective, and completion condition.'];
    const title = lang === 'ja' ? '確認が必要です' : 'Clarification required';
    const prompt = lang === 'ja' ? '確認したいこと' : 'Questions to clarify';
    return { format: 'clarification', text: `${title}\n${prompt}:\n${qs.map((x) => `- ${line(x)}`).join('\n')}`, compact_text: `${title}: ${join(qs)}`, sections: [] };
  }

  blocked(reasons, lang) {
    const title = lang === 'ja' ? 'Task Graphが実行不能です。' : 'Task graph is not executable.';
    return { format: 'task_graph_blocked', text: `${title}\n${reasons.map((x) => `- ${line(x)}`).join('\n')}`, compact_text: `${title} ${join(reasons)}`, sections: [] };
  }

  async destroy() {
    await this.pool.destroy();
    if (this.japaneseParserClient && typeof this.japaneseParserClient.destroy === 'function') await this.japaneseParserClient.destroy();
  }
}

module.exports = CanonicalV4Engine;
module.exports.requestFromParser = requestFromParser;
module.exports.failClosedRequest = failClosedRequest;
module.exports.japaneseFastSkeleton = japaneseFastSkeleton;
module.exports.prepareJapaneseRequestViaMcp = prepareJapaneseRequestViaMcp;
