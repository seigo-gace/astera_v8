'use strict';

const { expandMultiJudgmentRequest } = require('./multi-judgment-request-planner');

const MATERIAL_TENSION = /NO_EXECUTABLE_ACTION|PARSER_ACTION_GUARD_BLOCKED|parser_task_graph_empty/i;
const EXTERNAL_EVIDENCE_CUE = /(?:検証|事実確認|ファクトチェック|裏取り|調査|リサーチ|根拠|出典|公式(?:根拠|情報|Source)?|verify|validate|fact\s*check|research|investigate|evidence|source)/iu;

function norm(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').trim();
}

function unique(values = []) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function sentenceSpans(text) {
  const source = String(text || '');
  const spans = [];
  const re = /[^。！？!?\n]+(?:[。！？!?]|$)/gu;
  for (const match of source.matchAll(re)) {
    const raw = match[0];
    const left = raw.length - raw.trimStart().length;
    const right = raw.length - raw.trimEnd().length;
    const start = Number(match.index || 0) + left;
    const end = Number(match.index || 0) + raw.length - right;
    if (end > start) spans.push({ start, end, text: source.slice(start, end) });
  }
  return spans;
}

function taskUnionCoverage(tasks, length) {
  if (!length || !tasks.length) return 0;
  const intervals = tasks.map((task) => {
    const start = Math.max(0, Math.min(length, Number(task?.source_span?.start)));
    const end = Math.max(0, Math.min(length, Number(task?.source_span?.end)));
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
  }).filter(Boolean).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!intervals.length) return 0;
  let covered = 0;
  let [start, end] = intervals[0];
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else { covered += end - start; start = nextStart; end = nextEnd; }
  }
  covered += end - start;
  return Math.max(0, Math.min(1, covered / length));
}

function inlineCandidates(text) {
  const labels = [];
  const value = norm(text);
  for (const match of value.matchAll(/([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案)と([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案)(?=を|で|について|の|、|,|。|\s)/gu)) labels.push(match[1], match[2]);
  for (const match of value.matchAll(/(?:^|[、,。\s])([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,24}案)(?=は|が|を|と|、|,|。|\s)/gu)) labels.push(match[1]);
  const deduped = unique(labels);
  return deduped.filter((label) => {
    const composite = /^(.+案)と(.+案)$/u.exec(label);
    return !composite || !(deduped.includes(composite[1]) && deduped.includes(composite[2]));
  });
}

function comparisonDimensions(text) {
  const value = norm(text);
  const out = [];
  const match = /[A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案と[A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案を([^。！？\n]{2,160}?)で(?:比較|比べ)/u.exec(value)
    || /比較軸(?:は|:|=)\s*([^。！？\n]{2,160})/u.exec(value);
  if (match?.[1]) {
    for (const part of match[1].split(/\s*(?:と|、|,|・|\/|／)\s*/u)) {
      const item = norm(part);
      if (item) out.push(item);
    }
  }
  return unique(out);
}

function claimTexts(text) {
  const out = [];
  for (const span of sentenceSpans(text)) {
    const value = norm(span.text);
    if (/\d+(?:\.\d+)?\s*(?:件|人|回|日|時間|分|秒|円|万円|台|個|社|本|枚|%|％)/u.test(value)
      || /(?:未確認|未完了|未成立|終わっていない|完了していない|確認していない)/u.test(value)) out.push(value);
  }
  return unique(out);
}

function contracts(text) {
  const result = { premises: [], constraints: [], prohibitions: [], preserve: [], deadlines: [], unresolved: [], conditions: [], exceptions: [] };
  for (const span of sentenceSpans(text)) {
    const value = norm(span.text);
    if (!value) continue;
    if (/(?:期限|締切|納期|までに|今日中|明日まで|今週中|来週|来月|deadline|due\s+date|\bby\s+\w+)/iu.test(value)) result.deadlines.push(value);
    if (/(?:変えない|変えず|変更しない|変更せず|維持|保持|残す|keep|preserve|retain|without\s+changing)/iu.test(value)) result.preserve.push(value);
    if (/(?:最終判断|最終結論|推奨|採用|選定)[^。！？!?]{0,80}(?:しない|しないで|禁止|せず|出さない)|(?:must\s+not|do\s+not|never)\b/iu.test(value)) result.prohibitions.push(value);
    if (/(?:未確認|未完了|未成立|終わっていない|完了していない|確認していない|not\s+yet|pending|incomplete)/iu.test(value)) { result.premises.push(value); result.unresolved.push(value); }
    if (/(?:場合|なら|ならば|if\b|when\b|provided\s+that)/iu.test(value)) result.conditions.push(value);
    if (/(?:ただし|例外|except\b|however\b)/iu.test(value)) result.exceptions.push(value);
  }
  result.constraints.push(...result.deadlines);
  for (const key of Object.keys(result)) result[key] = unique(result[key]);
  return result;
}

function purposeFromInput(text, fallback) {
  const spans = sentenceSpans(text);
  const material = spans.find((span) => /(?:判断材料|decision\s+material)/iu.test(span.text)
    && !/(?:最終判断|最終結論).*(?:しない|禁止|出さない)/u.test(span.text));
  if (material) return norm(material.text).replace(/[。！？!?]+$/u, '');
  return fallback;
}

function comparisonSpan(text, candidates) {
  return sentenceSpans(text).find((span) => /(?:比較|比べ|compare|versus|\bvs\.?\b)/iu.test(span.text)
    && candidates.filter((candidate) => span.text.includes(candidate)).length >= 2) || null;
}

function nextTaskId(tasks) {
  let max = 0;
  for (const task of tasks) {
    const match = /^T(\d+)$/i.exec(String(task?.id || ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `T${String(max + 1).padStart(2, '0')}`;
}

function shouldRecover(prepared, question, candidates, claims) {
  const packet = prepared?.analysis_task_packet || {};
  const tasks = Array.isArray(packet.tasks) ? packet.tasks : [];
  if (!question || tasks.length === 0) return false;
  const coverage = taskUnionCoverage(tasks, question.length);
  if (coverage >= 0.75) return false;
  const markers = [...(packet.hard_blockers || []), ...(packet.unresolved || []), ...(prepared?.instruction_understanding?.blocked_reasons || [])].map(String);
  const partial = String(prepared?.instruction_understanding?.overall_status || '').toUpperCase() === 'PARTIAL' || markers.some((value) => MATERIAL_TENSION.test(value));
  return partial && (candidates.length >= 2 || claims.length >= 2);
}

function externalEvidenceRequested(text) {
  return EXTERNAL_EVIDENCE_CUE.test(norm(text));
}

function recoverPartialParserMaterial(prepared, input = {}) {
  if (!prepared?.analysis_task_packet) return prepared;
  const question = String(input.question ?? prepared.original_question ?? prepared.normalized_question ?? '');
  const candidates = inlineCandidates(question);
  const claims = claimTexts(question);
  if (!shouldRecover(prepared, question, candidates, claims)) {
    return expandMultiJudgmentRequest(prepared, input);
  }

  const packet = prepared.analysis_task_packet;
  const originalTasks = Array.isArray(packet.tasks) ? packet.tasks : [];
  const coverage = taskUnionCoverage(originalTasks, question.length);
  const dims = comparisonDimensions(question);
  const terms = contracts(question);
  const fallbackPurpose = packet.user_goal || prepared.objective || '入力内容を判断材料として整理する';
  const purpose = purposeFromInput(question, fallbackPurpose);
  const source = comparisonSpan(question, candidates) || { start: 0, end: question.length, text: question };
  const id = nextTaskId(originalTasks);
  const needsExternalEvidence = claims.length > 0 && externalEvidenceRequested(question);
  const observableCandidates = unique([...(packet.observable_material?.candidates || []), ...candidates]).filter((label) => {
    const composite = /^(.+案)と(.+案)$/u.exec(label);
    return !composite || !(candidates.includes(composite[1]) && candidates.includes(composite[2]));
  });
  const observableClaims = unique([...(packet.observable_material?.claim_texts || []), ...claims]);
  const observable = {
    ...(packet.observable_material || prepared.observable_material || {}),
    source: 'ORIGINAL_QUESTION',
    candidates: observableCandidates,
    candidate_count: observableCandidates.length,
    claim_texts: observableClaims,
    claim_count: observableClaims.length,
    dimensions: unique([...(packet.observable_material?.dimensions || []), ...dims])
  };
  const task = {
    id,
    order: 1,
    action: candidates.length >= 2 ? 'compare' : 'analyze',
    target: candidates.length >= 2 ? candidates.join(' / ') : '入力内容',
    objective: purpose,
    purpose,
    user_goal: purpose,
    material_only: true,
    observable_material: observable,
    source_span: source,
    raw_text: question,
    source_role: 'DIRECT_INPUT',
    source_axes: { container_role: ['PLAIN_CONTAINER'], content_role: ['OBSERVABLE_MATERIAL'], quotation_role: ['DIRECT'] },
    actionable: true,
    premises: unique([...claims, ...terms.premises]),
    constraints: terms.constraints,
    prohibitions: terms.prohibitions,
    preserve: terms.preserve,
    replace: [], verification: [], completion_criteria: [], success_criteria: [],
    conditions: terms.conditions, exceptions: terms.exceptions, deadlines: terms.deadlines,
    priority_records: [], deliverables: [], unresolved: terms.unresolved, hard_blockers: [], depends_on: [], branches: [],
    conditional_branch: null, execution_gate: 'ALWAYS', parallel_group: null, supersedes: [], superseded_by: [],
    evidence_need: {
      required: needsExternalEvidence,
      queries: needsExternalEvidence ? claims : [],
      reasons: needsExternalEvidence ? ['EXPLICIT_EXTERNAL_EVIDENCE_REQUEST'] : []
    },
    field_provenance: { purpose: [{ source: 'ORIGINAL_QUESTION_PURPOSE' }], target: [{ source: 'ORIGINAL_QUESTION_CANDIDATES' }], parser_projection_recovery: [{ source: 'ASTERA_PARTIAL_PROJECTION_RECOVERY' }] }
  };
  const recovery = {
    applied: true,
    replaced_partial_projection: true,
    task_union_coverage_ratio: coverage,
    original_task_ids: originalTasks.map((item) => item.id),
    recovered_task_id: id,
    external_evidence_requested: needsExternalEvidence
  };
  const recovered = {
    ...prepared,
    target: task.target,
    objective: purpose,
    user_goal: purpose,
    observable_material: observable,
    standalone_api_intent: { ...(prepared.standalone_api_intent || packet.analysis_intent || {}), mode: candidates.length >= 2 ? 'compare' : 'analyze', purpose },
    instruction_understanding: { ...(prepared.instruction_understanding || {}), parser_projection_recovery: recovery },
    analysis_task_packet: {
      ...packet,
      tasks: [task],
      dependencies: [],
      execution_waves: [[id]],
      branches: [], branch_groups: [], supersession_relations: [], reference_resolutions: [],
      user_goal: purpose,
      observable_material: observable,
      constraints: unique([...(packet.constraints || []), ...terms.constraints]),
      prohibitions: unique([...(packet.prohibitions || []), ...terms.prohibitions]),
      preserve: unique([...(packet.preserve || []), ...terms.preserve]),
      deadlines: unique([...(packet.deadlines || []), ...terms.deadlines]),
      conditions: unique([...(packet.conditions || []), ...terms.conditions]),
      exceptions: unique([...(packet.exceptions || []), ...terms.exceptions]),
      unresolved: unique([...(packet.unresolved || []), ...terms.unresolved]),
      conflicts: [...(packet.conflicts || []), { type: 'PARSER_PROJECTION_COVERAGE_RECOVERED', note: `Parser task projection covered ${(coverage * 100).toFixed(1)}% of the input; Astera recovered full-input material scope.` }],
      source_spans: [{ task_id: id, ...source }],
      parser_projection_recovery: recovery,
      task_graph_validation: { ...(packet.task_graph_validation || {}), valid: true, cycle: [], dependency_count: 0, wave_count: 1, branch_count: 0, reference_resolution_count: 0 }
    }
  };
  return expandMultiJudgmentRequest(recovered, input);
}

module.exports = { recoverPartialParserMaterial, taskUnionCoverage, inlineCandidates, comparisonDimensions, contracts, externalEvidenceRequested };