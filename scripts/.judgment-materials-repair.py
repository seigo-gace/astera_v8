from pathlib import Path
import re
import textwrap


def read(path):
    return Path(path).read_text()


def write(path, text):
    Path(path).write_text(text)


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, got {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label):
    new, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one regex match, got {count}")
    return new


# AST-M02: Task Decomposition semantics, prohibitions, context, English word boundaries.
path = "src/deterministic-task-decomposer.js"
text = read(path)
text = replace_once(
    text,
    "const genericTarget = (value) => !value || /^(?:入力対象|input target|対象|target|これ|それ|あれ|これら|それら)$/iu.test(norm(value));",
    "const genericTarget = (value) => !value || /^(?:入力対象|input target|対象|target|これ|それ|あれ|これら|それら|this|that|it|these|those|them|same target)$/iu.test(norm(value));",
    "generic target pronouns",
)
text = regex_once(
    text,
    r"const ACTION_PATTERNS = Object\.freeze\(\[.*?\n\]\);\n\nconst GLOBAL_SCOPE_CUE",
    r"""const ACTION_PATTERNS = Object.freeze([
  ['verify', /検証|確認|監査|調査|分析|解析|評価|テスト|試験|\b(?:verify|verifies|verified|verifying|validate|validates|validated|validating|audit|audits|audited|auditing|investigate|investigates|investigated|investigating|analyze|analyzes|analyzed|analyzing|analyse|analyses|analysed|analysing|evaluate|evaluates|evaluated|evaluating|check|checks|checked|checking|test|tests|tested|testing)\b/i],
  ['compare', /比較|比べ|\b(?:compare|compares|compared|comparing|versus|vs)\b/i],
  ['decide', /判断|選定|選ぶ|決め|採用|\b(?:decide|decides|decided|deciding|select|selects|selected|selecting|choose|chooses|chose|chosen|choosing|adopt|adopts|adopted|adopting)\b/i],
  ['improve', /改善|改良|修正|直(?:す|せ|し)|最適化|強化|更新|\b(?:improve|improves|improved|improving|optimize|optimizes|optimized|optimizing|optimise|optimises|optimised|optimising|fix|fixes|fixed|fixing|refactor|refactors|refactored|refactoring|strengthen|strengthens|strengthened|strengthening|update|updates|updated|updating)\b/i],
  ['implement', /実装|作成|構築|開発|追加|\b(?:implement|implements|implemented|implementing|build|builds|built|building|create|creates|created|creating|develop|develops|developed|developing|add|adds|added|adding)\b/i],
  ['integrate', /統合|接続|連携|組み込|\b(?:integrate|integrates|integrated|integrating|connect|connects|connected|connecting|link|links|linked|linking|incorporate|incorporates|incorporated|incorporating)\b/i],
  ['migrate', /移行|切替|入れ替|\b(?:migrate|migrates|migrated|migrating|switch|switches|switched|switching)\b/i],
  ['remove', /削除|除去|外す|\b(?:remove|removes|removed|removing|delete|deletes|deleted|deleting|eliminate|eliminates|eliminated|eliminating)\b/i],
  ['preserve', /維持|保持|残す|壊さず|変えず|\b(?:keep|keeps|kept|keeping|preserve|preserves|preserved|preserving|retain|retains|retained|retaining)\b/i],
  ['explain', /説明|教え|解説|\b(?:explain|explains|explained|explaining|describe|describes|described|describing)\b|\btell\s+me\b/i]
]);

const GLOBAL_SCOPE_CUE""",
    "action patterns",
)
text = replace_once(
    text,
    "const REFERENCE_CUE = /(?:^|[\\s、,。])(?:これ|それ|あれ|これら|それら|上記|前述|同じ対象|前者|後者|両方|双方)(?:を|について|に|は|が|の|\\b)/i;",
    "const REFERENCE_CUE = /(?:^|[\\s、,。])(?:これ|それ|あれ|これら|それら|上記|前述|同じ対象|前者|後者|両方|双方|this|that|it|these|those|them|former|latter|both)(?:を|について|に|は|が|の|\\b)/i;\nconst PROHIBITION_CUE = /(?:禁止|するな|しないで|してはいけ|してはなら|勝手に|(?:変更|削除|更新|実装|移行|公開|判断|選定|採用|接続|統合|修正|置換)(?:は|を)?しない|(?:選ぶ|決める|比べる|外す|残す)な|\\bmust\\s+not\\b|\\bdo(?:es|id)?\\s+not\\b|\\bnever\\b|\\bshall\\s+not\\b|\\bshould\\s+not\\b)/i;\nconst PRESERVE_CUE = /(?:維持|保持|残す|壊さず|変えず|そのまま|\\bkeep\\b|\\bpreserve\\b|\\bretain\\b|\\bwithout\\s+changing\\b)/i;",
    "constraint cues",
)
text = regex_once(
    text,
    r"function contextBindings\(context\) \{.*?\n\}\n\nfunction deliverables",
    r"""function contextBindings(context) {
  const bindings = [];
  for (const span of splitWithSpans(context)) {
    const text = norm(span.text);
    if (!text) continue;
    const source = { source: 'context', source_span: { start: span.start, end: span.end, text: span.text } };
    let pushed = 0;
    const push = (kind) => { bindings.push({ kind, value: text, scope: 'UNRESOLVED', task_ids: [], ...source }); pushed += 1; };
    if (/前提|現状|現在|既存|対象は|given\b|assume|existing|currently|(?:予算|budget|期限|deadline|地域|jurisdiction|version|バージョン|環境|environment|対象|target)\s*(?:は|:|=)/i.test(text)) push('premise');
    if (PROHIBITION_CUE.test(text)) push('prohibition');
    if (PRESERVE_CUE.test(text)) push('preserve');
    if (/置換|差し替|変更対象|\breplace\b|\bswap\b/i.test(text) && !PROHIBITION_CUE.test(text)) push('replace');
    if (/必ず|のみ|限定|守る|変更せず|\bmust\b|\bonly\b|\bwithout\b/i.test(text)) push('constraint');
    if (/成功条件|合格条件|success criteria|acceptance criteria/i.test(text)) push('success');
    if (/完了条件|completion criteria|done when/i.test(text)) push('completion');
    if (/検証|確認|テスト|試験|\btest\b|\bverify\b|\bvalidate\b|\bassert\b|\bcheck\b/i.test(text)) push('verification');
    if (/(?:場合|とき|なら|ならば|であれば|を条件に|\bif\b|\bwhen\b|provided that|unless)/i.test(text)) push('condition');
    if (/(?:ただし|例外|除く|を除き|except|however|but only)/i.test(text)) push('exception');
    if (/(?:最優先|優先|先に|まず|priority|first|before)/i.test(text)) push('priority');
    if (!pushed) push('unresolved');
  }
  return bindings;
}

function deliverables""",
    "context bindings",
)
text = regex_once(
    text,
    r"function actionOccurrences\(text\) \{.*?\n\}\n\nfunction taskPurpose",
    r"""function isNegatedAction(text, item) {
  const value = String(text || '');
  const prefix = value.slice(Math.max(0, item.index - 48), item.index);
  const suffix = value.slice(item.end, Math.min(value.length, item.end + 32));
  if (/^[A-Za-z]/.test(item.match)) {
    if (/(?:\bdo(?:es|id)?\s+not|\bdon't|\bdoesn't|\bdidn't|\bmust\s+not|\bshall\s+not|\bshould\s+not|\bnever|\bnot\s+to)\s+(?:\w+\s+){0,3}$/i.test(prefix)) return true;
  }
  if (/^\s*(?:は|を|に|で|だけ)?\s*(?:しない|しません|するな|するなよ|しないで|してはいけない|してはならない|せず|しないこと|すべきではない|するべきではない|るな(?=[。！？!?\s]|$)|な(?=[。！？!?\s]|$))/u.test(suffix)) return true;
  return false;
}

function isDescriptiveEnglishAction(text, item) {
  if (!/^[A-Za-z]/.test(item.match)) return false;
  const value = String(text || '');
  const clauseStart = Math.max(value.lastIndexOf('.', item.index - 1), value.lastIndexOf('!', item.index - 1), value.lastIndexOf('?', item.index - 1), value.lastIndexOf(';', item.index - 1), -1) + 1;
  const prefix = value.slice(clauseStart, item.index).trim();
  if (!prefix) return false;
  if (/^(?:please|then|next|and then|kindly|now)\b/i.test(prefix)) return false;
  if (/(?:\bshould\b|\bmust\b|\bshall\b|\bneed(?:s)?\s+to\b|\bhas\s+to\b|\bhave\s+to\b|\bcan\s+you\b|\bcould\s+you\b|\bwould\s+you\b|\bplease\b)/i.test(prefix)) return false;
  return /(?:s|ed)$/i.test(item.match);
}

function actionOccurrences(text) {
  const found = [];
  const protectedDecisionRanges = decisionMaterialRanges(text);
  for (const [id, pattern] of ACTION_PATTERNS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    for (const match of String(text || '').matchAll(re)) {
      const item = { id, index: match.index, end: match.index + match[0].length, match: match[0] };
      if (id === 'decide' && protectedDecisionRanges.some((range) => item.index >= range.start && item.index < range.end)) continue;
      if (isNegatedAction(text, item)) continue;
      if (isDescriptiveEnglishAction(text, item)) continue;
      found.push(item);
    }
  }
  found.sort((a, b) => a.index - b.index || a.end - b.end || a.id.localeCompare(b.id));
  const dedup = [];
  for (const item of found) {
    const overlap = dedup.find((existing) => item.index < existing.end && item.end > existing.index);
    if (!overlap) dedup.push(item);
  }
  const nonPreserve = dedup.filter((item) => item.id !== 'preserve');
  const preferred = nonPreserve.length ? nonPreserve : dedup;
  return preferred.filter((item, index) => {
    const next = preferred[index + 1];
    if (!next) return true;
    const between = String(text || '').slice(item.end, next.index);
    if (/^\s*(?:完了後|終了後|完了|終了|済み|結果|内容|計画|手順|状態|対象|機能)/u.test(between)) return false;
    return !/^\s*(?:(?:結果|内容|計画|手順|状態|対象|機能)\s*)?(?:を|の|に|が|は|で)\s*/u.test(between);
  });
}

function taskPurpose""",
    "action relevance",
)
text = regex_once(
    text,
    r"function referenceKind\(text\) \{.*?\n\}\n\nfunction resolveReferences",
    r"""function referenceKind(text) {
  if (/(?:これら|それら|両方|双方|前二つ|前2つ|\bthese\b|\bthose\b|\bthem\b|\bboth\b)/i.test(text)) return 'PLURAL_PREVIOUS';
  if (/(?:前者|\bformer\b)/i.test(text)) return 'FORMER';
  if (/(?:後者|\blatter\b)/i.test(text)) return 'LATTER';
  if (/(?:これ|それ|あれ|上記|前述|同じ対象|\bthis\b|\bthat\b|\bit\b|\bsame target\b)/i.test(text)) return 'PREVIOUS';
  return null;
}

function resolveReferences""",
    "reference kinds",
)
text = replace_once(
    text,
    "      const source = { source: 'context', source_span: binding.source_span, scope: binding.scope, value: binding.value };",
    "      const source = { source: binding.source || 'context', source_span: binding.source_span, scope: binding.scope, value: binding.value };",
    "binding source",
)
text = replace_once(
    text,
    "      if (binding.kind === 'priority') { task.priority = 'high'; appendSource(task.field_sources, 'priority', source); }",
    "      if (binding.kind === 'priority') { task.priority = 'high'; appendSource(task.field_sources, 'priority', source); }\n      if (binding.kind === 'unresolved') { task.unresolved = unique([...(task.unresolved || []), `context_semantics:${binding.source_span.start}-${binding.source_span.end}`]); appendSource(task.field_sources, 'unresolved', source); }",
    "unresolved context",
)
text = replace_once(
    text,
    "  const sourceRegions = regions(question);\n  const packet = request.analysis_task_packet;\n  const kept = (packet.tasks || []).filter((task) => isolatedRole(task.source_span || { start: 0, end: 0 }, sourceRegions) === 'DIRECT_INPUT');\n  const removed = (packet.tasks || []).filter((task) => !kept.includes(task));\n\n  const collapsedPrefixes = collapseDependencyPrefixes(kept, question);",
    "  const sourceRegions = regions(question);\n  const packet = request.analysis_task_packet;\n  const direct = (packet.tasks || []).filter((task) => isolatedRole(task.source_span || { start: 0, end: 0 }, sourceRegions) === 'DIRECT_INPUT');\n  const constraintOnly = direct.filter((task) => {\n    const raw = norm(task.raw_text || task.source_span?.text || '');\n    return actionOccurrences(raw).length === 0 && (PROHIBITION_CUE.test(raw) || PRESERVE_CUE.test(raw));\n  });\n  const kept = direct.filter((task) => !constraintOnly.includes(task));\n  const removed = (packet.tasks || []).filter((task) => !direct.includes(task));\n\n  const collapsedPrefixes = collapseDependencyPrefixes(kept, question);",
    "constraint task separation",
)
text = replace_once(
    text,
    "  const references = resolveReferences(tasks);\n  const scopedContext = scopeContextBindings(contextBindings(context), tasks);\n  const contextUnresolved = applyContextBindings(tasks, scopedContext);",
    "  const references = resolveReferences(tasks);\n  const questionConstraintBindings = constraintOnly.flatMap((task) => {\n    const raw = norm(task.raw_text || task.source_span?.text || '');\n    const base = { value: raw, source: 'question_constraint', source_span: task.source_span, scope: tasks.length === 1 ? 'TASK' : 'GLOBAL', task_ids: tasks.map((item) => item.id) };\n    const out = [];\n    if (PROHIBITION_CUE.test(raw)) out.push({ ...base, kind: 'prohibition' });\n    if (PRESERVE_CUE.test(raw)) out.push({ ...base, kind: 'preserve' });\n    return out;\n  });\n  const questionConstraintUnresolved = applyContextBindings(tasks, questionConstraintBindings);\n  const scopedContext = scopeContextBindings(contextBindings(context), tasks);\n  const contextUnresolved = applyContextBindings(tasks, scopedContext);",
    "question constraint binding",
)
text = replace_once(text, "    ...contextUnresolved,\n    ...branches.unresolved,", "    ...contextUnresolved,\n    ...questionConstraintUnresolved,\n    ...branches.unresolved,", "constraint unresolved")
text = replace_once(text, "      dependency_prefix_collapse_count: collapsedPrefixes.collapsed.length,\n      unresolved_context_binding_count: contextUnresolved.length", "      dependency_prefix_collapse_count: collapsedPrefixes.collapsed.length,\n      constraint_only_source_count: constraintOnly.length,\n      unresolved_context_binding_count: contextUnresolved.length", "decomposition diagnostics")
write(path, text)


# AST-M09: explicit candidate material and non-placeholder trade-off state.
path = "src/v4-canonical/lanes.js"
text = read(path)
helpers = r'''function explicitComparisonCandidates(task = {}) {
  const target = String(task.target || '').trim();
  if (!target) return [];
  const match = /^(.{1,80}?)\s*(?:と|\band\b|\bvs\.?\b|\bversus\b)\s*(.{1,80}?)$/i.exec(target);
  if (!match) return [];
  const clean = (value) => String(value || '').trim().replace(/^(?:候補|option)\s*/i, '').replace(/\s*(?:を|について)$/u, '');
  const labels = uniqueStrings([clean(match[1]), clean(match[2])]);
  if (labels.length < 2) return [];
  return labels.map((label, index) => ({ candidate_id: `C${String(index + 1).padStart(2, '0')}`, label, source: 'EXPLICIT_COMPARE_TARGET' }));
}

function candidateMatchesText(candidate, text) {
  const label = String(candidate?.label || '').trim().toLowerCase();
  const value = String(text || '').trim().toLowerCase();
  return Boolean(label) && Boolean(value) && value.includes(label);
}

function candidateMaterial(candidate, claims, results) {
  const byId = resultMap(results);
  const matched = claims.filter((claim) => candidateMatchesText(candidate, claim.raw_text));
  const confirmations = matched.map((claim) => byId.get(claim.claim_id)).filter(Boolean);
  const confirmed = matched.filter((claim) => byId.get(claim.claim_id)?.status === ClaimStatus.CONFIRMED);
  const undetermined = matched.filter((claim) => byId.get(claim.claim_id)?.status !== ClaimStatus.CONFIRMED);
  return {
    ...candidate,
    material_state: !matched.length ? 'UNRESOLVED_CANDIDATE_MATERIAL' : undetermined.length ? 'PARTIAL_OR_UNDETERMINED' : 'CONFIRMED_MATERIAL',
    claim_ids: matched.map((claim) => claim.claim_id).sort(),
    confirmed_claim_ids: confirmed.map((claim) => claim.claim_id).sort(),
    undetermined_claim_ids: undetermined.map((claim) => claim.claim_id).sort(),
    observations: matched.map((claim) => ({ claim_id: claim.claim_id, text: claim.raw_text, status: byId.get(claim.claim_id)?.status || ClaimStatus.UNDETERMINED })),
    supported_scopes: confirmations.filter((row) => row?.status === ClaimStatus.CONFIRMED).map((row) => row.supported_scope).filter(Boolean),
    evidence_refs: bindingRefs(confirmations)
  };
}

'''
text = replace_once(text, "function factLane(claims, results, domain = {}) {", helpers + "function factLane(claims, results, domain = {}) {", "compare helpers")
text = replace_once(
    text,
    "  const dimensions = lensPlanEntries(domain, 'compare');\n  const counts = {",
    "  const dimensions = lensPlanEntries(domain, 'compare');\n  const comparisonCandidates = explicitComparisonCandidates(task);\n  const candidateMaterials = comparisonCandidates.map((candidate) => candidateMaterial(candidate, claims, results));\n  const tradeOffDifferences = dimensions.map((entry) => ({\n    dimension: entry.value,\n    lens_sources: entry.sources,\n    comparison_state: comparisonCandidates.length < 2\n      ? 'CANDIDATES_NOT_EXPLICIT'\n      : candidateMaterials.every((candidate) => candidate.observations.length > 0)\n        ? 'COMPARABLE_MATERIAL_PRESENT'\n        : 'INSUFFICIENT_CANDIDATE_MATERIAL',\n    per_candidate: candidateMaterials.map((candidate) => ({\n      candidate_id: candidate.candidate_id, label: candidate.label, material_state: candidate.material_state,\n      confirmed_claim_ids: candidate.confirmed_claim_ids, undetermined_claim_ids: candidate.undetermined_claim_ids,\n      observations: candidate.observations, supported_scopes: candidate.supported_scopes, evidence_refs: candidate.evidence_refs\n    })),\n    conditions: { constraints: uniqueStrings(task.constraints || []), prohibitions: uniqueStrings(task.prohibitions || []), preserve: uniqueStrings(task.preserve || []), conditions: uniqueStrings(task.conditions || []), exceptions: uniqueStrings(task.exceptions || []) },\n    status: 'MATERIAL_ONLY'\n  }));\n  const counts = {",
    "candidate tradeoff",
)
text = replace_once(
    text,
    "    dimension_sources: dimensions,\n    trade_off_differences: dimensions.map((entry) => ({ dimension: entry.value, lens_sources: entry.sources, status: 'MATERIAL_ONLY' })),\n    evidence_trace: bindingRefs(results),",
    "    dimension_sources: dimensions,\n    comparison_candidates: comparisonCandidates,\n    candidate_materials: candidateMaterials,\n    trade_off_differences: tradeOffDifferences,\n    evidence_trace: bindingRefs(results),",
    "replace placeholder tradeoff",
)
text = replace_once(text, "      source: item.source\n    })),", "      source: item.source,\n      evidence_refs: item.evidence_refs || [],\n      lens_sources: item.lens_sources || []\n    })),", "multi trace")
write(path, text)


# AST-M08: structured trade-off material carried by every perspective.
path = "src/canonical-claim-runtime.js"
text = read(path)
text = replace_once(text, "function perspective({ id, focus, conditions = [], failureConditions = [], supportEvidence = [], counterEvidence = [], missingEvidence = [], tradeOffs = [], queryRoles = [], basis = {} }) {", "function perspective({ id, focus, conditions = [], failureConditions = [], supportEvidence = [], counterEvidence = [], missingEvidence = [], tradeOffs = [], tradeOffMaterial = [], queryRoles = [], basis = {} }) {", "perspective signature")
text = replace_once(text, "    trade_offs: uniqueStrings(tradeOffs),\n    query_roles: uniqueStrings(queryRoles),", "    trade_offs: uniqueStrings(tradeOffs),\n    trade_off_material: tradeOffMaterial,\n    query_roles: uniqueStrings(queryRoles),", "perspective output")
text = replace_once(text, "function deterministicPerspectiveExpansion({ task, canonical, domain = {} }) {", "function deterministicPerspectiveExpansion({ task, canonical, domain = {}, comparison = null }) {", "perspective compare input")
text = replace_once(text, "  const compareDimensions = lensPlanValues(domain, 'compare');\n  const hardBlockers", "  const compareDimensions = lensPlanValues(domain, 'compare');\n  const tradeOffMaterial = comparison?.trade_off_differences || [];\n  const hardBlockers", "perspective tradeoff source")
for old in [
    "      tradeOffs: compareDimensions,\n      queryRoles,",
    "      tradeOffs: ['前進条件と反証・Failure Conditionを同時に保持する。', ...compareDimensions],\n      queryRoles:",
    "      tradeOffs: ['失敗回避材料であり採用候補ではない。'],\n      queryRoles,",
    "      tradeOffs: ['成立条件ごとに材料を分離し、一括の勝者決定を行わない。', ...compareDimensions],\n      queryRoles,",
    "      tradeOffs: ['利用者明示条件への適合材料だけを扱い、Human Readerの状態推定で事実を書き換えない。'],\n      queryRoles,",
]:
    if old.endswith("queryRoles:"):
        new = old.replace("\n      queryRoles:", "\n      tradeOffMaterial,\n      queryRoles:")
    else:
        new = old.replace("\n      queryRoles,", "\n      tradeOffMaterial,\n      queryRoles,")
    text = replace_once(text, old, new, "wire tradeoff material")
write(path, text)


# Canonical projection: no trusted precomputed canonical bypass.
path = "src/canonical-task-projection.js"
text = read(path)
text = regex_once(
    text,
    r"function projectCanonicalTask\(\{ task, evidenceRaw, providedCanonical = null \}\) \{.*?\n\}\n\nfunction failureConfirmation",
    r"""function projectCanonicalTask({ task, evidenceRaw, providedCanonical = null }) {
  assertProjectionInput(task);
  if (providedCanonical !== null && providedCanonical !== undefined) {
    const error = new Error('Precomputed canonical records are forbidden at the projection boundary; G1-G7 must run from the canonical task plan and evidence packet.');
    error.code = 'PRECOMPUTED_CANONICAL_FORBIDDEN';
    throw error;
  }
  const canonical = evaluateCanonicalTaskPlan(task.canonical_plan, evidenceRaw);
  const lanes = projectFiveLanes({ task, canonical, domain: task.domain || {} });
  const perspectiveExpansion = deterministicPerspectiveExpansion({ task, canonical, domain: task.domain || {}, comparison: lanes.compare });
  return { canonical, lanes, perspective_expansion: perspectiveExpansion };
}

function failureConfirmation""",
    "canonical bypass",
)
text = replace_once(text, "    perspectiveExpansion = deterministicPerspectiveExpansion({ task, canonical, domain: task?.domain || {} });", "    perspectiveExpansion = deterministicPerspectiveExpansion({ task, canonical, domain: task?.domain || {}, comparison: lanes?.compare || null });", "failure perspective")
write(path, text)


# Canonical engine: lossless Main8 05/06, no precomputed canonical input, truthful base resolver.
path = "src/canonical-astera-engine-base.js"
text = read(path)
aggregate_helpers = r'''function candidateRecordMatches(record, candidate) {
  const label = String(candidate?.label || '').trim().toLowerCase();
  const raw = String(record?.claim?.raw_text || '').trim().toLowerCase();
  return Boolean(label) && Boolean(raw) && raw.includes(label);
}

function aggregateComparisonCandidates(allRecords, taskResults, dimensions) {
  const candidateMap = new Map();
  for (const result of taskResults) for (const candidate of result.lanes.compare.comparison_candidates || []) {
    const key = String(candidate.label || '').trim().toLowerCase();
    if (key && !candidateMap.has(key)) candidateMap.set(key, { candidate_id: `C${String(candidateMap.size + 1).padStart(2, '0')}`, label: candidate.label, source: candidate.source || 'EXPLICIT_COMPARE_TARGET' });
  }
  const candidates = [...candidateMap.values()];
  const materials = candidates.map((candidate) => {
    const records = allRecords.filter((record) => candidateRecordMatches(record, candidate));
    const confirmed = records.filter((record) => record.confirmation?.status === 'CONFIRMED');
    const undetermined = records.filter((record) => record.confirmation?.status !== 'CONFIRMED');
    return {
      ...candidate,
      material_state: !records.length ? 'UNRESOLVED_CANDIDATE_MATERIAL' : undetermined.length ? 'PARTIAL_OR_UNDETERMINED' : 'CONFIRMED_MATERIAL',
      observations: records.map((record) => ({ task_id: record.task_id, claim_id: record.claim?.claim_id || null, text: record.claim?.raw_text || '', status: record.confirmation?.status || 'UNDETERMINED' })),
      confirmed_claim_ids: confirmed.map((record) => `${record.task_id}:${record.claim?.claim_id}`).sort(),
      undetermined_claim_ids: undetermined.map((record) => `${record.task_id}:${record.claim?.claim_id}`).sort(),
      supported_scopes: confirmed.map((record) => record.confirmation?.supported_scope).filter(Boolean),
      evidence_refs: evidenceBindingRefs(records)
    };
  });
  const tradeOffDifferences = dimensions.map((dimension) => ({
    dimension,
    comparison_state: candidates.length < 2 ? 'CANDIDATES_NOT_EXPLICIT' : materials.every((candidate) => candidate.observations.length > 0) ? 'COMPARABLE_MATERIAL_PRESENT' : 'INSUFFICIENT_CANDIDATE_MATERIAL',
    per_candidate: materials.map((candidate) => ({ candidate_id: candidate.candidate_id, label: candidate.label, material_state: candidate.material_state, observations: candidate.observations, confirmed_claim_ids: candidate.confirmed_claim_ids, undetermined_claim_ids: candidate.undetermined_claim_ids, supported_scopes: candidate.supported_scopes, evidence_refs: candidate.evidence_refs })),
    status: 'MATERIAL_ONLY'
  }));
  return { candidates, materials, tradeOffDifferences };
}

'''
text = replace_once(text, "function aggregateTaskResults(taskResults){", aggregate_helpers + "function aggregateTaskResults(taskResults){", "aggregate helpers")
old_compare = "  const claims=allRecords.length,confirmedCount=allRecords.filter((record)=>record.confirmation.status==='CONFIRMED').length,undeterminedCount=claims-confirmedCount,conflictCount=allRecords.filter((record)=>(record.confirmation.reasons||[]).includes('G6_UNRESOLVED_CONFLICT')).length;\n  const comparison={pillar:'compare',material_only:true,counts:{claims,confirmed:confirmedCount,undetermined:undeterminedCount,conflicts:conflictCount},coverage:claims?{numerator:confirmedCount,denominator:claims,ratio:confirmedCount/claims}:null,dimensions:unique(taskResults.flatMap((result)=>result.lanes.compare.dimensions||[])),scope_booleans:taskResults.flatMap((result)=>(result.lanes.compare.scope_booleans||[]).map((item)=>({task_id:result.task.id,...item}))),selected_candidate:null,candidate_ranking:[],rejected_candidates:[],per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.compare])),verdict:{decision:'MATERIAL_ONLY',reason:'Astera does not select, rank, recommend, adopt, or reject candidates.',objective:'Expose deterministic comparison material only.'}};"
new_compare = "  const claims=allRecords.length,confirmedCount=allRecords.filter((record)=>record.confirmation.status==='CONFIRMED').length,undeterminedCount=claims-confirmedCount,conflictCount=taskResults.reduce((sum,result)=>sum+Number(result.lanes.compare.counts?.conflicts||0),0);\n  const comparisonDimensions=unique(taskResults.flatMap((result)=>result.lanes.compare.dimensions||[]));\n  const scopeCoverageParts=taskResults.map((result)=>result.lanes.compare.coverage).filter((item)=>item&&Number(item.denominator)>0);\n  const scopeCoverageNumerator=scopeCoverageParts.reduce((sum,item)=>sum+Number(item.numerator||0),0),scopeCoverageDenominator=scopeCoverageParts.reduce((sum,item)=>sum+Number(item.denominator||0),0);\n  const aggregateCandidateComparison=aggregateComparisonCandidates(allRecords,taskResults,comparisonDimensions);\n  const comparison={pillar:'compare',material_only:true,counts:{claims,confirmed:confirmedCount,undetermined:undeterminedCount,conflicts:conflictCount,insufficient_evidence:taskResults.reduce((sum,result)=>sum+Number(result.lanes.compare.counts?.insufficient_evidence||0),0)},coverage:scopeCoverageDenominator?{numerator:scopeCoverageNumerator,denominator:scopeCoverageDenominator,ratio:scopeCoverageNumerator/scopeCoverageDenominator}:null,dimensions:comparisonDimensions,scope_booleans:taskResults.flatMap((result)=>(result.lanes.compare.scope_booleans||[]).map((item)=>({task_id:result.task.id,...item}))),supported_scope:taskResults.flatMap((result)=>(result.lanes.compare.supported_scope||[]).map((item)=>({task_id:result.task.id,...item}))),unsupported_scope:taskResults.flatMap((result)=>(result.lanes.compare.unsupported_scope||[]).map((item)=>({task_id:result.task.id,...item}))),contradiction_map:taskResults.flatMap((result)=>(result.lanes.compare.contradiction_map||[]).map((item)=>({task_id:result.task.id,...item}))),condition_differences:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.compare.condition_differences||{}])),comparison_candidates:aggregateCandidateComparison.candidates,candidate_materials:aggregateCandidateComparison.materials,trade_off_differences:aggregateCandidateComparison.tradeOffDifferences,selected_candidate:null,candidate_ranking:[],rejected_candidates:[],per_task:Object.fromEntries(taskResults.map((result)=>[result.task.id,result.lanes.compare])),verdict:{decision:'MATERIAL_ONLY',reason:'Astera does not select, rank, recommend, adopt, or reject candidates.',objective:'Expose deterministic comparison material only.'}};"
text = replace_once(text, old_compare, new_compare, "aggregate comparison")
text = replace_once(text, "  async resolveEvidenceForTask(){return null;}", "  async resolveEvidenceForTask({task}={}){return notProvidedEvidence(task?.id||null);}", "default resolver")
text = replace_once(text, "    const taskEvidence=input.taskEvidencePackets||input.task_evidence_packets||{},globalEvidence=input.evidencePacket||input.evidence_packet||null,providedCanonical=input.canonicalClaimRecordsByTask||input.canonical_claim_records_by_task||{};", "    const taskEvidence=input.taskEvidencePackets||input.task_evidence_packets||{},globalEvidence=input.evidencePacket||input.evidence_packet||null;", "remove canonical input")
text = replace_once(text, "        const projected=await executor.exec('PROJECT_CANONICAL_TASK',{task,evidenceRaw,providedCanonical:providedCanonical[task.id]||null},{signal});", "        const projected=await executor.exec('PROJECT_CANONICAL_TASK',{task,evidenceRaw},{signal});", "remove canonical payload")
text = replace_once(text, ",...(context?[`context_length=${context.length}`]:[])]),factItems=", "]),factItems=", "remove context length")
old_frame = "oppositionItems=taskResults.map((result)=>`${result.task.id}: counter query role=${result.canonical.search_plan.planned_query_roles.includes('COUNTER')?'PLANNED':'NOT_REQUIRED'} / unresolved=${result.canonical.undetermined_count}`),comparisonItems=taskResults.map((result)=>`${result.task.id}: claims=${result.lanes.compare.counts.claims}, confirmed=${result.lanes.compare.counts.confirmed}, undetermined=${result.lanes.compare.counts.undetermined}, coverage=${result.lanes.compare.coverage?.ratio??'-'}`),evidenceItems="
new_frame = "oppositionPerspectives=aggregate.multi.perspectives.filter((item)=>item.class!=='MAINLINE'),expandedOpposition=aggregate.perspectiveExpansion.perspectives.filter((item)=>['opposition','failure_reference','third_way','human_fit'].includes(String(item.id))),oppositionItems=unique([...oppositionPerspectives.map((item)=>`${item.task_id}:${item.id}[${item.class}] focus=${Array.isArray(item.focus)?item.focus.join(' / '):item.focus}; conditions=${join(item.conditions,'none')}; weaknesses=${join(item.weaknesses,'none')}`),...expandedOpposition.map((item)=>`${item.task_id}:${item.id}[${item.class}] focus=${Array.isArray(item.focus)?item.focus.join(' / '):item.focus}; conditions=${join(item.conditions,'none')}; failure=${join(item.failure_conditions,'none')}`)]),comparisonItems=unique([`counts: claims=${aggregate.comparison.counts.claims}, confirmed=${aggregate.comparison.counts.confirmed}, undetermined=${aggregate.comparison.counts.undetermined}, conflicts=${aggregate.comparison.counts.conflicts}`,...aggregate.comparison.dimensions.map((item)=>`dimension=${item}`),...aggregate.comparison.candidate_materials.map((item)=>`candidate=${item.label}; state=${item.material_state}; confirmed=${item.confirmed_claim_ids.length}; undetermined=${item.undetermined_claim_ids.length}`),...aggregate.comparison.trade_off_differences.map((item)=>`trade-off[${item.dimension}]=${item.comparison_state}; candidates=${item.per_candidate.map((row)=>`${row.label}:${row.material_state}`).join(' / ')}`),...aggregate.comparison.contradiction_map.map((item)=>`contradiction=${item.task_id}:${item.type}`)]),evidenceItems="
text = replace_once(text, old_frame, new_frame, "Main8 item material")
text = replace_once(text, "      '05_opposition':{summary:join(oppositionItems),items:oppositionItems,decision_basis:trace(['MAIN8-05-COUNTER-ROLE-MATERIAL'],{derivation:'各外部確認Claimにcounter Search Roleを必須化し、反証探索材料を保持する。'})},", "      '05_opposition':{summary:join(oppositionItems),items:oppositionItems,perspectives:oppositionPerspectives,expanded_perspectives:expandedOpposition,trade_off_map:aggregate.multi.trade_off_map,decision_basis:trace(['MAIN8-05-MULTI-COUNTER-ALTERNATIVE-MATERIAL'],{derivation:'Multi/Perspective Expansionの反対・防御・批判・Domain・第三案・利用者条件を条件/弱点/Evidence参照付きで失わず保持する。'})},", "Main8 05")
text = replace_once(text, "      '06_comparison':{summary:`claims=${aggregate.comparison.counts.claims}, confirmed=${aggregate.comparison.counts.confirmed}, undetermined=${aggregate.comparison.counts.undetermined}, conflicts=${aggregate.comparison.counts.conflicts}`,items:comparisonItems,counts:aggregate.comparison.counts,coverage:aggregate.comparison.coverage,dimensions:aggregate.comparison.dimensions,selected_candidate:null,candidate_ranking:[],rejected_candidates:[],decision_basis:trace(['MAIN8-06-MATERIAL-ONLY-COMPARE'],{derivation:'Count/Coverage/Scope/Conflict/Dimensionのみ。加重Score・Ranking・Selected/Rejectedを生成しない。'})},", "      '06_comparison':{summary:`claims=${aggregate.comparison.counts.claims}, confirmed=${aggregate.comparison.counts.confirmed}, undetermined=${aggregate.comparison.counts.undetermined}, conflicts=${aggregate.comparison.counts.conflicts}, candidates=${aggregate.comparison.comparison_candidates.length}, dimensions=${aggregate.comparison.dimensions.length}`,items:comparisonItems,counts:aggregate.comparison.counts,coverage:aggregate.comparison.coverage,dimensions:aggregate.comparison.dimensions,scope_booleans:aggregate.comparison.scope_booleans,supported_scope:aggregate.comparison.supported_scope,unsupported_scope:aggregate.comparison.unsupported_scope,contradiction_map:aggregate.comparison.contradiction_map,condition_differences:aggregate.comparison.condition_differences,comparison_candidates:aggregate.comparison.comparison_candidates,candidate_materials:aggregate.comparison.candidate_materials,trade_off_differences:aggregate.comparison.trade_off_differences,selected_candidate:null,candidate_ranking:[],rejected_candidates:[],decision_basis:trace(['MAIN8-06-MATERIAL-ONLY-COMPARE'],{derivation:'Count/Coverage/Scope/Conflict/Condition差/Candidate別材料/Trade-off差を保持し、加重Score・Ranking・Selected/Rejectedを生成しない。',candidates_compared:aggregate.comparison.comparison_candidates.map((item)=>item.label)})},", "Main8 06")
write(path, text)


# Integrated boundary: direct Evidence API still requires client; integrated decision path does not fail before task need is known.
path = "src/server-with-evidence.js"
text = read(path)
text = replace_once(text, "      if (!this.evidenceClient) return this._json(req, res, 503, { error: 'evidence_search_not_configured' });", "      if (!isIntegrated && !this.evidenceClient) return this._json(req, res, 503, { error: 'evidence_search_not_configured' });", "integrated dependency boundary")
write(path, text)


# Strengthen Main8 Lens test to assert Main8 sections directly.
path = "test/lens-output-integration.test.js"
text = read(path)
needle = "      const serialized=JSON.stringify({task_results:out.result.task_results,five_stage:out.result.five_stage,judgment:out.result.judgment,material:out.material});"
insert = """      const oppositionSection=out.result.judgment['05_opposition'];
      const comparisonSection=out.result.judgment['06_comparison'];
      assert.ok(Array.isArray(oppositionSection.perspectives));
      assert.ok(Array.isArray(oppositionSection.expanded_perspectives));
      assert.ok(Array.isArray(oppositionSection.trade_off_map));
      assert.ok(Array.isArray(comparisonSection.scope_booleans));
      assert.ok(Array.isArray(comparisonSection.supported_scope));
      assert.ok(Array.isArray(comparisonSection.unsupported_scope));
      assert.ok(Array.isArray(comparisonSection.contradiction_map));
      assert.ok(Array.isArray(comparisonSection.comparison_candidates));
      assert.ok(Array.isArray(comparisonSection.candidate_materials));
      assert.ok(Array.isArray(comparisonSection.trade_off_differences));
      const oppositionSerialized=JSON.stringify(oppositionSection);
      const comparisonSerialized=JSON.stringify(comparisonSection);
      for(const entry of matchingTasks){
        for(const perspective of entry.multi.perspectives||[]){
          if(perspective.class!=='MAINLINE'){
            const focus=Array.isArray(perspective.focus)?perspective.focus[0]:perspective.focus;
            if(focus)assert.ok(oppositionSerialized.includes(String(focus)),`${item.name}: Main8 05がPerspectiveを欠落させている`);
          }
        }
        for(const dimension of entry.comparison.dimensions||[])assert.ok(comparisonSerialized.includes(String(dimension)),`${item.name}: Main8 06が比較軸を欠落させている`);
      }

"""
text = replace_once(text, needle, insert + needle, "strengthen Main8 test")
write(path, text)


# Canonical adversarial / golden / boundary regression.
test_content = r'''\
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const inputUnderstanding = require('../src/input-understanding');
const { enrichRequest } = require('../src/deterministic-task-decomposer');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const CanonicalAsteraEngineBase = require('../src/canonical-astera-engine-base');
const AsteraServerWithEvidence = require('../src/server-with-evidence');
const { projectCanonicalTask, projectCanonicalFailure } = require('../src/canonical-task-projection');

const silentLogger = { write() {} };
function understand(question, context = '') { return enrichRequest(inputUnderstanding.analyzeRequest({ question, context }), { question, context }); }

test('negative/prohibition clauses never become positive decision tasks', () => {
  for (const question of ['最終判断はするな。','候補を選ぶな。','A案を採用するな。','Asteraは判断しない。','Do not decide the winner.','Do not select a candidate.']) {
    const request = understand(question);
    assert.equal((request.analysis_task_packet?.tasks || []).some((task) => task.action === 'decide'), false, question);
  }
  const mixed = understand('Asteraは判断しない。A案とB案を比較する。');
  assert.deepEqual(mixed.analysis_task_packet.tasks.map((task) => task.action), ['compare']);
  assert.ok(mixed.analysis_task_packet.tasks[0].prohibitions.some((item) => /判断しない/.test(item)));
});

test('English action semantics use word boundaries and preserve compound actions', () => {
  const compare = understand('Compare two API migration options for compatibility and rollback.');
  assert.equal(compare.analysis_task_packet.tasks.some((task) => task.action === 'migrate'), false);
  assert.equal(compare.analysis_task_packet.tasks.filter((task) => task.action === 'compare').length, 1);
  assert.match(compare.analysis_task_packet.tasks.find((task) => task.action === 'compare').target, /two API migration options/i);
  const compound = understand('Implement API then test it.');
  assert.deepEqual(compound.analysis_task_packet.tasks.map((task) => task.action), ['implement','verify']);
  assert.equal(compound.analysis_task_packet.tasks[0].target, 'API');
  assert.equal(compound.analysis_task_packet.tasks[1].target, 'API');
  assert.deepEqual(compound.analysis_task_packet.tasks[1].depends_on, [compound.analysis_task_packet.tasks[0].id]);
  const descriptive = understand('The user decides. Compare A and B.');
  assert.equal(descriptive.analysis_task_packet.tasks.some((task) => task.action === 'decide'), false);
  assert.equal(descriptive.analysis_task_packet.tasks.filter((task) => task.action === 'compare').length, 1);
});

test('Japanese test wording remains a verification action', () => {
  const request = understand('APIを実装する。その後テストする。');
  assert.ok(request.analysis_task_packet.tasks.some((task) => task.action === 'implement'));
  assert.ok(request.analysis_task_packet.tasks.some((task) => task.action === 'verify'));
});

test('ordinary context prohibitions and premises are scoped and context length is not judgment material', async () => {
  const request = understand('APIを改善する。', 'mainは変更しない。予算は100万円。');
  assert.ok(request.analysis_task_packet.tasks[0].prohibitions.some((item) => /mainは変更しない/.test(item)));
  assert.ok(request.analysis_task_packet.tasks[0].premises.some((item) => /予算は100万円/.test(item)));
  const engine = new CanonicalAsteraEngine({ poolSize: 1, logger: silentLogger });
  try {
    const out = await engine.process({ question:'APIを改善する。', context:'mainは変更しない。予算は100万円。' }, { id:'ctx', is_global:true, plan:'admin' });
    const premise = JSON.stringify(out.result.judgment['02_premise']);
    assert.match(premise, /mainは変更しない|予算は100万円/);
    assert.doesNotMatch(premise, /context_length=/);
  } finally { await engine.destroy(); }
});

test('Compare exposes candidates and structured trade-off material without choosing a winner', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 1, logger: silentLogger });
  try {
    const out = await engine.process({ question:'A案とB案を費用と安全性で比較する。' }, { id:'compare', is_global:true, plan:'admin' });
    assert.equal(out.result.type, 'cognitive_map');
    assert.deepEqual(out.result.comparison.comparison_candidates.map((item) => item.label), ['A案','B案を費用と安全性で']);
    assert.ok(Array.isArray(out.result.comparison.candidate_materials));
    assert.equal(out.result.comparison.candidate_materials.length, 2);
    assert.ok(Array.isArray(out.result.comparison.trade_off_differences));
    for (const row of out.result.comparison.trade_off_differences) assert.equal(row.per_candidate.length, 2);
    assert.equal(out.result.comparison.selected_candidate, null);
    assert.deepEqual(out.result.comparison.candidate_ranking, []);
    const main8 = out.result.judgment['06_comparison'];
    assert.deepEqual(main8.candidate_materials, out.result.comparison.candidate_materials);
    assert.deepEqual(main8.trade_off_differences, out.result.comparison.trade_off_differences);
  } finally { await engine.destroy(); }
});

test('Main8 05 carries lower-lane perspectives rather than counter-role counts only', async () => {
  const engine = new CanonicalAsteraEngine({ poolSize: 1, logger: silentLogger });
  try {
    const out = await engine.process({ question:'初心者がベランダで野菜を育てたい。手間、費用、失敗しにくさを比較したい。' }, { id:'multi', is_global:true, plan:'admin' });
    const lower = out.result.multi.perspectives.filter((item) => item.class !== 'MAINLINE');
    const section = out.result.judgment['05_opposition'];
    assert.ok(lower.length > 0);
    assert.equal(section.perspectives.length, lower.length);
    const serialized = JSON.stringify(section);
    for (const row of lower) {
      const focus = Array.isArray(row.focus) ? row.focus[0] : row.focus;
      if (focus) assert.ok(serialized.includes(String(focus)));
    }
  } finally { await engine.destroy(); }
});

test('precomputed canonical records cannot bypass G1-G7 projection', () => {
  assert.throws(() => projectCanonicalTask({ task:{ id:'T01', canonical_plan:{} }, evidenceRaw:{}, providedCanonical:{ task_id:'T01', records:[], confirmed_count:999, undetermined_count:0 } }), (error) => error?.code === 'PRECOMPUTED_CANONICAL_FORBIDDEN');
});

test('base resolver reports explicit search-not-executed state instead of null stub', async () => {
  const engine = new CanonicalAsteraEngineBase({ poolSize:1, logger:silentLogger });
  try {
    const result = await engine.resolveEvidenceForTask({ task:{ id:'T01' } });
    assert.equal(result.status, 'REJECTED_SEARCH_NOT_EXECUTED');
    assert.equal(result.search_state, 'NOT_EXECUTED');
  } finally { await engine.destroy(); }
});

test('integrated route is not rejected solely because Evidence client is absent', async () => {
  const server = Object.create(AsteraServerWithEvidence.prototype);
  server.evidenceClient = null;
  server._requiresHttps = () => false;
  server._corsOriginFor = () => '*';
  server._authenticate = async () => ({ id:'tenant-1' });
  server.tenants = { limitsFor:() => ({ perMinute:10 }) };
  server.limiter = { check:() => ({ allowed:true }) };
  server._handleIntegrated = async () => ({ marker:'integrated-called' });
  server._json = (_req,_res,status,body) => ({ status, body });
  const integrated = await server._handle({ method:'POST', url:'/v1/integrated/process', headers:{}, requestId:'req-1' }, {}, { tenantId:'anonymous' });
  assert.equal(integrated.marker, 'integrated-called');
  const publicEvidence = await server._handle({ method:'POST', url:'/v1/evidence/search', headers:{}, requestId:'req-2' }, {}, { tenantId:'anonymous' });
  assert.equal(publicEvidence.status, 503);
  assert.equal(publicEvidence.body.error, 'evidence_search_not_configured');
});

test('task failure projection is explicit UNDETERMINED material, never fake success', () => {
  const task = { id:'T01', target:'API', action:'verify', constraints:[], prohibitions:[], preserve:[], canonical_plan:{ task_id:'T01', search_plan:{ task_id:'T01', queries:[], planned_query_roles:[] }, claims:[{ claim_id:'C01', raw_text:'APIは有効である。' }], policy_by_claim_id:{ C01:{ required_scope_fields:[] } } } };
  const out = projectCanonicalFailure({ task, error:Object.assign(new Error('boom'), { code:'WORKER_BROKEN' }) });
  assert.equal(out.canonical.confirmed_count, 0);
  assert.equal(out.canonical.undetermined_count, 1);
  assert.equal(out.lanes.risk.level, 'high');
  assert.equal(out.lanes.compare.selected_candidate, null);
  assert.deepEqual(out.lanes.compare.candidate_ranking, []);
});

test('focused CI cannot claim API coverage through obsolete zero-match name pattern', () => {
  const workflow = fs.readFileSync('.github/workflows/decision-materials-focused.yml', 'utf8');
  assert.doesNotMatch(workflow, /signup -> process works with tenant key/);
  assert.match(workflow, /test\/api\.test\.js/);
  assert.match(workflow, /test\/module-switch\.test\.js/);
  assert.doesNotMatch(workflow, /--test-name-pattern=/);
});
'''
Path("test/judgment-materials-no-shortcuts-regression.test.js").write_text(test_content)


# Focused CI: run the real API files, add semantic coverage and the new adversarial suite.
path = ".github/workflows/decision-materials-focused.yml"
text = read(path)
text = replace_once(text, "          node --check test/canonical-runtime-flow-regression.test.js", "          node --check test/canonical-runtime-flow-regression.test.js\n          node --check test/judgment-materials-no-shortcuts-regression.test.js\n          node --check src/deterministic-task-decomposer.js\n          node --check src/v4-canonical/lanes.js\n          node --check src/canonical-claim-runtime.js\n          node --check src/canonical-task-projection.js\n          node --check src/canonical-astera-engine-base.js\n          node --check src/server-with-evidence.js", "focused syntax")
text = replace_once(text, "            test/lens-plan-integration.test.js \\\n            test/purpose-effect-story.test.js \\", "            test/lens-plan-integration.test.js \\\n            test/judgment-materials-no-shortcuts-regression.test.js \\\n            test/purpose-effect-story.test.js \\", "focused regression")
text = regex_once(text, r"      - name: Decision materials public API cases\n        if: always\(\)\n        shell: bash\n        run: \|\n.*?2>&1 \| tee decision-materials-api\.tap", """      - name: Decision materials public API cases
        if: always()
        shell: bash
        run: |
          set -o pipefail
          node --test \\
            test/api.test.js \\
            test/module-switch.test.js \\
            2>&1 | tee decision-materials-api.tap""", "API full files")
coverage_step = """      - name: Decision materials semantic coverage evidence
        if: always()
        shell: bash
        run: |
          set -o pipefail
          node --test --experimental-test-coverage \\
            test/judgment-materials-no-shortcuts-regression.test.js \\
            test/task-decomposition-canon-regression.test.js \\
            test/task-decomposition-v2-regression.test.js \\
            test/lens-output-integration.test.js \\
            test/canonical-main8-trace.test.js \\
            2>&1 | tee decision-materials-coverage.tap

"""
text = replace_once(text, "      - name: Upload decision-materials focused evidence and exact source snapshot\n", coverage_step + "      - name: Upload decision-materials focused evidence and exact source snapshot\n", "coverage step")
text = replace_once(text, "            decision-materials-task-diagnostics.json", "            decision-materials-task-diagnostics.json\n            decision-materials-coverage.tap", "coverage artifact")
write(path, text)

print('judgment-materials repair patch applied')
