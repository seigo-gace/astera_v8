'use strict';

const EXTERNAL_EVIDENCE_CUE = /(?:検証|事実確認|ファクトチェック|裏取り|調査|リサーチ|根拠|出典|公式(?:根拠|情報|Source)?|verify|validate|fact\s*check|research|investigate|evidence|source)/iu;
const EXPLICIT_EVIDENCE_REASON = /EXPLICIT_EXTERNAL_EVIDENCE_REQUEST/i;

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
function containsSpan(owner = {}, child = {}) {
  const ownerStart = Number(owner.start);
  const ownerEnd = Number(owner.end);
  const childStart = Number(child.start);
  const childEnd = Number(child.end);
  if (![ownerStart, ownerEnd, childStart, childEnd].every(Number.isFinite)) return false;
  return childStart >= ownerStart && childEnd <= ownerEnd && childEnd > childStart;
}
function parserOnly(request = {}) {
  const origin = String(request.source_origin || '');
  return origin === 'PARSER_TASK_GRAPH' || origin === 'PARSER_TASK';
}
function sourceBacked(request = {}) {
  return !parserOnly(request) && String(request.source_origin || '').includes('SOURCE');
}
function isSmallParserSubtask(owner, child) {
  if (!sourceBacked(owner) || !parserOnly(child)) return false;
  if (!containsSpan(owner.source_span, child.source_span)) return false;
  const ownerText = norm(owner.request_text);
  const childText = norm(child.request_text);
  if (!ownerText || !childText || ownerText === childText || !ownerText.includes(childText)) return false;
  const childSpanLength = spanLength(child.source_span);
  const ownerSpanLength = spanLength(owner.source_span);
  if (!childSpanLength || !ownerSpanLength) return false;
  return childText.length <= 16 && childSpanLength / ownerSpanLength <= 0.35;
}
function taskExplicitEvidence(task = {}, requestText = '') {
  if (EXTERNAL_EVIDENCE_CUE.test(norm(requestText))) return true;
  return (task.evidence_need?.reasons || []).some((reason) => EXPLICIT_EVIDENCE_REASON.test(String(reason)));
}
function remapRelation(relation, idMap) {
  const from = idMap.get(String(relation.from_request_id || ''));
  const to = idMap.get(String(relation.to_request_id || ''));
  if (!from || !to || from === to) return null;
  return { ...relation, from_request_id: from, to_request_id: to };
}
function normalizeMultiJudgmentCase(prepared, input = {}) {
  const packet = prepared?.analysis_task_packet;
  const originalModel = packet?.case_model || packet?.observable_material?.case_model || prepared?.observable_material?.case_model;
  if (!packet || !originalModel || Number(originalModel.request_count || 0) < 2) return prepared;

  const requests = Array.isArray(originalModel.judgment_requests) ? originalModel.judgment_requests.map((request) => ({ ...request })) : [];
  if (requests.length < 2) return prepared;
  const ownerByRemovedId = new Map();
  for (const child of requests) {
    if (!parserOnly(child)) continue;
    const owners = requests.filter((owner) => owner.id !== child.id && isSmallParserSubtask(owner, child));
    if (owners.length === 1) ownerByRemovedId.set(String(child.id), String(owners[0].id));
  }
  if (!ownerByRemovedId.size) return prepared;

  const ownerExtraTaskIds = new Map();
  for (const [removedId, ownerId] of ownerByRemovedId) {
    const removed = requests.find((request) => String(request.id) === removedId);
    if (!removed) continue;
    const current = ownerExtraTaskIds.get(ownerId) || [];
    ownerExtraTaskIds.set(ownerId, unique([...current, ...(removed.parser_task_ids || []), ...(removed.parser_task_id ? [removed.parser_task_id] : [])]));
  }

  const survivors = requests.filter((request) => !ownerByRemovedId.has(String(request.id)));
  const oldToNew = new Map();
  survivors.forEach((request, index) => oldToNew.set(String(request.id), `R${String(index + 1).padStart(2, '0')}`));
  for (const [removedId, ownerId] of ownerByRemovedId) oldToNew.set(removedId, oldToNew.get(ownerId));

  const tasks = (packet.tasks || []).map((task) => {
    const oldRequestId = String(task.request_id || '');
    const newRequestId = oldToNew.get(oldRequestId) || oldRequestId;
    const request = survivors.find((item) => oldToNew.get(String(item.id)) === newRequestId) || null;
    if (!request) return task;
    const explicitEvidence = taskExplicitEvidence(task, request.request_text);
    const currentReasons = task.evidence_need?.reasons || [];
    return {
      ...task,
      request_id: newRequestId,
      evidence_need: {
        ...(task.evidence_need || {}),
        required: explicitEvidence,
        queries: explicitEvidence ? (task.evidence_need?.queries?.length ? task.evidence_need.queries : [request.request_text]) : [],
        reasons: explicitEvidence ? unique(currentReasons.length ? currentReasons : ['EXPLICIT_EXTERNAL_EVIDENCE_REQUEST']) : []
      }
    };
  });

  const normalizedRequests = survivors.map((request, index) => {
    const newId = `R${String(index + 1).padStart(2, '0')}`;
    const extra = ownerExtraTaskIds.get(String(request.id)) || [];
    const parserTaskIds = unique([...(request.parser_task_ids || []), ...(request.parser_task_id ? [request.parser_task_id] : []), ...extra]);
    const explicitEvidence = EXTERNAL_EVIDENCE_CUE.test(norm(request.request_text))
      || tasks.filter((task) => String(task.request_id) === newId).some((task) => taskExplicitEvidence(task, request.request_text));
    return {
      ...request,
      id: newId,
      order: index + 1,
      parser_task_ids: parserTaskIds,
      ...(parserTaskIds.length === 1 ? { parser_task_id: parserTaskIds[0] } : {}),
      external_evidence_requested: explicitEvidence
    };
  });

  const observations = (originalModel.observations || []).map((observation) => ({
    ...observation,
    request_ids: unique((observation.request_ids || []).map((id) => oldToNew.get(String(id)) || String(id)))
  }));
  const requestRelations = unique((originalModel.request_relations || []).map((relation) => {
    const mapped = remapRelation(relation, oldToNew);
    return mapped ? JSON.stringify(mapped) : '';
  })).map((value) => JSON.parse(value));

  const requestTaskIds = {};
  const taskMapping = {};
  for (const request of normalizedRequests) {
    const ids = unique(tasks.filter((task) => String(task.request_id || '') === request.id).map((task) => task.id));
    requestTaskIds[request.id] = ids;
    if (ids[0]) taskMapping[request.id] = ids[0];
  }
  const model = {
    ...originalModel,
    request_count: normalizedRequests.length,
    judgment_requests: normalizedRequests,
    observations,
    request_relations: requestRelations,
    multi_judgment: normalizedRequests.length > 1,
    request_task_ids: requestTaskIds,
    task_mapping: taskMapping,
    normalization: {
      parser_subtasks_folded_into_source_requests: [...ownerByRemovedId.keys()],
      request_count_before: requests.length,
      request_count_after: normalizedRequests.length
    }
  };
  const caseGoal = normalizedRequests.map((request) => request.request_text).join(' / ');
  const observableMaterial = {
    ...(packet.observable_material || prepared.observable_material || {}),
    case_model: model,
    input_observations: observations.map((item) => item.text)
  };
  return {
    ...prepared,
    target: caseGoal,
    objective: caseGoal,
    user_goal: caseGoal,
    observable_material: observableMaterial,
    analysis_task_packet: {
      ...packet,
      tasks,
      user_goal: caseGoal,
      case_model: model,
      observable_material: observableMaterial,
      multi_judgment_normalization: model.normalization
    }
  };
}

module.exports = {
  normalizeMultiJudgmentCase,
  isSmallParserSubtask,
  taskExplicitEvidence
};