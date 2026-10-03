'use strict';

const PROJECTION_SCHEMA = 'astera.material-requirement-main8-projection.v1';
const GAP_STATES = new Set(['MISSING', 'UNRESOLVED', 'CONFLICTING']);
const INTERNAL_ONLY_KINDS = new Set(['DOMAIN_REFINEMENT']);

const SECTION_BY_KIND = Object.freeze({
  DECISION_CRITERION: '02_premise',
  BOUNDARY_OR_PRECONDITION: '02_premise',
  ASSUMPTION_VALIDATION: '02_premise',
  UNRESOLVED_ITEM: '02_premise',
  SUBQUESTION_ANSWER: '02_premise',
  SPECIALIST_FACT_REQUIREMENT: '02_premise',
  SPECIALIST_INQUIRY_REQUIREMENT: '02_premise',
  FALSIFICATION_OR_DISQUALIFIER: '04_crisis',
  SPECIALIST_RISK_CHECK: '04_crisis',
  OVERLAY_RISK_CHECK: '04_crisis',
  SPECIALIST_SAFETY_RULE: '04_crisis',
  OVERLAY_SAFETY_RULE: '04_crisis',
  COMPARISON_BASIS: '06_comparison',
  SPECIALIST_COMPARISON_DIMENSION: '06_comparison',
  OBSERVATION_VALIDATION: '07_evidence_status',
  EVIDENCE_SUPPORT: '07_evidence_status',
  SPECIALIST_EVIDENCE_REQUIREMENT: '07_evidence_status',
  OVERLAY_EVIDENCE_REQUIREMENT: '07_evidence_status'
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

function langCode(lang) {
  return String(lang || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
}

function statusLabel(status, lang) {
  if (lang === 'ja') {
    if (status === 'MISSING') return '不足';
    if (status === 'UNRESOLVED') return '未確認';
    if (status === 'CONFLICTING') return '矛盾あり';
    if (status === 'SATISFIED') return '確認境界';
    return '確認対象';
  }
  if (status === 'MISSING') return 'Missing';
  if (status === 'UNRESOLVED') return 'Unresolved';
  if (status === 'CONFLICTING') return 'Conflicting';
  if (status === 'SATISFIED') return 'Boundary';
  return 'Check';
}

function requestLabel(index, lang) {
  return lang === 'ja' ? `要求${index + 1}` : `Request ${index + 1}`;
}

function publicQuestion(node) {
  return clean(node?.question);
}

function publicItem(node, requestIndex, lang) {
  const question = publicQuestion(node);
  if (!question) return '';
  return `${requestLabel(requestIndex, lang)}: ${statusLabel(node.status, lang)} — ${question}`;
}

function publicNextAction(node, requestIndex, lang) {
  if (!GAP_STATES.has(String(node?.status || ''))) return '';
  const hint = clean(node?.acquisition_hint) || publicQuestion(node);
  if (!hint) return '';
  return `${requestLabel(requestIndex, lang)}: ${lang === 'ja' ? '次に確認' : 'Verify next'} — ${hint}`;
}

function shouldProjectNode(node) {
  const kind = String(node?.material_kind || '');
  if (!kind || INTERNAL_ONLY_KINDS.has(kind)) return false;
  const section = SECTION_BY_KIND[kind];
  if (!section) return false;
  if (GAP_STATES.has(String(node?.status || ''))) return true;
  return ['SPECIALIST_SAFETY_RULE', 'OVERLAY_SAFETY_RULE'].includes(kind) && node?.status === 'SATISFIED';
}

function projectMaterialRequirementsToMain8(graph, { lang = 'ja' } = {}) {
  const resolvedLang = langCode(lang);
  const sections = {
    '02_premise': [],
    '04_crisis': [],
    '06_comparison': [],
    '07_evidence_status': [],
    '08_reinstruction': []
  };
  let projectable = 0;
  let projected = 0;
  let internalOnly = 0;
  let duplicateCollapses = 0;

  for (const [requestIndex, request] of array(graph?.requests).entries()) {
    const seenPerSection = new Map(Object.keys(sections).map((key) => [key, new Set()]));
    for (const node of array(request?.nodes)) {
      const kind = String(node?.material_kind || '');
      if (INTERNAL_ONLY_KINDS.has(kind)) {
        internalOnly += 1;
        continue;
      }
      if (!shouldProjectNode(node)) continue;
      const section = SECTION_BY_KIND[kind];
      projectable += 1;
      const item = publicItem(node, requestIndex, resolvedLang);
      if (item) {
        const seen = seenPerSection.get(section);
        if (seen.has(item)) duplicateCollapses += 1;
        else {
          seen.add(item);
          sections[section].push(item);
          projected += 1;
        }
      }
      const action = publicNextAction(node, requestIndex, resolvedLang);
      if (action) {
        const seenActions = seenPerSection.get('08_reinstruction');
        if (seenActions.has(action)) duplicateCollapses += 1;
        else {
          seenActions.add(action);
          sections['08_reinstruction'].push(action);
        }
      }
    }
  }

  for (const key of Object.keys(sections)) sections[key] = unique(sections[key]);

  return {
    schema: PROJECTION_SCHEMA,
    language: resolvedLang,
    request_count: array(graph?.requests).length,
    accounting_complete: graph?.accounting_complete === true,
    decision_ready: graph?.decision_ready === true,
    sections,
    coverage: {
      projectable_nodes: projectable,
      projected_nodes: projected,
      internal_only_nodes: internalOnly,
      duplicate_collapses: duplicateCollapses,
      coverage_complete: projected + duplicateCollapses === projectable
    }
  };
}

function appendBlock(text, title, items) {
  if (!items.length) return String(text || '');
  const block = [`- ${title}:`, ...items.map((item) => `  - ${item}`)].join('\n');
  const base = String(text || '').trim();
  return base ? `${base}\n${block}` : block;
}

function mergeProjectionIntoRenderedMain8(rendered, projection) {
  if (!rendered || !projection || projection.schema !== PROJECTION_SCHEMA) return rendered;
  const lang = projection.language === 'ja' ? 'ja' : 'en';
  const titles = lang === 'ja'
    ? {
      '02_premise': '判断に必要だが不足・未確認の材料',
      '04_crisis': '判断を誤らせる失格条件・専門リスク',
      '06_comparison': '同じ条件で比較するために必要な材料',
      '07_evidence_status': '根拠・観測の未成立事項',
      '08_reinstruction': '不足を埋めるための次の確認'
    }
    : {
      '02_premise': 'Material still missing or unresolved for judgment',
      '04_crisis': 'Disqualifying conditions and specialist risks',
      '06_comparison': 'Material required for same-condition comparison',
      '07_evidence_status': 'Evidence and observation gaps',
      '08_reinstruction': 'Next checks needed to close material gaps'
    };

  const byKey = new Map(array(rendered.sections).map((section) => [section?.key, { ...section }]));
  for (const [key, items] of Object.entries(projection.sections || {})) {
    if (!items.length || !byKey.has(key)) continue;
    const section = byKey.get(key);
    section.text = appendBlock(section.text, titles[key], items);
    byKey.set(key, section);
  }
  const sections = array(rendered.sections).map((section) => byKey.get(section?.key) || section);
  const text = sections.map((section) => `${section.label}\n${section.text}`).join('\n---\n');
  const compactText = sections.map((section) => `${section.label}: ${String(section.text || '').replace(/\n\s*/g, ' / ')}`).join('\n');
  return {
    ...rendered,
    text,
    compact_text: compactText,
    sections,
    material_requirement_projection: {
      schema: projection.schema,
      request_count: projection.request_count,
      accounting_complete: projection.accounting_complete,
      decision_ready: projection.decision_ready,
      coverage: projection.coverage
    }
  };
}

module.exports = {
  PROJECTION_SCHEMA,
  SECTION_BY_KIND,
  projectMaterialRequirementsToMain8,
  mergeProjectionIntoRenderedMain8
};
