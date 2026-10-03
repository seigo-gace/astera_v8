'use strict';

const crypto = require('node:crypto');
const { routeDomainTemplates } = require('../domain-template-router');
const { requestsFromPrepared } = require('./material-requirement-graph');

const REFINEMENT_VERSION = 'astera.specialist-requirement-refinement.v1';
const GAP_STATES = new Set(['MISSING', 'UNRESOLVED', 'CONFLICTING']);
const ACCOUNTED_STATES = new Set(['SATISFIED', 'MISSING', 'UNRESOLVED', 'CONFLICTING', 'NOT_APPLICABLE']);

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(array(values).map(text).filter(Boolean))];
}

function requestText(request = {}) {
  return text(request.request_text || request.raw_text || request.target || request.objective || request.purpose || array(request.objectives)[0]);
}

function requestOperation(request = {}) {
  return text(request.action || request.operation).toLowerCase();
}

function isStrongPrimary(primary) {
  return Boolean(
    primary
    && Number(primary.confidence || 0) >= 0.72
    && primary.taxonomy_review_required !== true
    && primary.classification_basis !== 'HYPOTHESIS_LAST_RESORT'
  );
}

function nextSpecialistId(requestGraph, sequence) {
  return `${requestGraph.owner_request_id}:SR${String(sequence).padStart(2, '0')}`;
}

function specialistNode(requestGraph, sequence, {
  material_kind,
  question,
  status = 'MISSING',
  required = true,
  source,
  source_value,
  tags = []
}) {
  return {
    slot_id: nextSpecialistId(requestGraph, sequence),
    owner_request_id: requestGraph.owner_request_id,
    material_kind,
    question: text(question),
    required: Boolean(required),
    status,
    source_refs: source_value ? [{ source, text: text(source_value) }] : [],
    evidence_refs: [],
    value_refs: source_value ? [text(source_value)] : [],
    missing_reason: status === 'MISSING'
      ? 'Specialist Lens identified material that is relevant to the judgment, but the current request does not yet establish it.'
      : null,
    acquisition_hint: status === 'MISSING'
      ? 'Obtain or derive this specialist material from source-backed case material, original four-level Domain Classification rules, or claim-local authoritative evidence. Do not fabricate it.'
      : null,
    truth_state: status === 'SATISFIED' ? 'INTERNAL_RULE_BACKED' : 'SPECIALIST_REQUIREMENT_UNRESOLVED',
    tags: unique(['SPECIALIST_REFINEMENT', ...tags])
  };
}

function appendNodes(requestGraph, route, request) {
  if (!route?.primary && !array(route?.overlays).length) {
    return {
      ...requestGraph,
      specialist_refinement: {
        version: REFINEMENT_VERSION,
        state: 'ABSTAINED',
        original_domain_classification_state: 'CLASSIFICATION_UNRESOLVED',
        genre_lens_primary: null,
        overlays: array(route?.overlays).map((overlay) => overlay.id),
        required_contribution: false
      }
    };
  }

  const nodes = [...array(requestGraph.nodes)];
  let sequence = 1;
  while (nodes.some((node) => String(node?.slot_id || '') === nextSpecialistId(requestGraph, sequence))) sequence += 1;
  const primary = route.primary || null;
  const strongPrimary = isStrongPrimary(primary);
  const op = requestOperation(request);

  const pushMany = (kind, values, questionPrefix, { required = strongPrimary, source = 'G01_G38_GENRE_LENS', tags = [] } = {}) => {
    for (const value of unique(values)) {
      nodes.push(specialistNode(requestGraph, sequence++, {
        material_kind: kind,
        question: `${questionPrefix}: ${value}`,
        required,
        source,
        source_value: value,
        tags
      }));
    }
  };

  if (primary) {
    pushMany('SPECIALIST_FACT_REQUIREMENT', primary.fact_lens, 'Specialist fact/material that must be examined');
    pushMany('SPECIALIST_RISK_CHECK', primary.risk_lens, 'Specialist failure/risk condition that must be checked');
    pushMany('SPECIALIST_INQUIRY_REQUIREMENT', primary.inquiry_lens, 'Specialist question that must be resolved');
    if (/^(?:compare|comparison|比較)$/iu.test(op)) {
      pushMany('SPECIALIST_COMPARISON_DIMENSION', primary.compare_lens, 'Common specialist comparison dimension', { required: strongPrimary });
    } else {
      pushMany('SPECIALIST_COMPARISON_DIMENSION', primary.compare_lens, 'Potential specialist comparison dimension', { required: false });
    }
    if (request.external_evidence_requested === true || request.evidence_need?.required === true) {
      pushMany('SPECIALIST_EVIDENCE_REQUIREMENT', primary.evidence_to_collect, 'Specialist evidence characteristic/material to collect', { required: strongPrimary });
    } else {
      pushMany('SPECIALIST_EVIDENCE_REQUIREMENT', primary.evidence_to_collect, 'Potential specialist evidence characteristic/material to collect', { required: false });
    }
    for (const rule of unique(primary.safety_gate)) {
      nodes.push(specialistNode(requestGraph, sequence++, {
        material_kind: 'SPECIALIST_SAFETY_RULE',
        question: `Specialist safety/boundary rule to preserve: ${rule}`,
        status: 'SATISFIED',
        required: true,
        source: 'G01_G38_GENRE_LENS_SAFETY_RULE',
        source_value: rule,
        tags: ['BOUNDARY_RULE']
      }));
    }
  }

  for (const overlay of array(route.overlays)) {
    pushMany('OVERLAY_RISK_CHECK', overlay.risk_lens, `Overlay ${overlay.id} risk to check`, { required: true, source: `OVERLAY:${overlay.id}`, tags: ['OVERLAY'] });
    const evidenceRequired = request.external_evidence_requested === true || request.evidence_need?.required === true;
    pushMany('OVERLAY_EVIDENCE_REQUIREMENT', overlay.evidence_to_collect, `Overlay ${overlay.id} evidence/material to collect`, { required: evidenceRequired, source: `OVERLAY:${overlay.id}`, tags: ['OVERLAY'] });
    for (const rule of unique(overlay.safety_gate)) {
      nodes.push(specialistNode(requestGraph, sequence++, {
        material_kind: 'OVERLAY_SAFETY_RULE',
        question: `Overlay ${overlay.id} safety/boundary rule to preserve: ${rule}`,
        status: 'SATISFIED',
        required: true,
        source: `OVERLAY:${overlay.id}`,
        source_value: rule,
        tags: ['OVERLAY', 'BOUNDARY_RULE']
      }));
    }
  }

  const requiredNodes = nodes.filter((node) => node?.required !== false);
  const gapNodes = requiredNodes.filter((node) => GAP_STATES.has(String(node?.status || '')));
  const accounted = requiredNodes.filter((node) => ACCOUNTED_STATES.has(String(node?.status || '')));

  return {
    ...requestGraph,
    nodes,
    accounting_complete: accounted.length === requiredNodes.length,
    decision_ready: gapNodes.length === 0,
    gap_slot_ids: gapNodes.map((node) => node.slot_id),
    specialist_refinement: {
      version: REFINEMENT_VERSION,
      state: primary ? 'GENRE_LENS_ADDITIVE' : 'OVERLAY_ONLY',
      original_domain_classification_state: 'CLASSIFICATION_UNRESOLVED',
      genre_lens_primary: primary ? {
        id: primary.id,
        name: primary.name,
        confidence: primary.confidence,
        classification_basis: primary.classification_basis,
        taxonomy_review_required: primary.taxonomy_review_required,
        path_resolution: primary.classification?.path_resolution || null,
        lens_anchor_path: primary.classification?.lens_anchor_path || null
      } : null,
      overlays: array(route.overlays).map((overlay) => overlay.id),
      required_contribution: strongPrimary || array(route.overlays).length > 0,
      authority_rule: 'Current G01-G38 Genre Lens/Overlay contributions are additive specialist requirements only. GENRE_LENS_ANCHOR is not original v4 four-level classification.'
    }
  };
}

function graphSignature(graph) {
  const payload = array(graph.requests).map((request) => ({
    owner_request_id: request.owner_request_id,
    specialist_refinement: request.specialist_refinement || null,
    nodes: array(request.nodes).map((node) => ({
      slot_id: node.slot_id,
      material_kind: node.material_kind,
      question: node.question,
      required: node.required,
      status: node.status,
      value_refs: node.value_refs
    }))
  }));
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function finalizeGraph(graph) {
  const allNodes = array(graph.requests).flatMap((request) => array(request.nodes));
  const required = allNodes.filter((node) => node?.required !== false);
  const gaps = required.filter((node) => GAP_STATES.has(String(node?.status || '')));
  const totals = {
    nodes: allNodes.length,
    required: required.length,
    satisfied: required.filter((node) => node.status === 'SATISFIED').length,
    missing: required.filter((node) => node.status === 'MISSING').length,
    unresolved: required.filter((node) => node.status === 'UNRESOLVED').length,
    conflicting: required.filter((node) => node.status === 'CONFLICTING').length,
    not_applicable: required.filter((node) => node.status === 'NOT_APPLICABLE').length
  };
  const next = {
    ...graph,
    specialist_refinement_version: REFINEMENT_VERSION,
    totals,
    accounting_complete: array(graph.requests).length > 0 && array(graph.requests).every((request) => request.accounting_complete === true),
    decision_ready: array(graph.requests).length > 0 && gaps.length === 0,
    gap_slot_ids: gaps.map((node) => node.slot_id)
  };
  return { ...next, graph_signature: graphSignature(next) };
}

function refinePreparedMaterialRequirements(prepared = {}) {
  const packet = prepared?.analysis_task_packet;
  const graph = packet?.material_requirement_graph;
  if (!packet || !graph || graph.specialist_refinement_version === REFINEMENT_VERSION) return prepared;

  const requests = requestsFromPrepared(prepared);
  const requestById = new Map(requests.map((request, index) => [text(request.id) || `R${String(index + 1).padStart(2, '0')}`, request]));
  const refinedRequests = array(graph.requests).map((requestGraph, index) => {
    const request = requestById.get(text(requestGraph.owner_request_id)) || requests[index] || {};
    const route = routeDomainTemplates({ question: requestText(request), context: '' });
    return appendNodes(requestGraph, route, request);
  });

  return {
    ...prepared,
    analysis_task_packet: {
      ...packet,
      material_requirement_graph: finalizeGraph({ ...graph, requests: refinedRequests })
    }
  };
}

module.exports = {
  REFINEMENT_VERSION,
  isStrongPrimary,
  refinePreparedMaterialRequirements
};
