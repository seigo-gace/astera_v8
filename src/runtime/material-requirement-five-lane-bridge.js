'use strict';

const GAP_STATES = new Set(['MISSING', 'UNRESOLVED', 'CONFLICTING']);
const STRUCTURAL_GAP_KINDS = new Set([
  'JUDGMENT_OPERATION',
  'DECISION_CRITERION',
  'FALSIFICATION_OR_DISQUALIFIER',
  'COMPARISON_BASIS'
]);

const PUBLIC_GAP_LABELS = Object.freeze({
  ja: Object.freeze({
    JUDGMENT_OPERATION: '判断方法（検証・比較・計画など）が未確定',
    DECISION_CRITERION: '判断基準・合格条件が未確定',
    FALSIFICATION_OR_DISQUALIFIER: '判断を無効にする条件・反例・失敗条件が未確定',
    COMPARISON_BASIS: '比較軸・比較条件が未確定'
  }),
  en: Object.freeze({
    JUDGMENT_OPERATION: 'The judgment operation is unresolved.',
    DECISION_CRITERION: 'The decision criteria / acceptance conditions are unresolved.',
    FALSIFICATION_OR_DISQUALIFIER: 'The invalidating condition, counterexample, or failure condition is unresolved.',
    COMPARISON_BASIS: 'The common comparison dimensions / conditions are unresolved.'
  })
});

function array(value) {
  return Array.isArray(value) ? value : [];
}

function clean(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(array(values).map(clean).filter(Boolean))];
}

function languageOf(prepared = {}) {
  const value = clean(
    prepared.output_language
    || prepared.language
    || prepared.analysis_task_packet?.output_language
    || prepared.analysis_task_packet?.language
    || 'ja'
  ).toLowerCase();
  return value.split('-')[0] === 'ja' ? 'ja' : 'en';
}

function normalizedLanguage(lang) {
  return clean(lang || 'ja').toLowerCase().split('-')[0] === 'ja' ? 'ja' : 'en';
}

function publicGapLabel(kind, lang) {
  return PUBLIC_GAP_LABELS[normalizedLanguage(lang)][kind] || '';
}

function isPublicStructuralGapLabel(value, lang) {
  const normalized = clean(value);
  if (!normalized) return false;
  return Object.values(PUBLIC_GAP_LABELS[normalizedLanguage(lang)]).includes(normalized);
}

function structuralGapNodes(requestGraph = {}) {
  return array(requestGraph.nodes).filter((node) =>
    node?.required !== false
    && GAP_STATES.has(String(node?.status || ''))
    && STRUCTURAL_GAP_KINDS.has(String(node?.material_kind || ''))
  );
}

function bridgeMaterialRequirementsIntoFiveLanes(prepared = {}) {
  const packet = prepared?.analysis_task_packet;
  const graph = packet?.material_requirement_graph;
  if (!packet || !graph || !array(packet.tasks).length || !array(graph.requests).length) return prepared;

  const lang = languageOf(prepared);
  const graphByRequestId = new Map(
    array(graph.requests)
      .map((requestGraph) => [clean(requestGraph?.owner_request_id), requestGraph])
      .filter(([id]) => Boolean(id))
  );

  const singleRequestGraph = array(graph.requests).length === 1 ? graph.requests[0] : null;
  const tasks = array(packet.tasks).map((task) => {
    const requestId = clean(task?.request_id || task?.id);
    const requestGraph = graphByRequestId.get(requestId) || singleRequestGraph;
    if (!requestGraph) return task;

    const gapLabels = unique(
      structuralGapNodes(requestGraph)
        .map((node) => publicGapLabel(String(node.material_kind || ''), lang))
    );
    if (!gapLabels.length) return task;

    return {
      ...task,
      unresolved: unique([...(task.unresolved || []), ...gapLabels])
    };
  });

  return {
    ...prepared,
    analysis_task_packet: {
      ...packet,
      tasks
    }
  };
}

module.exports = {
  GAP_STATES,
  STRUCTURAL_GAP_KINDS,
  PUBLIC_GAP_LABELS,
  publicGapLabel,
  isPublicStructuralGapLabel,
  structuralGapNodes,
  bridgeMaterialRequirementsIntoFiveLanes
};
