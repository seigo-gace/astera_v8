'use strict';

const { unique, tokenOverlap } = require('./judgment-materials-analyzer');
const { ClaimOrigin } = require('./v4-canonical/core');
const { ClaimStatus } = require('./v4-canonical/confirmation');
const { CandidateRelation, EvidenceSource } = require('./v4-canonical/evidence-binding');

const RUBRIC = Object.freeze([
  { id: 'R01_purpose_clear', label: '目的明確' },
  { id: 'R02_premise_constraints', label: '前提・制約' },
  { id: 'R03_known_vs_unknown', label: '既知vs未確認分離' },
  { id: 'R04_gaps_explicit', label: '不足明示' },
  { id: 'R05_risk_discovery', label: 'リスク発見' },
  { id: 'R06_counter_view', label: '反対視点' },
  { id: 'R07_comparison_axis', label: '比較軸' },
  { id: 'R08_contradiction_kept', label: '矛盾保持' },
  { id: 'R09_no_false_certainty', label: '不確実性を埋めない' },
  { id: 'R10_evidence_need', label: 'Evidence Need' },
  { id: 'R11_task_decomposition', label: 'Task分解' },
  { id: 'R12_condition_exception', label: '条件例外禁止保持' },
  { id: 'R13_ai_usable_structure', label: '主役AIが使いやすい構造' },
  { id: 'R14_no_hallucination', label: '捏造なし' },
  { id: 'R15_no_final_decision', label: 'Winner/最終判断なし' }
]);

const PLACEHOLDER_HEAD = /^(UNRESOLVED|UNKNOWN|TBD|N\/A|判断材料へ構造化|構造化待ち)/i;

const norm = (s) => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

function baselineMaterial(story) {
  const parts = [story.user_input];
  if (story.context) parts.push(story.context);
  return parts.filter(Boolean).join('\n');
}

function asteraMaterialText(out) {
  const text = out?.material?.text || out?.material?.compact_text || '';
  if (text) return String(text);
  const j = out?.result?.judgment;
  if (!j) return '';
  const keys = j.order || [];
  return keys.map((k) => {
    const sec = j[k];
    if (!sec) return '';
    const items = (sec.items || []).join('\n');
    return `${sec.label || k}\n${sec.summary || ''}\n${items}`;
  }).join('\n');
}

function packetOf(result) {
  return result?.analysis_task_packet || {};
}

function constraintEntries(packet, userInput, context) {
  const entries = [];
  const pushVal = (v, span) => {
    const text = typeof v === 'string' ? v : (v?.value ?? v?.text ?? JSON.stringify(v));
    if (!text || String(text).length < 2) return;
    entries.push({ text: String(text), span: span || v?.source_span || null });
  };
  for (const rec of packet.constraint_records || []) pushVal(rec.value ?? rec, rec.source_span);
  for (const item of packet.constraints || []) pushVal(item);
  for (const item of packet.prohibitions || []) pushVal(item);
  for (const item of packet.preserve || []) pushVal(item);
  for (const item of packet.deadlines || []) pushVal(item);
  for (const item of packet.conditions || []) pushVal(item);
  for (const item of packet.exceptions || []) pushVal(item);
  for (const t of packet.tasks || []) {
    for (const item of t.constraints || []) pushVal(item);
    for (const item of t.prohibitions || []) pushVal(item);
  }
  const userBlob = `${userInput}\n${context || ''}`;
  if (!entries.length && userBlob.length > 0) {
    return { entries: [], userBlob, inputHasExplicitConstraints: false };
  }
  return { entries, userBlob, inputHasExplicitConstraints: entries.length > 0 };
}

function purposeSources(packet, userInput) {
  const out = [];
  if (packet.user_goal) out.push(String(packet.user_goal));
  for (const t of packet.tasks || []) {
    if (t.purpose) out.push(String(t.purpose));
    if (t.objective) out.push(String(t.objective));
    if (t.user_goal) out.push(String(t.user_goal));
    if (t.source_span?.text) out.push(String(t.source_span.text));
  }
  if (!out.length && userInput) out.push(String(userInput).slice(0, 200));
  return unique(out.filter((s) => s && !PLACEHOLDER_HEAD.test(norm(s).slice(0, 24))));
}

function materialReflectsSources(materialText, sources, minOverlap = 0.22) {
  if (!sources.length) return false;
  const mat = norm(materialText);
  return sources.some((s) => tokenOverlap(mat, s) >= minOverlap);
}

function scorePurpose(mode, materialText, userInput, result) {
  const packet = packetOf(result);
  const sources = purposeSources(packet, userInput);
  if (mode === 'baseline') {
    return sources.length && tokenOverlap(userInput, sources[0]) >= 0.15 ? 1 : (userInput.length > 8 ? 1 : 0);
  }
  const jSum = result?.judgment?.['01_purpose']?.summary || '';
  if (jSum && PLACEHOLDER_HEAD.test(norm(jSum))) return 0;
  if (materialReflectsSources(materialText, sources, 0.28)) return 2;
  if (materialReflectsSources(materialText, sources, 0.18)) return 1;
  const items = result?.judgment?.['01_purpose']?.items || [];
  if (items.length && materialReflectsSources(items.join('\n'), sources, 0.2)) return 1;
  return 0;
}

function constraintMaterialBlob(materialText, result) {
  const prem = JSON.stringify(result?.judgment?.['02_premise'] || {});
  const rein = JSON.stringify(result?.judgment?.['08_reinstruction'] || {});
  const packet = packetOf(result);
  const pkt = norm([
    ...(packet.constraints || []),
    ...(packet.prohibitions || []),
    ...(packet.preserve || []),
    ...(packet.deadlines || []),
    ...(packet.conditions || [])
  ].map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join('\n'));
  return norm(`${materialText}\n${prem}\n${rein}\n${pkt}`);
}

function scoreConstraints(mode, materialText, userInput, context, result) {
  const packet = packetOf(result);
  const { entries, inputHasExplicitConstraints } = constraintEntries(packet, userInput, context);
  if (mode === 'baseline') {
    return inputHasExplicitConstraints ? 1 : 1;
  }
  if (!inputHasExplicitConstraints) return 2;
  if (!entries.length) return 1;
  const blob = constraintMaterialBlob(materialText, result);
  let kept = 0;
  for (const e of entries) {
    const key = norm(e.text).slice(0, 16);
    if (key.length < 3) {
      kept += 1;
      continue;
    }
    if (tokenOverlap(blob, e.text) >= 0.2) kept += 1;
    else if (e.span?.text && tokenOverlap(blob, e.span.text) >= 0.2) kept += 1;
  }
  const ratio = kept / entries.length;
  if (ratio >= 0.85) return 2;
  if (ratio >= 0.5) return 1;
  return 0;
}

function claimRecords(result) {
  return result?.canonical_claims?.records || [];
}

function scoreKnownUnknown(mode, materialText, result) {
  const records = claimRecords(result);
  const undetermined = (result?.canonical_claims?.undetermined_count ?? 0) > 0
    || records.some((r) => (r?.confirmation?.status || r?.status) === ClaimStatus.UNDETERMINED);
  const confirmed = records.some((r) => (r?.confirmation?.status || r?.status) === ClaimStatus.CONFIRMED);
  const unresolved = (packetOf(result).unresolved || []).length > 0;
  const hasSeparationStructure = mode === 'astera' && result?.type === 'cognitive_map'
    && (undetermined || unresolved || (confirmed && records.length > 1));
  if (mode === 'baseline') return 0;
  if (hasSeparationStructure && (undetermined || unresolved)) return 2;
  if (confirmed || undetermined || unresolved) return 1;
  return 0;
}

function scoreGaps(mode, result) {
  const inquiry = result?.inquiry || result?.task_results?.find((tr) => tr?.inquiry)?.inquiry;
  const unresolved = packetOf(result).unresolved || [];
  const missing = result?.analysis_task_packet?.hard_blockers || [];
  if (mode === 'baseline') return 0;
  if ((inquiry && (inquiry.gaps || inquiry.open_questions || []).length) || unresolved.length || missing.length) {
    return 2;
  }
  const tasks = packetOf(result).tasks || [];
  if (tasks.some((t) => (t.unresolved || []).length)) return 1;
  return 0;
}

function scoreRisk(mode, materialText, userInput, result) {
  const risks = [];
  if (result?.risk_assessment?.failure_conditions) risks.push(...result.risk_assessment.failure_conditions);
  if (result?.risk_assessment?.material_risks) risks.push(...result.risk_assessment.material_risks);
  for (const tr of result?.task_results || []) {
    if (tr?.risk?.failure_conditions) risks.push(...tr.risk.failure_conditions);
    if (tr?.risk?.items) risks.push(...tr.risk.items);
  }
  const crisis = result?.judgment?.['04_crisis'];
  if (crisis?.items?.length) risks.push(...crisis.items);
  const uniqueRisks = unique(risks.map((r) => (typeof r === 'string' ? r : r?.description || r?.text || JSON.stringify(r))));
  if (mode === 'baseline') return 0;
  if (!uniqueRisks.length) return 0;
  const blob = norm(materialText);
  const novel = uniqueRisks.filter((r) => tokenOverlap(blob, r) >= 0.18 && tokenOverlap(userInput, r) < 0.35);
  if (novel.length >= 1) return 2;
  if (uniqueRisks.some((r) => tokenOverlap(blob, r) >= 0.15)) return 1;
  return 0;
}

function scoreCounterView(mode, materialText, userInput, result) {
  const perspectives = [];
  if (result?.multi_perspective?.perspectives) perspectives.push(...result.multi_perspective.perspectives);
  if (result?.multi_perspective?.dimensions) perspectives.push(...result.multi_perspective.dimensions);
  const opp = result?.judgment?.['05_opposition'];
  if (opp?.items?.length) perspectives.push(...opp.items);
  if (mode === 'baseline') return 0;
  const blob = norm(materialText);
  const structured = perspectives.filter((p) => {
    const text = typeof p === 'string' ? p : (p?.summary || p?.label || JSON.stringify(p));
    return text && tokenOverlap(blob, text) >= 0.15 && tokenOverlap(userInput, text) < 0.4;
  });
  if (structured.length >= 1) return 2;
  if (perspectives.length && opp?.items?.length) return 1;
  return 0;
}

function scoreComparison(mode, materialText, userInput, result) {
  const cmp = result?.comparison || {};
  const hasCandidates = (cmp.candidates || cmp.options || []).length >= 2
    || (cmp.dimensions || []).length >= 1
    || (cmp.trade_offs || []).length >= 1;
  if (mode === 'baseline') {
    return /案|選択|どちら|一方|他方|vs|versus/i.test(userInput) ? 1 : 0;
  }
  if (!hasCandidates && !cmp.scope_pairs?.length) return 0;
  const blob = norm(materialText);
  const cmpSec = result?.judgment?.['06_comparison'];
  const secText = [cmpSec?.summary || '', ...(cmpSec?.items || [])].join('\n');
  if (tokenOverlap(blob, secText) >= 0.2 || (cmp.dimensions || []).length >= 2) return 2;
  if (hasCandidates) return 1;
  return 0;
}

function scoreContradiction(mode, userInput, result) {
  const conflicts = packetOf(result).conflicts || [];
  const userHas = conflicts.length > 0 || /矛盾|ぶつか|一方.*一方|急ぎ.*慎重/i.test(userInput);
  if (!userHas) return mode === 'astera' && conflicts.length ? 1 : 0;
  if (mode === 'baseline') return conflicts.length ? 1 : 0;
  const kept = conflicts.length > 0
    || (result?.judgment?.['02_premise']?.items || []).some((i) => /conflict|blocking/i.test(String(i)));
  return kept ? 2 : 0;
}

function scoreFalseCertainty(mode, result) {
  const records = claimRecords(result);
  if (mode === 'baseline') return 2;
  if (!records.length) return 1;
  const falseConf = records.filter((r) => {
    const st = r?.confirmation?.status || r?.status;
    return st === ClaimStatus.CONFIRMED && !claimProvenanceClass(r, result).valid;
  });
  if (falseConf.length) return 0;
  const und = records.some((r) => (r?.confirmation?.status || r?.status) === ClaimStatus.UNDETERMINED);
  return und ? 2 : 1;
}

function scoreEvidenceNeed(mode, materialText, result) {
  const tasks = packetOf(result).tasks || [];
  const needsPlan = tasks.some((t) => {
    const need = t.evidence_need;
    const hasNeed = Array.isArray(need) ? need.length > 0 : (need && typeof need === 'object' && Object.keys(need).length > 0);
    const plan = t.canonical_plan?.search_plan?.queries || t.search_plan?.queries || [];
    return hasNeed || plan.length > 0;
  });
  if (mode === 'baseline') return 0;
  if (!needsPlan) return tasks.some((t) => t.evidence_need?.required) ? 0 : 1;
  const bindings = collectBindings(result);
  const linked = bindings.some((b) => b.relation === CandidateRelation.SUPPORTS);
  const evSec = result?.judgment?.['07_evidence_status'];
  const evText = [evSec?.summary || '', ...(evSec?.items || [])].join('\n');
  if (linked && tokenOverlap(materialText, evText) >= 0.12) return 2;
  if (needsPlan) return 1;
  return 0;
}

function scoreTaskDecomposition(mode, userInput, result) {
  const taskCount = packetOf(result).tasks?.length ?? 0;
  const waves = packetOf(result).execution_waves || [];
  const multiStep = waves.length > 1
    || (packetOf(result).dependencies || []).length > 0
    || userInput.length > 100
    || (packetOf(result).tasks || []).length > 1;
  if (mode === 'baseline') return multiStep ? 0 : 1;
  if (taskCount >= 2 && multiStep) return 2;
  if (taskCount >= 1) return 1;
  return 0;
}

function scoreConditionException(mode, userInput, context, result) {
  return scoreConstraints(mode, '', userInput, context, result);
}

function scoreAiStructure(mode, materialText, result) {
  if (mode === 'baseline') return 0;
  const text = String(materialText || '');
  if (/\n---\n/.test(text) || /0[1-8]_(purpose|premise|facts|crisis|opposition|comparison|evidence|reinstruction)/i.test(text)) {
    return 0;
  }
  const j = result?.judgment || {};
  const keys = j.order || Object.keys(j).filter((k) => k.startsWith('0'));
  const sections = keys.filter((k) => j[k] && (j[k].summary || (j[k].items || []).length));
  const dims = [
    scorePurpose(mode, text, '', result) > 0,
    scoreConstraints(mode, text, '', '', result) > 0,
    claimRecords(result).length > 0 || scoreKnownUnknown(mode, text, result) > 0,
    scoreRisk(mode, text, '', result) > 0 || scoreComparison(mode, text, '', result) > 0,
    scoreEvidenceNeed(mode, text, result) > 0
  ];
  const covered = dims.filter(Boolean).length;
  if (sections.length >= 4 && covered >= 3) return 2;
  if (sections.length >= 2 && covered >= 2) return 1;
  return text.length > 180 ? 1 : 0;
}

function collectBindings(result) {
  const out = [];
  for (const rec of claimRecords(result)) {
    for (const b of rec?.confirmation?.bindings || rec?.bindings || []) out.push(b);
  }
  for (const tr of result?.task_results || []) {
    for (const rec of tr?.canonical_claims?.records || []) {
      for (const b of rec?.confirmation?.bindings || rec?.bindings || []) out.push(b);
    }
  }
  return out;
}

function userSourceText(userInput, context) {
  return norm(`${userInput}\n${context || ''}`);
}

function claimProvenanceClass(record, result) {
  const claim = record?.claim || record;
  const claimId = claim?.claim_id || record?.claim_id;
  const status = record?.confirmation?.status || record?.status;
  const spanText = claim?.source_span?.text
    || claim?.fragment?.normalized_fragment
    || claim?.raw_text
    || '';
  const user = userSourceText(result?._effect_user_input || '', result?._effect_context || '');

  const bindings = [
    ...(record?.confirmation?.bindings || []),
    ...(record?.bindings || [])
  ];
  const supports = bindings.filter((b) => b.relation === CandidateRelation.SUPPORTS);

  if (spanText && tokenOverlap(user, spanText) >= 0.35) {
    return { class: 'USER_SOURCE', valid: true, claim_id: claimId };
  }
  if (claim?.claim_origin === ClaimOrigin.DIRECT_ASSERTION && spanText && tokenOverlap(user, spanText) >= 0.25) {
    return { class: 'USER_SOURCE', valid: true, claim_id: claimId };
  }
  const external = supports.filter((b) => b.evidence_source === EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE);
  if (external.length && status === ClaimStatus.CONFIRMED) {
    return { class: 'EXTERNAL_EVIDENCE', valid: true, claim_id: claimId };
  }
  const local = supports.filter((b) => b.evidence_source === EvidenceSource.LOCAL_INPUT_EVIDENCE);
  if (local.length && [
    ClaimOrigin.ATTRIBUTED_ASSERTION,
    ClaimOrigin.CODE_STRUCTURE,
    ClaimOrigin.LOG_OBSERVATION,
    ClaimOrigin.TABLE_OBSERVATION
  ].includes(claim?.claim_origin)) {
    return { class: 'USER_SOURCE', valid: true, claim_id: claimId };
  }
  if (supports.length && record?.confirmation?.gates && Object.values(record.confirmation.gates).every(Boolean)) {
    return { class: 'DERIVED', valid: true, claim_id: claimId };
  }
  if (status === ClaimStatus.UNDETERMINED) {
    return { class: 'UNDETERMINED', valid: true, claim_id: claimId };
  }
  if (status === ClaimStatus.CONFIRMED) {
    return { class: 'UNDETERMINED', valid: false, claim_id: claimId };
  }
  return { class: 'UNDETERMINED', valid: true, claim_id: claimId };
}

function scoreRubric15(materialText, { userInput = '', context = '', result = null, mode = 'baseline' } = {}) {
  const scores = {};
  scores.R01_purpose_clear = scorePurpose(mode, materialText, userInput, result);
  scores.R02_premise_constraints = scoreConstraints(mode, materialText, userInput, context, result);
  scores.R03_known_vs_unknown = scoreKnownUnknown(mode, materialText, result);
  scores.R04_gaps_explicit = scoreGaps(mode, result);
  scores.R05_risk_discovery = scoreRisk(mode, materialText, userInput, result);
  scores.R06_counter_view = scoreCounterView(mode, materialText, userInput, result);
  scores.R07_comparison_axis = scoreComparison(mode, materialText, userInput, result);
  scores.R08_contradiction_kept = scoreContradiction(mode, userInput, result);
  scores.R09_no_false_certainty = scoreFalseCertainty(mode, result);
  scores.R10_evidence_need = scoreEvidenceNeed(mode, materialText, result);
  scores.R11_task_decomposition = scoreTaskDecomposition(mode, userInput, result);
  scores.R12_condition_exception = scoreConditionException(mode, userInput, context, result);
  scores.R13_ai_usable_structure = scoreAiStructure(mode, materialText, result);
  scores.R14_no_hallucination = 2;
  if (mode === 'astera' && result) {
    scores.R15_no_final_decision = normativeViolation(result) ? 0 : 2;
  } else {
    scores.R15_no_final_decision = 2;
  }
  return scores;
}

/** Diagnostic only — must not drive rubric score or violation counts. */
function detectFinalDecisionKeywordDiagnostic(materialText) {
  return /winner|採用案|勝者|recommended|you should choose|A案採用|ranking/i.test(String(materialText || ''));
}

function totalScore(scores) {
  return RUBRIC.reduce((sum, r) => sum + (scores[r.id] ?? 0), 0);
}

function deltaScores(baseline, astera) {
  const delta = {};
  for (const r of RUBRIC) {
    delta[r.id] = (astera[r.id] ?? 0) - (baseline[r.id] ?? 0);
  }
  return delta;
}

function linesNotInBaseline(baselineText, asteraText) {
  const baseSet = new Set(
    norm(baselineText).split(/[\n。]/).map((l) => l.trim()).filter((l) => l.length >= 8)
  );
  return unique(
    String(asteraText || '').split(/[\n。]/).map((l) => l.trim()).filter((l) => l.length >= 10 && !baseSet.has(norm(l)))
  ).slice(0, 24);
}

function categorizeAdded(lines, result) {
  const added = {
    new_premises: [],
    new_risks: [],
    new_counter: [],
    new_uncertain: [],
    new_comparison_axes: [],
    new_evidence_needs: [],
    reinstruction_improvements: []
  };
  for (const line of lines) {
    if (/premise|constraint|prohibition|preserve|維持|禁止/i.test(line)) added.new_premises.push(line);
    else if (/failure|crisis|risk|失敗|危/i.test(line)) added.new_risks.push(line);
    else if (/perspective|trade-off|opposition|対立/i.test(line)) added.new_counter.push(line);
    else if (/undetermined|UNRESOLVED|missing|未確定/i.test(line)) added.new_uncertain.push(line);
    else if (/candidate|dimension|trade.?off|compare|軸/i.test(line)) added.new_comparison_axes.push(line);
    else if (/search|binding|query|根拠|evidence/i.test(line)) added.new_evidence_needs.push(line);
    else if (/reinstruction|wave|preserve|prohibition/i.test(line)) added.reinstruction_improvements.push(line);
  }
  const tasks = result?.analysis_task_packet?.tasks || [];
  for (const t of tasks) {
    const needField = t.evidence_need;
    const needItems = Array.isArray(needField)
      ? needField
      : (needField && typeof needField === 'object' ? [needField] : []);
    for (const need of needItems) {
      const s = typeof need === 'string' ? need : JSON.stringify(need);
      if (s && !added.new_evidence_needs.includes(s)) added.new_evidence_needs.push(s);
    }
  }
  return added;
}

function detectHallucination(userInput, context, asteraText, result = null) {
  const provenance_breaks = [];
  const claim_ids = [];
  if (result?.type === 'cognitive_map') {
    result._effect_user_input = userInput;
    result._effect_context = context;
    for (const rec of claimRecords(result)) {
      const claim = rec?.claim || rec;
      const st = rec?.confirmation?.status || rec?.status;
      const prov = claimProvenanceClass(rec, result);
      if (st === ClaimStatus.CONFIRMED && !prov.valid) {
        provenance_breaks.push({ claim_id: prov.claim_id, reason: 'confirmed_without_provenance' });
        if (prov.claim_id) claim_ids.push(prov.claim_id);
      }
    }
  }
  const regexDiagnostic = (() => {
    const source = norm(`${userInput}\n${context || ''}`);
    const nums = [...String(asteraText || '').matchAll(/\b(20\d{2}|19\d{2})\b/g)].map((m) => m[1]);
    for (const y of nums) {
      if (!source.includes(y)) return true;
    }
    const orgHits = [...String(asteraText || '').matchAll(/株式会社[^\s、。]{2,12}/g)].map((m) => m[0]);
    for (const org of orgHits) {
      if (!source.includes(org.slice(0, 4))) return true;
    }
    return false;
  })();

  const violated = provenance_breaks.length > 0 || regexDiagnostic;
  return { violated, claim_ids: unique(claim_ids), provenance_breaks, regex_diagnostic: regexDiagnostic };
}

function detectConstraintLoss(userInput, asteraText, result, context = '') {
  const packet = packetOf(result);
  const { entries } = constraintEntries(packet, userInput, context);
  if (entries.length) {
    const blob = constraintMaterialBlob(asteraText, result);
    let lost = 0;
    for (const e of entries) {
      const key = norm(e.text).slice(0, 16);
      if (key.length < 3) continue;
      const ok = tokenOverlap(blob, e.text) >= 0.18
        || (e.span?.text && tokenOverlap(blob, e.span.text) >= 0.18);
      if (!ok) lost += 1;
    }
    return lost >= Math.ceil(entries.length / 2);
  }
  const phrases = extractConstraintPhrasesLegacy(userInput);
  if (!phrases.length) return false;
  const blob = constraintMaterialBlob(asteraText, result);
  let lost = 0;
  for (const p of phrases) {
    const key = norm(p).slice(0, 10);
    if (key.length >= 4 && tokenOverlap(blob, p) < 0.15) lost += 1;
  }
  return lost >= Math.ceil(phrases.length / 2);
}

function extractConstraintPhrasesLegacy(userText) {
  const text = String(userText || '');
  const out = [];
  const patterns = [
    /(?:しない|禁止|変えない|止めたくない|譲れない|条件)/gu,
    /(?:予算|納期|期限|来週|金曜|10%)/gu,
    /(?:急ぎ|慎重)/gu
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const start = Math.max(0, m.index - 20);
      const snippet = text.slice(start, Math.min(text.length, m.index + 30));
      out.push(snippet.trim());
    }
  }
  return unique(out);
}

function hasFalseConfirmation(result) {
  const records = claimRecords(result);
  const evidenceStarted = result?.evidence_processing_started === true;
  const hasEvidence = (result?.task_results || []).some(
    (tr) => tr?.evidence?.source_status === 'FINAL_VALID'
  );
  if (!evidenceStarted && !hasEvidence) {
    return records.some((r) => (r?.confirmation?.status || r?.status) === ClaimStatus.CONFIRMED);
  }
  for (const rec of records) {
    const st = rec?.confirmation?.status || rec?.status;
    if (st !== ClaimStatus.CONFIRMED) continue;
    const prov = claimProvenanceClass(rec, result);
    if (!prov.valid && prov.class !== 'EXTERNAL_EVIDENCE') return true;
  }
  return false;
}

function hasUnsupportedConfirmedFactualClaim(result) {
  const tasks = packetOf(result).tasks || [];
  const needsEvidence = tasks.some((t) => {
    const need = t.evidence_need;
    if (Array.isArray(need)) return need.length > 0;
    return need?.required === true || (need && typeof need === 'object' && Object.keys(need).length > 0);
  });
  if (!needsEvidence) return false;
  for (const rec of claimRecords(result)) {
    const st = rec?.confirmation?.status || rec?.status;
    if (st !== ClaimStatus.CONFIRMED) continue;
    const bindings = rec?.confirmation?.bindings || rec?.bindings || [];
    const external = bindings.filter(
      (b) => b.relation === CandidateRelation.SUPPORTS
        && b.evidence_source === EvidenceSource.EXTERNAL_RETRIEVED_EVIDENCE
    );
    if (!external.length) return true;
  }
  return false;
}

function normativeViolation(result) {
  if (!result || result.type !== 'cognitive_map') return null;
  if (result.decision_authority !== 'EXTERNAL_ONLY') return 'decision_authority';
  if (result.no_normative_decision_generated !== true) return 'normative_decision';
  if (result.comparison?.selected_candidate != null) return 'selected_candidate';
  if (Array.isArray(result.comparison?.candidate_ranking) && result.comparison.candidate_ranking.length > 0) {
    return 'candidate_ranking';
  }
  const text = JSON.stringify(result.judgment || {});
  if (/\b(winner|採用案|勝者|A案採用|B案が優れ)\b/i.test(text)) return 'winner_language';
  return null;
}

function detectUncertaintyLoss(userInput, result) {
  const packet = packetOf(result);
  const needsUnc = (packet.unresolved || []).length > 0
    || (packet.conflicts || []).length > 0
    || /矛盾|漠然|薄い|全部見れ|ログはまだ|未選定|未確認/i.test(userInput);
  if (!needsUnc || !result) return false;
  const und = (result.canonical_claims?.undetermined_count ?? 0) > 0
    || (packet.unresolved || []).length > 0;
  const allConfirmed = claimRecords(result).length > 0
    && (result.canonical_claims?.undetermined_count ?? 0) === 0
    && (packet.unresolved || []).length === 0;
  return needsUnc && allConfirmed && result.type === 'cognitive_map';
}

function needsTaskDecomposition(userInput, result) {
  const packet = packetOf(result);
  return (packet.execution_waves || []).length > 1
    || (packet.dependencies || []).length > 0
    || (packet.tasks || []).length > 1
    || userInput.length > 120;
}

function evaluateStory(story, out) {
  const userInput = story.user_input;
  const context = story.context || '';
  const baselineText = baselineMaterial(story);
  const asteraText = asteraMaterialText(out);
  const result = out?.result || {};
  if (result && typeof result === 'object') {
    result._effect_user_input = userInput;
    result._effect_context = context;
  }

  const baselineScores = scoreRubric15(baselineText, { userInput, context, mode: 'baseline' });
  const asteraScores = scoreRubric15(asteraText, { userInput, context, result, mode: 'astera' });
  const delta = deltaScores(baselineScores, asteraScores);

  const baselineTotal = totalScore(baselineScores);
  const asteraTotal = totalScore(asteraScores);
  const improvementDelta = asteraTotal - baselineTotal;

  const addedLines = linesNotInBaseline(baselineText, asteraText);
  const added_value = categorizeAdded(addedLines, result);

  const hall = detectHallucination(userInput, context, asteraText, result);
  const hallucination = hall.violated;
  const constraint_loss = detectConstraintLoss(userInput, asteraText, result, context);
  const false_confirmation = hasFalseConfirmation(result);
  const unsupported_confirmed = hasUnsupportedConfirmedFactualClaim(result);
  const final_decision = normativeViolation(result);
  const final_decision_keyword_diagnostic = detectFinalDecisionKeywordDiagnostic(asteraText);
  const task_decomposition_failure = result.type === 'cognitive_map'
    && needsTaskDecomposition(userInput, result)
    && (packetOf(result).tasks?.length ?? 0) === 0;
  const uncertainty_loss = detectUncertaintyLoss(userInput, result);

  if (hallucination) asteraScores.R14_no_hallucination = 0;
  if (false_confirmation || (hall.provenance_breaks.length && hall.provenance_breaks.some((p) => p.reason === 'confirmed_without_provenance'))) {
    asteraScores.R09_no_false_certainty = 0;
  }
  if (final_decision) asteraScores.R15_no_final_decision = 0;

  const asteraTotalAdj = totalScore(asteraScores);
  const improvementDeltaAdj = asteraTotalAdj - baselineTotal;

  const critical = Boolean(
    hallucination
    || constraint_loss
    || false_confirmation
    || unsupported_confirmed
    || final_decision
    || uncertainty_loss
    || task_decomposition_failure
  );

  let storyOutcome = 'unchanged';
  if (critical) storyOutcome = 'degraded';
  else if (improvementDeltaAdj > 0) storyOutcome = 'improved';
  else if (improvementDeltaAdj < 0) storyOutcome = 'degraded';

  return {
    baseline_scores: baselineScores,
    astera_scores: asteraScores,
    delta,
    BASELINE_TOTAL: baselineTotal,
    ASTERA_TOTAL: asteraTotalAdj,
    IMPROVEMENT_DELTA: improvementDeltaAdj,
    story_outcome: storyOutcome,
    added_value,
    violations: {
      hallucination,
      constraint_loss,
      false_confirmation,
      unsupported_confirmed,
      final_decision_violation: final_decision,
      final_decision_keyword_diagnostic,
      task_decomposition_failure,
      uncertainty_loss,
      hallucination_detail: hall
    },
    baseline_text_excerpt: baselineText.slice(0, 400),
    astera_text_excerpt: asteraText.slice(0, 800)
  };
}

module.exports = {
  RUBRIC,
  baselineMaterial,
  asteraMaterialText,
  scoreRubric15,
  evaluateStory,
  totalScore,
  tokenOverlap,
  normativeViolation,
  detectFinalDecisionKeywordDiagnostic,
  detectHallucination,
  claimProvenanceClass
};
