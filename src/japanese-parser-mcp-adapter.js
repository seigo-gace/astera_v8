'use strict';

function unique(values = []) {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function spanOf(value, fallbackText = '') {
  const span = value || {};
  const text = String(span.source_text ?? span.text ?? fallbackText ?? '');
  const start = Number.isInteger(span.start) ? span.start : 0;
  const end = Number.isInteger(span.end) ? span.end : start + text.length;
  return { start, end, text };
}

function normalizedAction(intentType) {
  const intent = String(intentType || '').toLowerCase();
  const map = {
    comparison: 'compare',
    decision: 'decide',
    modify: 'improve',
    correction: 'improve',
    remove: 'remove',
    action: 'implement',
    request: 'analyze',
    question: 'verify'
  };
  return map[intent] || 'analyze';
}

function valuesOfType(task, type) {
  return unique((task.structured_constraints || [])
    .filter((item) => String(item.constraint_type || '').toLowerCase() === type)
    .map((item) => item.value));
}

function dependencyIds(task, idMap) {
  return unique((task.dependencies || []).map((id) => idMap.get(String(id)) || '').filter(Boolean));
}

function buildExecutionWaves(tasks, dependencies) {
  const ids = new Set(tasks.map((task) => task.id));
  const incoming = new Map(tasks.map((task) => [task.id, new Set()]));
  for (const edge of dependencies) {
    if (ids.has(edge.from) && ids.has(edge.to) && edge.from !== edge.to) incoming.get(edge.to).add(edge.from);
  }
  const remaining = new Set(ids);
  const waves = [];
  while (remaining.size) {
    const ready = [...remaining]
      .filter((id) => [...incoming.get(id)].every((parent) => !remaining.has(parent)))
      .sort();
    if (!ready.length) {
      waves.push([...remaining].sort());
      break;
    }
    waves.push(ready);
    ready.forEach((id) => remaining.delete(id));
  }
  return waves;
}

function parserIssueLabels(response) {
  const labels = [];
  const collect = (prefix, items) => {
    for (const item of items || []) {
      const code = item?.code || item?.type || item?.status || item?.reason || 'UNRESOLVED';
      labels.push(`${prefix}:${String(code)}`);
    }
  };
  collect('PARSER_UNRESOLVED', response.meaning_graph?.unresolved);
  collect('PARSER_READING_UNRESOLVED', response.meaning_graph?.reading_analysis?.unresolved);
  collect('PARSER_AMBIGUITY', response.ambiguities);
  collect('PARSER_MISSING', response.missing_information);
  collect('PARSER_UNSUPPORTED', response.unsupported_elements);
  collect('PARSER_TIMEOUT', response.timeouts);
  return unique(labels);
}

function conflictRecords(response) {
  return (response.contradictions || []).map((item, index) => ({
    type: String(item?.code || item?.type || item?.status || `PARSER_CONTRADICTION_${index + 1}`),
    note: String(item?.message || item?.reason || item?.detail || JSON.stringify(item))
  }));
}

function propositionFallbackTask(response) {
  const proposition = response.meaning_graph?.propositions?.[0];
  if (!proposition) return null;
  const source = spanOf(proposition.source_span, response.original_text);
  const argumentTarget = (proposition.arguments || []).find((item) => item?.value)?.value;
  const target = String(argumentTarget || proposition.value || source.text || '').trim();
  const intentType = String(proposition.intent_type || 'statement');
  const action = proposition.sentence_mood === 'interrogative' ? 'verify' : normalizedAction(intentType);
  return {
    id: 'T01',
    parser_task_id: null,
    parser_proposition_id: proposition.proposition_id || null,
    source_span: source,
    raw_text: source.text,
    clause_type: intentType,
    actionable: true,
    action,
    target,
    objective: String(proposition.value || source.text || target),
    purpose: String(proposition.value || source.text || target),
    deliverables: [],
    premises: proposition.sentence_mood === 'declarative' ? [source.text] : [],
    constraints: [],
    prohibitions: [],
    preserve: [],
    replace: [],
    conditions: [],
    exceptions: [],
    deadlines: [],
    priority: 'normal',
    order: 1,
    depends_on: [],
    parallelizable: false,
    success_criteria: [],
    verification: [],
    completion_criteria: [],
    unresolved: proposition.status && proposition.status !== 'RESOLVED' ? ['parser_proposition_unresolved'] : [],
    evidence_need: { required: false, reasons: [], queries: [] },
    external_action: false,
    hard_blockers: [],
    parser_authority: 'DETERMINISTIC_JAPANESE_PARSER_MCP'
  };
}

function taskFromParser(task, index, idMap) {
  const id = idMap.get(String(task.task_id));
  const source = spanOf(task.original_span);
  const structuredConstraints = task.structured_constraints || [];
  const genericConstraints = unique([
    ...(task.constraints || []),
    ...structuredConstraints
      .filter((item) => !['prohibition', 'preserve', 'condition', 'exception', 'completion_criteria', 'verification_criteria', 'premise'].includes(String(item.constraint_type || '').toLowerCase()))
      .map((item) => item.value)
  ]);
  const unresolved = [];
  if (task.status && task.status !== 'RESOLVED') unresolved.push(`parser_task_status:${task.status}`);
  const completion = unique([...(task.completion_criteria || []), ...valuesOfType(task, 'completion_criteria')]);
  const verification = unique([...(task.verification_criteria || []), ...valuesOfType(task, 'verification_criteria')]);
  return {
    id,
    parser_task_id: task.task_id,
    parser_proposition_id: task.proposition_id || null,
    source_span: source,
    raw_text: source.text,
    clause_type: String(task.intent_type || 'instruction'),
    actionable: true,
    action: normalizedAction(task.intent_type),
    target: String(task.target || '').trim(),
    objective: String(task.action || source.text || task.target || '').trim(),
    purpose: String(task.action || source.text || task.target || '').trim(),
    deliverables: [],
    premises: valuesOfType(task, 'premise'),
    constraints: genericConstraints,
    prohibitions: valuesOfType(task, 'prohibition'),
    preserve: valuesOfType(task, 'preserve'),
    replace: [],
    conditions: valuesOfType(task, 'condition'),
    exceptions: valuesOfType(task, 'exception'),
    deadlines: [],
    priority: valuesOfType(task, 'priority').length ? 'high' : 'normal',
    order: Number.isInteger(task.execution_order) ? task.execution_order + 1 : index + 1,
    depends_on: dependencyIds(task, idMap),
    parallelizable: true,
    success_criteria: completion,
    verification,
    completion_criteria: completion,
    unresolved,
    evidence_need: { required: false, reasons: [], queries: [] },
    external_action: task.external_action === true,
    hard_blockers: [],
    parser_authority: 'DETERMINISTIC_JAPANESE_PARSER_MCP'
  };
}

function projectJapaneseParserResponse(response, metadata = {}) {
  if (!response || typeof response !== 'object') throw new TypeError('Japanese Parser response is required');
  if (response.overall_status === 'FAILED') {
    return buildJapaneseParserFailureRequest(response.original_text || '', Object.assign(new Error('Japanese Parser returned FAILED'), { code: 'JAPANESE_PARSER_FAILED' }), metadata, response);
  }

  const parserTasks = Array.isArray(response.task_graph?.tasks) ? response.task_graph.tasks : [];
  const idMap = new Map(parserTasks.map((task, index) => [String(task.task_id), `T${String(index + 1).padStart(2, '0')}`]));
  let tasks = parserTasks.map((task, index) => taskFromParser(task, index, idMap));
  if (!tasks.length) {
    const fallback = propositionFallbackTask(response);
    if (fallback) tasks = [fallback];
  }
  if (!tasks.length) {
    return buildJapaneseParserFailureRequest(response.original_text || '', Object.assign(new Error('Japanese Parser produced no TaskGraph or proposition'), { code: 'JAPANESE_PARSER_EMPTY_SEMANTICS' }), metadata, response);
  }

  const dependencies = [];
  for (const task of tasks) {
    for (const parent of task.depends_on || []) dependencies.push({ from: parent, to: task.id, type: 'MCP_TASK_DEPENDENCY', reason: 'parser_task_graph' });
  }
  const waves = buildExecutionWaves(tasks, dependencies);
  for (const task of tasks) {
    const wave = waves.find((item) => item.includes(task.id)) || [];
    task.parallelizable = wave.length > 1;
  }

  const unresolved = unique([
    ...parserIssueLabels(response),
    ...tasks.flatMap((task) => task.unresolved.map((item) => `${task.id}:${item}`))
  ]);
  const conflicts = conflictRecords(response);
  const globalStructured = response.task_graph?.constraints || [];
  const byType = (type) => unique(globalStructured.filter((item) => String(item.constraint_type || '').toLowerCase() === type).map((item) => item.value));
  const constraints = unique([
    ...tasks.flatMap((task) => task.constraints),
    ...globalStructured.filter((item) => !['prohibition', 'preserve', 'condition', 'exception', 'completion_criteria', 'verification_criteria', 'premise'].includes(String(item.constraint_type || '').toLowerCase())).map((item) => item.value)
  ]);
  const prohibitions = unique([...tasks.flatMap((task) => task.prohibitions), ...byType('prohibition')]);
  const preserve = unique([...tasks.flatMap((task) => task.preserve), ...byType('preserve')]);
  const verification = unique([...tasks.flatMap((task) => task.verification), ...byType('verification_criteria')]);
  const completionCriteria = unique([...tasks.flatMap((task) => task.completion_criteria), ...byType('completion_criteria')]);

  const packet = {
    schema_version: 'astera.analysis-task-packet.v2',
    task_decomposition_version: 'djpmcp-task-graph-v2',
    intent: tasks[0]?.action || 'analyze',
    tasks,
    dependencies,
    execution_waves: waves,
    branches: [],
    branch_groups: [],
    supersession_relations: [],
    reference_resolutions: (response.references || []).map((item) => ({
      expression: item.expression,
      candidates: item.candidates || [],
      selected: item.selected || null,
      status: item.status || null,
      source_span: spanOf(item.span)
    })),
    unresolved,
    conflicts,
    hard_blockers: [],
    source_spans: tasks.map((task) => ({ task_id: task.id, ...task.source_span })),
    constraints,
    prohibitions,
    preserve,
    replace: [],
    verification,
    completion_criteria: completionCriteria,
    context_bindings: [],
    task_graph_validation: {
      valid: true,
      source: 'DETERMINISTIC_JAPANESE_PARSER_MCP',
      parser_status: response.task_graph?.status || null,
      dependency_count: dependencies.length,
      wave_count: waves.length,
      unresolved_count: unresolved.length
    },
    parser_task_graph: response.task_graph
  };

  const lexicalTerms = unique([
    ...(response.meaning_graph?.entities || []).map((item) => item.canonical),
    ...(response.meaning_graph?.propositions || []).map((item) => item.predicate)
  ]).slice(0, 64);
  const primary = tasks[0];
  return {
    schema_version: 'astera.request-model.v3',
    language: metadata.language || 'ja',
    locale: metadata.locale || null,
    script: metadata.script || 'Hani',
    scripts: metadata.scripts || [],
    output_language: metadata.requested_output_language || metadata.language || 'ja',
    normalized_question: String(response.normalized_text || response.original_text || '').trim(),
    original_question: String(response.original_text || ''),
    target: primary.target || '',
    target_confidence: primary.target ? 'high' : 'low',
    action: primary.action,
    objective: primary.objective,
    success_criteria: completionCriteria,
    constraints,
    prohibitions,
    preserve,
    replace: [],
    verification,
    query_terms: lexicalTerms,
    context_present: Boolean(metadata.context_present),
    context_length: Number(metadata.context_length || 0),
    instruction_map: {
      clause_count: response.meaning_graph?.clauses?.length || 0,
      task_count: tasks.length,
      correction_count: (response.meaning_graph?.decision_state_changes || []).length,
      prohibition_count: prohibitions.length,
      preserve_count: preserve.length,
      verification_count: verification.length
    },
    instruction_understanding: {
      mode: 'DETERMINISTIC_JAPANESE_PARSER_MCP',
      adapter: 'deterministic-japanese-parser-mcp',
      semantic_resolution: response.overall_status === 'COMPLETE' ? 'meaning-graph-resolved' : 'meaning-graph-partial',
      parser: {
        tool: 'analyze_japanese',
        overall_status: response.overall_status,
        analysis_path: response.analysis_path || null,
        semantic_hash: response.meaning_graph?.semantic_hash || null,
        versions: response.versions || {},
        metrics: response.metrics || {},
        transport: response.astera_mcp_transport || null
      },
      execution_allowed: true,
      parser_external_action_allowed: response.execution_allowed === true,
      blocked_reasons: [],
      warnings: unresolved,
      language: metadata.language || 'ja',
      locale: metadata.locale || null,
      script: metadata.script || 'Hani',
      scripts: metadata.scripts || [],
      detection_basis: metadata.detection_basis || 'SCRIPT_HIRAGANA_KATAKANA'
    },
    parser_meaning_graph: response.meaning_graph,
    analysis_task_packet: packet
  };
}

function buildJapaneseParserFailureRequest(originalText, error, metadata = {}, response = null) {
  const text = String(originalText || '');
  const code = String(error?.code || 'JAPANESE_PARSER_FAILED');
  const blocker = `JAPANESE_PARSER_MCP:${code}`;
  const task = {
    id: 'T01',
    source_span: { start: 0, end: text.length, text },
    raw_text: text,
    clause_type: 'parser_failure_boundary',
    actionable: false,
    action: 'analyze',
    target: '',
    objective: 'Japanese semantic parsing did not complete; do not infer missing semantics.',
    purpose: 'Stop before Task/Claim/Evidence processing when the authoritative Japanese parser fails.',
    deliverables: [], premises: [], constraints: [], prohibitions: [], preserve: [], replace: [], conditions: [], exceptions: [], deadlines: [],
    priority: 'normal', order: 1, depends_on: [], parallelizable: false,
    success_criteria: [], verification: [], completion_criteria: [], unresolved: ['japanese_parser_failed'],
    evidence_need: { required: false, reasons: [], queries: [] }, external_action: false, hard_blockers: [blocker]
  };
  return {
    schema_version: 'astera.request-model.v3',
    language: metadata.language || 'ja', locale: metadata.locale || null, script: metadata.script || 'Hani', scripts: metadata.scripts || [],
    output_language: metadata.requested_output_language || metadata.language || 'ja',
    normalized_question: text.normalize('NFKC').trim(), original_question: text,
    target: '', target_confidence: 'low', action: 'analyze',
    objective: task.objective, success_criteria: [], constraints: [], prohibitions: [], preserve: [], replace: [], verification: [], query_terms: [],
    context_present: Boolean(metadata.context_present), context_length: Number(metadata.context_length || 0),
    instruction_map: { clause_count: 0, task_count: 1, correction_count: 0, prohibition_count: 0, preserve_count: 0, verification_count: 0 },
    instruction_understanding: {
      mode: 'DETERMINISTIC_JAPANESE_PARSER_MCP', adapter: 'deterministic-japanese-parser-mcp', semantic_resolution: 'failed',
      parser: { tool: 'analyze_japanese', overall_status: response?.overall_status || 'FAILED', semantic_hash: response?.meaning_graph?.semantic_hash || null, versions: response?.versions || {}, transport: response?.astera_mcp_transport || null },
      execution_allowed: false, parser_external_action_allowed: false, blocked_reasons: [blocker], warnings: [String(error?.message || code)],
      language: metadata.language || 'ja', locale: metadata.locale || null, script: metadata.script || 'Hani', scripts: metadata.scripts || [], detection_basis: metadata.detection_basis || 'SCRIPT_HIRAGANA_KATAKANA'
    },
    parser_meaning_graph: response?.meaning_graph || null,
    analysis_task_packet: {
      schema_version: 'astera.analysis-task-packet.v2', task_decomposition_version: 'djpmcp-fail-closed-v1', intent: 'analyze', tasks: [task], dependencies: [], execution_waves: [['T01']], branches: [], branch_groups: [], supersession_relations: [], reference_resolutions: [], unresolved: ['T01:japanese_parser_failed'], conflicts: [], hard_blockers: [blocker], source_spans: [{ task_id: 'T01', ...task.source_span }], constraints: [], prohibitions: [], preserve: [], replace: [], verification: [], completion_criteria: [], context_bindings: [], task_graph_validation: { valid: false, source: 'DETERMINISTIC_JAPANESE_PARSER_MCP', parser_status: response?.overall_status || 'FAILED', dependency_count: 0, wave_count: 1, unresolved_count: 1 }
    }
  };
}

module.exports = {
  projectJapaneseParserResponse,
  buildJapaneseParserFailureRequest,
  normalizedAction,
  buildExecutionWaves
};
