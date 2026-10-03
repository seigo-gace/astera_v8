'use strict';

const GRAPH_SCHEMA = 'astera.material-requirement-graph.v1';
const DERIVATION_AUTHORITY = 'DECISION_BACKWARD_REQUIREMENT_DERIVATION';
const ALLOWED_STATES = new Set(['SATISFIED', 'MISSING', 'UNRESOLVED', 'CONFLICTING', 'NOT_APPLICABLE']);
const REQUIRED_BASE_KINDS = Object.freeze([
  'DECISION_QUESTION',
  'JUDGMENT_OPERATION',
  'DECISION_CRITERION',
  'FALSIFICATION_OR_DISQUALIFIER'
]);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function increment(target, key) {
  if (!key) return;
  target[key] = (target[key] || 0) + 1;
}

function diagnoseMaterialRequirementGraph(graph, { expectedMinRequests = 1 } = {}) {
  const failures = [];
  const byKind = {};
  const gapsByKind = {};
  const gapsByStatus = {};
  const requestDiagnostics = [];

  if (!graph || typeof graph !== 'object') {
    return {
      pass: false,
      present: false,
      accounting_complete: false,
      decision_ready: false,
      request_count: 0,
      node_count: 0,
      gap_count: 0,
      gaps_by_kind: {},
      gaps_by_status: {},
      failures: [{ code: 'MATERIAL_REQUIREMENT_GRAPH_MISSING' }],
      requests: []
    };
  }

  if (graph.schema !== GRAPH_SCHEMA) {
    failures.push({ code: 'MATERIAL_REQUIREMENT_GRAPH_SCHEMA_INVALID', expected: GRAPH_SCHEMA, actual: graph.schema || null });
  }
  if (graph.derivation_authority !== DERIVATION_AUTHORITY) {
    failures.push({ code: 'MATERIAL_REQUIREMENT_DERIVATION_AUTHORITY_INVALID', expected: DERIVATION_AUTHORITY, actual: graph.derivation_authority || null });
  }

  const requests = array(graph.requests);
  const expected = Math.max(1, Number(expectedMinRequests) || 1);
  if (requests.length < expected) {
    failures.push({ code: 'MATERIAL_REQUIREMENT_REQUEST_COVERAGE_INCOMPLETE', expected_min: expected, actual: requests.length });
  }
  if (Number(graph.request_count) !== requests.length) {
    failures.push({ code: 'MATERIAL_REQUIREMENT_REQUEST_COUNT_MISMATCH', declared: graph.request_count, actual: requests.length });
  }

  const seenSlotIds = new Set();
  let nodeCount = 0;
  let gapCount = 0;

  for (const request of requests) {
    const requestFailures = [];
    const nodes = array(request?.nodes);
    nodeCount += nodes.length;
    const kinds = new Set(nodes.map((node) => String(node?.material_kind || '')).filter(Boolean));

    for (const requiredKind of REQUIRED_BASE_KINDS) {
      if (!kinds.has(requiredKind)) {
        requestFailures.push({ code: 'MATERIAL_REQUIREMENT_BASE_KIND_MISSING', material_kind: requiredKind });
      }
    }

    const root = nodes.find((node) => node?.slot_id === request?.root_slot_id);
    if (!root || root.material_kind !== 'DECISION_QUESTION') {
      requestFailures.push({ code: 'MATERIAL_REQUIREMENT_ROOT_INVALID', root_slot_id: request?.root_slot_id || null });
    }

    for (const node of nodes) {
      const slotId = String(node?.slot_id || '');
      const kind = String(node?.material_kind || '');
      const status = String(node?.status || '');
      if (!slotId) {
        requestFailures.push({ code: 'MATERIAL_REQUIREMENT_SLOT_ID_MISSING', material_kind: kind || null });
      } else if (seenSlotIds.has(slotId)) {
        requestFailures.push({ code: 'MATERIAL_REQUIREMENT_SLOT_ID_DUPLICATE', slot_id: slotId });
      } else {
        seenSlotIds.add(slotId);
      }
      if (!kind) requestFailures.push({ code: 'MATERIAL_REQUIREMENT_KIND_MISSING', slot_id: slotId || null });
      if (!ALLOWED_STATES.has(status)) {
        requestFailures.push({ code: 'MATERIAL_REQUIREMENT_NODE_STATE_INVALID', slot_id: slotId || null, status: status || null });
      }
      increment(byKind, kind);
      if (node?.required !== false && ['MISSING', 'UNRESOLVED', 'CONFLICTING'].includes(status)) {
        gapCount += 1;
        increment(gapsByKind, kind);
        increment(gapsByStatus, status);
      }
    }

    if (request?.accounting_complete !== true) {
      requestFailures.push({ code: 'MATERIAL_REQUIREMENT_REQUEST_ACCOUNTING_INCOMPLETE' });
    }

    requestDiagnostics.push({
      owner_request_id: request?.owner_request_id || null,
      node_count: nodes.length,
      accounting_complete: request?.accounting_complete === true,
      decision_ready: request?.decision_ready === true,
      gap_count: array(request?.gap_slot_ids).length,
      failures: requestFailures
    });
    failures.push(...requestFailures.map((failure) => ({ ...failure, owner_request_id: request?.owner_request_id || null })));
  }

  if (graph.accounting_complete !== true) {
    failures.push({ code: 'MATERIAL_REQUIREMENT_GRAPH_ACCOUNTING_INCOMPLETE' });
  }

  return {
    pass: failures.length === 0,
    present: true,
    schema: graph.schema || null,
    derivation_authority: graph.derivation_authority || null,
    accounting_complete: graph.accounting_complete === true,
    decision_ready: graph.decision_ready === true,
    request_count: requests.length,
    node_count: nodeCount,
    gap_count: gapCount,
    nodes_by_kind: byKind,
    gaps_by_kind: gapsByKind,
    gaps_by_status: gapsByStatus,
    graph_signature: graph.graph_signature || null,
    failures,
    requests: requestDiagnostics
  };
}

module.exports = {
  GRAPH_SCHEMA,
  DERIVATION_AUTHORITY,
  ALLOWED_STATES,
  REQUIRED_BASE_KINDS,
  diagnoseMaterialRequirementGraph
};
