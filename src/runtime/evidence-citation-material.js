'use strict';

const { renderMultiJudgmentMain8 } = require('./multi-judgment-main8-renderer');

const SECTION_KEYS = Object.freeze([
  '01_purpose','02_premise','03_facts','04_crisis',
  '05_opposition','06_comparison','07_evidence_status','08_reinstruction'
]);
const EXTERNAL = 'EXTERNAL_RETRIEVED_EVIDENCE';
const USED_RELATIONS = new Set(['SUPPORTS', 'CONTRADICTS', 'PARTIALLY_SUPPORTS']);
const EVIDENCE_MARKER = '===ASTERA_EVIDENCE===';

function text(value) {
  return String(value == null ? '' : value).normalize('NFKC').replace(/\s+/g, ' ').trim();
}
function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}
function sourceKey(binding = {}) {
  return text(binding.candidate_id || binding.canonical_record_id || binding.canonical_locator?.url || binding.source_span || binding.evidence_binding_id);
}
function collectBindings(result = {}) {
  const rows = [];
  for (const taskResult of result.task_results || []) {
    const taskId = taskResult?.task?.id || null;
    for (const record of taskResult?.canonical?.records || []) {
      const claim = record?.claim || {};
      for (const binding of record?.confirmation?.bindings || []) {
        if (binding?.evidence_source !== EXTERNAL) continue;
        if (!USED_RELATIONS.has(String(binding.relation || ''))) continue;
        rows.push({ task_id: taskId, claim, confirmation_status: record?.confirmation?.status || null, binding });
      }
    }
  }
  return rows;
}
function referencedCandidateIds(value, out = new Set()) {
  if (!value) return out;
  if (Array.isArray(value)) {
    for (const item of value) referencedCandidateIds(item, out);
    return out;
  }
  if (typeof value !== 'object') return out;
  if (value.candidate_id) out.add(String(value.candidate_id));
  if (value.evidence_id) out.add(String(value.evidence_id));
  for (const [key, nested] of Object.entries(value)) {
    if (/evidence_refs|support_evidence_refs|counter_evidence_refs|candidate_materials|trade_off/i.test(key)) referencedCandidateIds(nested, out);
  }
  return out;
}
function sectionCandidateMap(result = {}, rows = []) {
  const judgment = result.judgment || {};
  const map = Object.fromEntries(SECTION_KEYS.map((key) => [key, new Set()]));
  const confirmedClaimIds = new Set();
  for (const item of judgment['03_facts']?.confirmed || []) {
    if (item?.claim_id) confirmedClaimIds.add(String(item.claim_id));
  }
  for (const row of rows) {
    const id = sourceKey(row.binding);
    if (!id) continue;
    if (row.confirmation_status === 'CONFIRMED' || confirmedClaimIds.has(String(row.claim?.claim_id || ''))) map['03_facts'].add(id);
  }
  const risks = judgment['04_crisis']?.risks || [];
  const riskClaimIds = new Set(risks.flatMap((risk) => risk?.claim_ids || []).map(String));
  for (const row of rows) {
    if (riskClaimIds.has(String(row.claim?.claim_id || ''))) map['04_crisis'].add(sourceKey(row.binding));
  }
  for (const key of ['05_opposition', '06_comparison']) {
    const ids = referencedCandidateIds(judgment[key]);
    for (const id of ids) map[key].add(id);
  }
  for (const row of rows) map['07_evidence_status'].add(sourceKey(row.binding));
  return map;
}
function sourceRecord(sourceId, key, rows, sectionMap) {
  const first = rows[0].binding;
  const claims = rows.map((row) => ({
    task_id: row.task_id,
    claim_id: row.claim?.claim_id || null,
    claim_text: text(row.claim?.raw_text || row.claim?.text || ''),
    confirmation_status: row.confirmation_status,
    relation: row.binding.relation,
    binding_id: row.binding.evidence_binding_id || null
  })).sort((a, b) => `${a.claim_id}:${a.binding_id}`.localeCompare(`${b.claim_id}:${b.binding_id}`));
  const sectionKeys = SECTION_KEYS.filter((sectionKey) => sectionMap[sectionKey].has(key));
  const locator = first.canonical_locator && typeof first.canonical_locator === 'object'
    ? { ...first.canonical_locator }
    : { url: /^https?:\/\//i.test(String(first.source_span || '')) ? String(first.source_span) : null, locator_type: /^https?:\/\//i.test(String(first.source_span || '')) ? 'URL' : 'RECORD_ID', replayable: Boolean(first.source_span) };
  return {
    id: sourceId,
    source_id: sourceId,
    display_number: Number(sourceId.slice(1)),
    candidate_id: first.candidate_id || null,
    canonical_record_id: first.canonical_record_id || null,
    title: text(first.title) || text(first.publisher?.name) || text(first.authority_id) || text(first.provider_id) || first.candidate_id || sourceId,
    url: locator.url || null,
    canonical_locator: locator,
    provider_id: first.provider_id || null,
    source_class: first.source_class || null,
    source_role: Array.isArray(first.source_roles) ? (first.source_roles[0] || null) : (first.source_role || null),
    source_family_id: first.source_family_id || null,
    authority_id: first.authority_id || null,
    publisher: first.publisher && typeof first.publisher === 'object' ? { ...first.publisher } : { id: null, name: null },
    excerpt: text(first.excerpt),
    published_at: first.published_at || null,
    updated_at: first.updated_at || null,
    retrieved_at: first.retrieved_at || null,
    content_hash: first.content_hash || null,
    revision_id: first.revision_id || null,
    verification_status: claims.every((link) => link.confirmation_status === 'CONFIRMED' && link.relation === 'SUPPORTS') ? 'confirmed' : 'qualified',
    section_keys: sectionKeys,
    claim_links: claims
  };
}
function buildEvidenceCitationMaterial(result = {}) {
  const rows = collectBindings(result);
  const grouped = new Map();
  for (const row of rows) {
    const key = sourceKey(row.binding);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const orderedKeys = [...grouped.keys()].sort();
  const idByKey = new Map(orderedKeys.map((key, index) => [key, `E${String(index + 1).padStart(2, '0')}`]));
  const sectionMap = sectionCandidateMap(result, rows);
  const sources = orderedKeys.map((key) => sourceRecord(idByKey.get(key), key, grouped.get(key), sectionMap));
  const sectionSourceIds = Object.fromEntries(SECTION_KEYS.map((key) => [
    key,
    [...sectionMap[key]].map((candidateId) => idByKey.get(candidateId)).filter(Boolean).sort()
  ]));
  const claimSourceIds = {};
  for (const source of sources) {
    for (const link of source.claim_links) {
      if (!link.claim_id) continue;
      claimSourceIds[link.claim_id] = unique([...(claimSourceIds[link.claim_id] || []), source.id]).sort();
    }
  }
  return {
    schema_version: 'astera.evidence-citation.v1',
    consumer_scope: 'HUMAN_AND_AI_SAME_EVIDENCE',
    source_count: sources.length,
    sources,
    section_source_ids: sectionSourceIds,
    claim_source_ids: claimSourceIds
  };
}
function annotationLines(ids, citationMaterial, lang) {
  const sources = citationMaterial.sources.filter((source) => ids.includes(source.id));
  const claimMap = new Map();
  for (const source of sources) {
    for (const link of source.claim_links) {
      const claim = link.claim_text || link.claim_id;
      if (!claim) continue;
      claimMap.set(claim, unique([...(claimMap.get(claim) || []), source.id]).sort());
    }
  }
  const lines = [];
  if (claimMap.size) {
    lines.push(`- ${lang === 'ja' ? '回答と根拠の対応' : 'Answer-to-evidence mapping'}:`);
    for (const [claim, sourceIds] of claimMap) lines.push(`  - ${claim} → ${sourceIds.map((id) => `[${id}]`).join(' ')}`);
  } else {
    lines.push(`- ${lang === 'ja' ? 'この項目で使用した外部根拠' : 'External evidence used in this section'}: ${ids.map((id) => `[${id}]`).join(' ')}`);
  }
  return lines;
}
function annotateMain8Text(main8Text, citationMaterial, lang = 'ja') {
  const blocks = String(main8Text || '').split('\n---\n');
  if (blocks.length !== SECTION_KEYS.length) return String(main8Text || '');
  return blocks.map((block, index) => {
    const key = SECTION_KEYS[index];
    const ids = citationMaterial.section_source_ids[key] || [];
    if (!ids.length) return block;
    return `${block}\n${annotationLines(ids, citationMaterial, lang).join('\n')}`;
  }).join('\n---\n');
}
function renderEvidenceTrailer(citationMaterial) {
  return `${EVIDENCE_MARKER}\n${JSON.stringify(citationMaterial, null, 2)}`;
}
function attachEvidenceCitations(out = {}) {
  if (!out?.result?.judgment || !out?.material?.text) return out;
  const lang = String(out.result.judgment.output_language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
  const multiMaterial = renderMultiJudgmentMain8(out.result.judgment);
  const baseMaterial = multiMaterial || out.material;
  const evidenceCitations = buildEvidenceCitationMaterial(out.result);
  const main8Text = annotateMain8Text(baseMaterial.text, evidenceCitations, lang);
  const evidenceText = renderEvidenceTrailer(evidenceCitations);
  const textWithEvidence = `${main8Text}\n${evidenceText}`;
  const judgment = { ...out.result.judgment, evidence_citations: evidenceCitations };
  for (const key of SECTION_KEYS) {
    judgment[key] = { ...judgment[key], source_ids: evidenceCitations.section_source_ids[key] || [] };
  }
  return {
    ...out,
    result: { ...out.result, judgment, evidence_citations: evidenceCitations },
    material: {
      ...out.material,
      ...(multiMaterial || {}),
      text: textWithEvidence,
      main8_text: main8Text,
      evidence_text: evidenceText,
      sources: evidenceCitations.sources,
      section_source_ids: evidenceCitations.section_source_ids,
      evidence_contract: evidenceCitations.schema_version
    },
    prompt: textWithEvidence
  };
}

module.exports = {
  SECTION_KEYS,
  EVIDENCE_MARKER,
  buildEvidenceCitationMaterial,
  annotateMain8Text,
  renderEvidenceTrailer,
  attachEvidenceCitations
};