'use strict';

const crypto = require('node:crypto');

const GRAPH_SCHEMA = 'astera.material-requirement-graph.v1';
const DERIVATION_AUTHORITY = 'DECISION_BACKWARD_REQUIREMENT_DERIVATION';
const TERMINAL_STATES = new Set(['SATISFIED', 'NOT_APPLICABLE']);
const GAP_STATES = new Set(['MISSING', 'UNRESOLVED', 'CONFLICTING']);

function text(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(text).filter(Boolean))];
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function requestId(request = {}, index = 0) {
  return text(request.id) || `R${String(index + 1).padStart(2, '0')}`;
}

function localContext(request = {}) {
  return request.local_context && typeof request.local_context === 'object'
    ? request.local_context
    : {};
}

function objectiveFor(request = {}) {
  return unique([
    ...array(request.objectives),
    request.objective,
    request.purpose,
    request.user_goal,
    request.request_text,
    request.target
  ])[0] || '';
}

function requestTextFor(request = {}) {
  return unique([
    request.request_text,
    request.raw_text,
    request.target,
    request.objective,
    request.purpose
  ])[0] || '';
}

function sourceRef(value, source = 'REQUEST_SOURCE') {
  return value ? [{ source, text: value }] : [];
}

function nodeFactory(ownerRequestId) {
  let sequence = 0;
  return function node({
    material_kind,
    question,
    status,
    required = true,
    source_refs = [],
    evidence_refs = [],
    value_refs = [],
    missing_reason = null,
    acquisition_hint = null,
    truth_state = null,
    tags = []
  }) {
    sequence += 1;
    return {
      slot_id: `${ownerRequestId}:MR${String(sequence).padStart(2, '0')}`,
      owner_request_id: ownerRequestId,
      material_kind,
      question: text(question),
      required: Boolean(required),
      status,
      source_refs: array(source_refs),
      evidence_refs: unique(evidence_refs),
      value_refs: unique(value_refs),
      missing_reason: missing_reason ? text(missing_reason) : null,
      acquisition_hint: acquisition_hint ? text(acquisition_hint) : null,
      truth_state: truth_state ? text(truth_state) : null,
      tags: unique(tags)
    };
  };
}

function addSourceBacked(nodes, makeNode, kind, values, questionPrefix, tags = []) {
  for (const value of unique(values)) {
    nodes.push(makeNode({
      material_kind: kind,
      question: `${questionPrefix}: ${value}`,
      status: 'SATISFIED',
      source_refs: sourceRef(value),
      value_refs: [value],
      truth_state: 'SOURCE_BACKED_RULE_OR_CONTEXT',
      tags
    }));
  }
}

function addNeedsValidation(nodes, makeNode, kind, values, questionPrefix, tags = []) {
  for (const value of unique(values)) {
    nodes.push(makeNode({
      material_kind: kind,
      question: `${questionPrefix}: ${value}`,
      status: 'UNRESOLVED',
      source_refs: sourceRef(value),
      value_refs: [value],
      missing_reason: 'The source supplies the item, but does not establish that it is true or resolved.',
      acquisition_hint: 'Resolve this item with applicable source-backed material or evidence without promoting the input statement to verified fact.',
      truth_state: 'SOURCE_BACKED_UNVERIFIED',
      tags
    }));
  }
}

function observationsForRequest(observations = [], ownerRequestId) {
  return array(observations).filter((item) => {
    const ids = array(item?.request_ids).map(String);
    return ids.length === 0 || ids.includes(ownerRequestId);
  });
}

function buildRequestGraph(request = {}, index = 0, options = {}) {
  const ownerRequestId = requestId(request, index);
  const makeNode = nodeFactory(ownerRequestId);
  const nodes = [];
  const edges = [];
  const ctx = localContext(request);
  const global = options.global_context || {};
  const objective = objectiveFor(request);
  const requestText = requestTextFor(request);

  const root = makeNode({
    material_kind: 'DECISION_QUESTION',
    question: objective || requestText || 'What exactly must be judged for this request?',
    status: objective || requestText ? 'SATISFIED' : 'MISSING',
    source_refs: sourceRef(objective || requestText),
    value_refs: objective || requestText ? [objective || requestText] : [],
    missing_reason: objective || requestText ? null : 'No source-backed decision question or objective is available.',
    acquisition_hint: objective || requestText ? null : 'Recover the request objective from the source without inventing one.',
    tags: ['ROOT_DECISION']
  });
  nodes.push(root);

  const operation = text(request.action || request.operation);
  nodes.push(makeNode({
    material_kind: 'JUDGMENT_OPERATION',
    question: operation ? `What judgment operation is required: ${operation}` : 'What judgment operation is required?',
    status: operation ? 'SATISFIED' : 'MISSING',
    source_refs: sourceRef(operation, 'REQUEST_OPERATION'),
    value_refs: operation ? [operation] : [],
    missing_reason: operation ? null : 'The requested judgment operation is not resolved.',
    acquisition_hint: operation ? null : 'Resolve whether the request is asking to verify, compare, plan, inspect, explain, decide, or another source-backed operation.'
  }));

  const criteria = unique([...(ctx.acceptance_criteria || []), ...(global.acceptance_criteria || [])]);
  if (criteria.length) {
    addSourceBacked(nodes, makeNode, 'DECISION_CRITERION', criteria, 'Criterion that distinguishes an acceptable result');
  } else {
    nodes.push(makeNode({
      material_kind: 'DECISION_CRITERION',
      question: 'What conditions distinguish an acceptable/valid result from an unacceptable/invalid result for this request?',
      status: 'MISSING',
      missing_reason: 'No source-backed decision or acceptance criterion is available.',
      acquisition_hint: 'Derive or obtain the applicable decision criteria from authoritative domain rules, explicit user criteria, or verified case context. Do not invent a document-type template.'
    }));
  }

  const disqualifiers = unique([
    ...(ctx.prohibitions || []), ...(global.prohibitions || []),
    ...(ctx.exceptions || []), ...(global.exceptions || []),
    ...(ctx.risk_signals || []), ...(global.risk_signals || [])
  ]);
  if (disqualifiers.length) {
    addSourceBacked(nodes, makeNode, 'FALSIFICATION_OR_DISQUALIFIER', disqualifiers, 'Known condition that can invalidate or disqualify the judgment');
  } else {
    nodes.push(makeNode({
      material_kind: 'FALSIFICATION_OR_DISQUALIFIER',
      question: 'What condition, counterexample, failure mode, or exception would make the intended judgment invalid?',
      status: 'MISSING',
      missing_reason: 'No source-backed falsification/disqualifying condition is available.',
      acquisition_hint: 'Identify applicable failure, exception, counterexample, or disqualifying rules before treating the material as decision-ready.'
    }));
  }

  addSourceBacked(
    nodes,
    makeNode,
    'BOUNDARY_OR_PRECONDITION',
    unique([
      ...(ctx.conditions || []), ...(global.conditions || []),
      ...(ctx.obligations || []), ...(global.obligations || []),
      ...(ctx.deadlines || []), ...(global.deadlines || []),
      ...(ctx.preserve || []), ...(global.preserve || [])
    ]),
    'Source-backed boundary or prerequisite to preserve'
  );

  addNeedsValidation(
    nodes,
    makeNode,
    'ASSUMPTION_VALIDATION',
    unique([...(ctx.assumptions || []), ...(global.assumptions || [])]),
    'Assumption whose validity must be resolved'
  );

  addNeedsValidation(
    nodes,
    makeNode,
    'UNRESOLVED_ITEM',
    unique([...(ctx.unresolved || []), ...(global.unresolved || [])]),
    'Unresolved item that can affect the judgment'
  );

  addNeedsValidation(
    nodes,
    makeNode,
    'SUBQUESTION_ANSWER',
    unique([...(ctx.questions || []), ...(global.questions || [])]),
    'Question that must be answered to complete the judgment material'
  );

  for (const observation of observationsForRequest(options.observations, ownerRequestId)) {
    const value = text(observation?.text || observation);
    if (!value) continue;
    nodes.push(makeNode({
      material_kind: 'OBSERVATION_VALIDATION',
      question: `Is this input observation/statement established for the scope of this judgment: ${value}`,
      status: 'UNRESOLVED',
      source_refs: sourceRef(value, 'INPUT_OBSERVATION'),
      value_refs: [value],
      missing_reason: 'Input observation exists, but Observation is not verified Fact.',
      acquisition_hint: 'Bind applicable evidence or retain the statement as unverified.',
      truth_state: text(observation?.truth_state) || 'USER_REPORTED_UNVERIFIED'
    }));
  }

  if (request.external_evidence_requested === true || request.evidence_need?.required === true) {
    nodes.push(makeNode({
      material_kind: 'EVIDENCE_SUPPORT',
      question: `What attributable evidence is required to support the claims used for ${objective || requestText || ownerRequestId}?`,
      status: 'MISSING',
      missing_reason: 'External evidence is required but no claim-bound evidence has been supplied to this graph.',
      acquisition_hint: 'Create claim-local evidence requirements, route them to applicable Evidence Search units, and bind returned evidence to the originating claim/request.'
    }));
  }

  if (/^(?:compare|comparison|比較)$/iu.test(operation)) {
    if (!criteria.length) {
      nodes.push(makeNode({
        material_kind: 'COMPARISON_BASIS',
        question: 'What common dimensions and conditions must be used to compare the candidates without changing the basis between candidates?',
        status: 'MISSING',
        missing_reason: 'A comparison operation is present without source-backed comparison criteria.',
        acquisition_hint: 'Resolve common comparison dimensions from the decision objective, explicit criteria, or applicable domain rules.'
      }));
    }
  }

  const domainState = text(options.domain_classification?.state || options.domain_state);
  nodes.push(makeNode({
    material_kind: 'DOMAIN_REFINEMENT',
    question: 'Which authoritative specialist rules, measurements, standards, failure modes, and evidence authorities refine these universal requirements?',
    required: false,
    status: domainState === 'RESOLVED' ? 'SATISFIED' : 'UNRESOLVED',
    source_refs: domainState ? sourceRef(domainState, 'DOMAIN_CLASSIFICATION_STATE') : [],
    value_refs: domainState ? [domainState] : [],
    missing_reason: domainState === 'RESOLVED' ? null : 'Specialist refinement is not yet resolved. This does not erase the decision-backward base requirements.',
    acquisition_hint: domainState === 'RESOLVED' ? null : 'Resolve the original domain classification and add specialist requirements additively; never replace base requirements with a genre template.',
    tags: ['ADDITIVE_REFINEMENT_ONLY']
  }));

  for (const node of nodes) {
    if (node.slot_id === root.slot_id || node.required === false) continue;
    edges.push({ from: node.slot_id, to: root.slot_id, relation: 'REQUIRED_FOR_DECISION_QUESTION' });
  }

  const requiredNodes = nodes.filter((node) => node.required !== false);
  const gapNodes = requiredNodes.filter((node) => GAP_STATES.has(node.status));
  const accountedNodes = requiredNodes.filter((node) => TERMINAL_STATES.has(node.status) || GAP_STATES.has(node.status));

  return {
    owner_request_id: ownerRequestId,
    root_slot_id: root.slot_id,
    nodes,
    edges,
    accounting_complete: accountedNodes.length === requiredNodes.length,
    decision_ready: gapNodes.length === 0,
    gap_slot_ids: gapNodes.map((node) => node.slot_id)
  };
}

function signatureFor(graph) {
  const payload = graph.requests.map((request) => request.nodes.map((node) => ({
    owner_request_id: node.owner_request_id,
    material_kind: node.material_kind,
    question: node.question,
    required: node.required,
    status: node.status,
    value_refs: node.value_refs
  })));
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildMaterialRequirementGraph({
  requests = [],
  observations = [],
  global_context = {},
  domain_classification = null
} = {}) {
  const normalizedRequests = array(requests);
  const requestGraphs = normalizedRequests.map((request, index) => buildRequestGraph(request, index, {
    observations,
    global_context,
    domain_classification
  }));
  const allNodes = requestGraphs.flatMap((request) => request.nodes);
  const required = allNodes.filter((node) => node.required !== false);
  const gaps = required.filter((node) => GAP_STATES.has(node.status));
  const graph = {
    schema: GRAPH_SCHEMA,
    derivation_authority: DERIVATION_AUTHORITY,
    authority_rule: 'Decision requirements are derived from the judgment question and its dependency/validity conditions before domain refinement. Domain/document/genre labels may refine but never replace this graph.',
    request_count: requestGraphs.length,
    requests: requestGraphs,
    totals: {
      nodes: allNodes.length,
      required: required.length,
      satisfied: required.filter((node) => node.status === 'SATISFIED').length,
      missing: required.filter((node) => node.status === 'MISSING').length,
      unresolved: required.filter((node) => node.status === 'UNRESOLVED').length,
      conflicting: required.filter((node) => node.status === 'CONFLICTING').length,
      not_applicable: required.filter((node) => node.status === 'NOT_APPLICABLE').length
    },
    accounting_complete: requestGraphs.length > 0 && requestGraphs.every((request) => request.accounting_complete),
    decision_ready: requestGraphs.length > 0 && gaps.length === 0,
    gap_slot_ids: gaps.map((node) => node.slot_id)
  };
  return { ...graph, graph_signature: signatureFor(graph) };
}

function requestsFromPrepared(prepared = {}) {
  const packet = prepared.analysis_task_packet || {};
  const caseModel = packet.case_model || packet.observable_material?.case_model || prepared.observable_material?.case_model;
  if (Array.isArray(caseModel?.judgment_requests) && caseModel.judgment_requests.length) {
    return caseModel.judgment_requests;
  }

  const grouped = new Map();
  for (const task of array(packet.tasks)) {
    const id = text(task.request_id || task.id) || `T${grouped.size + 1}`;
    if (!grouped.has(id)) {
      grouped.set(id, {
        id,
        action: task.action || 'analyze',
        request_text: task.raw_text || task.target || task.objective || task.purpose || packet.user_goal || prepared.target || '',
        objectives: unique([task.objective, task.purpose, task.user_goal]),
        external_evidence_requested: task.evidence_need?.required === true,
        local_context: {
          deadlines: unique(task.deadlines),
          preserve: unique(task.preserve),
          prohibitions: unique(task.prohibitions),
          unresolved: unique(task.unresolved),
          conditions: unique(task.conditions || task.constraints),
          exceptions: unique(task.exceptions),
          obligations: [], permissions: [],
          acceptance_criteria: unique([...(array(task.completion_criteria)), ...(array(task.success_criteria))]),
          assumptions: unique(task.premises),
          questions: [],
          risk_signals: []
        }
      });
      continue;
    }
    const existing = grouped.get(id);
    existing.objectives = unique([...existing.objectives, task.objective, task.purpose, task.user_goal]);
    existing.external_evidence_requested ||= task.evidence_need?.required === true;
  }
  return [...grouped.values()];
}

function attachMaterialRequirementGraph(prepared = {}) {
  if (!prepared?.analysis_task_packet) return prepared;
  const packet = prepared.analysis_task_packet;
  const caseModel = packet.case_model || packet.observable_material?.case_model || prepared.observable_material?.case_model || {};
  const requests = requestsFromPrepared(prepared);
  if (!requests.length) return prepared;
  const graph = buildMaterialRequirementGraph({
    requests,
    observations: array(caseModel.observations),
    global_context: caseModel.global_context || {
      deadlines: packet.deadlines || [],
      preserve: packet.preserve || [],
      prohibitions: packet.prohibitions || [],
      unresolved: packet.unresolved || [],
      conditions: packet.conditions || [],
      exceptions: packet.exceptions || [],
      obligations: [], permissions: [], acceptance_criteria: [], assumptions: [], questions: [], risk_signals: []
    }
  });
  return {
    ...prepared,
    analysis_task_packet: {
      ...packet,
      material_requirement_graph: graph
    }
  };
}

module.exports = {
  GRAPH_SCHEMA,
  DERIVATION_AUTHORITY,
  buildMaterialRequirementGraph,
  attachMaterialRequirementGraph,
  requestsFromPrepared
};
