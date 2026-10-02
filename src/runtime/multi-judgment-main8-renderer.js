'use strict';

const ORDER = Object.freeze([
  '01_purpose','02_premise','03_facts','04_crisis',
  '05_opposition','06_comparison','07_evidence_status','08_reinstruction'
]);
const INTERNAL = /PARSER_|TASK_GRAPH|MATERIAL_ONLY|INSUFFICIENT_|RETRIEVAL_FAILED|VERIFICATION_TARGET|NO_EXECUTABLE_ACTION|claim_id|candidate_id|binding_id|SearchExecution|EvidenceQuality/iu;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}
function publicValues(values = []) {
  return unique(values).filter((value) => !INTERNAL.test(value) && value !== '-');
}
function modelOf(judgment = {}) {
  return judgment.observable_material?.case_model || judgment.case_model || null;
}
function isMultiJudgment(judgment = {}) {
  const model = modelOf(judgment);
  return Boolean(model?.multi_judgment && Number(model.request_count || 0) > 1);
}
function langOf(judgment = {}) {
  return String(judgment.output_language || 'ja').split('-')[0] === 'ja' ? 'ja' : 'en';
}
function labelOf(judgment, key) {
  return judgment?.[key]?.label || judgment?.[key]?.canonical_label || key;
}
function actionLabel(action, lang) {
  const ja = { analyze: '検討・整理', verify: '検証', compare: '比較', decide: '判断材料化', implement: '実装・追加', improve: '改善・見直し', integrate: '統合', migrate: '移行', remove: '削除・除去', preserve: '維持', explain: '説明' };
  const en = { analyze: 'analyze', verify: 'verify', compare: 'compare', decide: 'decision material', implement: 'implement/add', improve: 'improve/review', integrate: 'integrate', migrate: 'migrate', remove: 'remove', preserve: 'preserve', explain: 'explain' };
  return (lang === 'ja' ? ja : en)[String(action || '')] || (lang === 'ja' ? '分析' : 'analyze');
}
function overlaps(left = {}, right = {}) {
  const start = Math.max(Number(left.start || 0), Number(right.start || 0));
  const end = Math.min(Number(left.end || 0), Number(right.end || 0));
  return end > start;
}
function observationsFor(model, request) {
  return (model.observations || []).filter((item) => overlaps(item.source_span, request.source_span));
}
function resultTaskGroups(result = {}, model = {}) {
  const byTask = new Map((result.task_results || []).map((item) => [String(item?.task?.id || ''), item]));
  const groups = new Map();
  for (const request of model.judgment_requests || []) {
    const ids = unique([
      ...(model.request_task_ids?.[request.id] || []),
      ...(request.parser_task_ids || []),
      ...(model.task_mapping?.[request.id] ? [model.task_mapping[request.id]] : [])
    ]);
    const rows = ids.map((id) => byTask.get(String(id))).filter(Boolean);
    for (const row of result.task_results || []) {
      if (String(row?.task?.request_id || '') === String(request.id) && !rows.includes(row)) rows.push(row);
    }
    groups.set(request.id, rows);
  }
  return groups;
}
function itemText(item) {
  if (!item) return '';
  if (typeof item === 'string') return clean(item);
  return clean(item.text || item.raw_text || item.claim?.raw_text || item.claim?.text || item.impact || item.failure_condition || item.question || '');
}
function groupFacts(taskResults = []) {
  return publicValues(taskResults.flatMap((taskResult) => [
    ...(taskResult?.facts?.confirmed || []).map(itemText),
    ...(taskResult?.task?.premises || []).map(itemText)
  ])).slice(0, 12);
}
function groupRisks(taskResults = []) {
  return publicValues(taskResults.flatMap((taskResult) => (taskResult?.risks?.risks || []).map((risk) => itemText(risk)))).slice(0, 10);
}
function groupMissing(taskResults = []) {
  return publicValues(taskResults.flatMap((taskResult) => [
    ...(taskResult?.inquiry?.open_items || []).map(itemText),
    ...(taskResult?.inquiry?.missing_questions || []).map(itemText),
    ...(taskResult?.inquiry?.missing_fields || []).map(itemText)
  ])).slice(0, 12);
}
function groupCounterMaterial(taskResults = []) {
  const values = [];
  for (const taskResult of taskResults) {
    for (const perspective of taskResult?.multi?.perspectives || []) {
      values.push(...(Array.isArray(perspective?.failure_conditions) ? perspective.failure_conditions : []));
      values.push(...(Array.isArray(perspective?.conditions) ? perspective.conditions : []));
      if (typeof perspective?.focus === 'string') values.push(perspective.focus);
      if (Array.isArray(perspective?.focus)) values.push(...perspective.focus);
    }
  }
  return publicValues(values).slice(0, 10);
}
function groupComparisonMaterial(taskResults = []) {
  return {
    candidates: publicValues(taskResults.flatMap((taskResult) => (taskResult?.comparison?.comparison_candidates || []).map((item) => typeof item === 'string' ? item : item?.label))),
    dimensions: publicValues(taskResults.flatMap((taskResult) => taskResult?.comparison?.dimensions || []))
  };
}
function premiseLines(judgment, model, lang) {
  const context = model.global_context || {};
  const lines = [];
  const push = (labelJa, labelEn, values) => {
    for (const value of publicValues(values || [])) lines.push(`${lang === 'ja' ? labelJa : labelEn}: ${value}`);
  };
  push('期限', 'Deadline', context.deadlines);
  push('維持条件', 'Preserve', context.preserve);
  push('禁止条件', 'Prohibition', context.prohibitions);
  push('未確定事項', 'Unresolved', context.unresolved);
  push('成立条件', 'Condition', context.conditions);
  push('例外', 'Exception', context.exceptions);
  for (const item of judgment['02_premise']?.items || []) {
    const value = clean(item);
    if (!value || INTERNAL.test(value)) continue;
    if (!lines.some((line) => line.includes(value))) lines.push(value);
  }
  return unique(lines);
}
function evidenceText(entry, lang) {
  const search = clean(entry?.search_state);
  const state = clean(entry?.source_status || entry?.state || entry?.status);
  if (search === 'NOT_REQUIRED') return lang === 'ja'
    ? '外部検索を必要としない利用者入力の要求・観測として保持。実装事実まで確認済みという意味ではない。'
    : 'Preserved as a user-supplied request/observation that does not require external search; this does not verify the implementation.';
  if (search === 'NOT_EXECUTED' || !search) return lang === 'ja'
    ? '外部確認は未実行。必要な実装事実・発生条件は未確認のまま。'
    : 'External verification was not executed; implementation facts and trigger conditions remain unresolved.';
  if (/REJECTED|FAILED|ERROR/iu.test(`${search} ${state}`)) return lang === 'ja'
    ? '外部根拠は成立していない。根拠があることにせず未確定として扱う。'
    : 'External evidence was not accepted; keep it unresolved rather than inventing support.';
  if (/FINAL_VALID|CONFIRMED|FOUND/iu.test(`${search} ${state}`)) return lang === 'ja'
    ? '成立した外部根拠候補がある。該当Claimとの対応をEvidence一覧で確認する。'
    : 'Accepted external evidence exists; verify its Claim mapping in the Evidence list.';
  return lang === 'ja' ? '根拠状態は未確定として保持する。' : 'Keep the evidence state unresolved.';
}
function groupEvidence(taskResults = [], lang) {
  const states = unique(taskResults.map((taskResult) => evidenceText(taskResult?.evidence || null, lang)));
  return states.length ? states : [evidenceText(null, lang)];
}
function section01(model, lang) {
  const requests = model.judgment_requests || [];
  const lines = [`- ${lang === 'ja' ? `今回の入力には${requests.length}件の判断要求がある。` : `This input contains ${requests.length} judgment requests.`}`];
  for (const request of requests) lines.push(`  - ${request.id} [${actionLabel(request.action, lang)}]: ${clean(request.request_text)}`);
  lines.push(`- ${lang === 'ja' ? '処理原則: 判断要求R##を一つに潰さず保持し、各R##に必要な実行Taskを1件以上紐付ける。実行Taskが複数でも、それだけで判断要求を水増ししない。' : 'Processing rule: preserve each R## judgment request and map one or more execution tasks to it. Multiple execution tasks do not create extra judgment requests by themselves.'}`);
  return lines.join('\n');
}
function section02(judgment, model, lang) {
  const lines = premiseLines(judgment, model, lang);
  if (!lines.length) return `- ${lang === 'ja' ? '複数要求に共通して固定すべき期限・禁止・維持条件は入力から明示されていない。要求固有の条件は各要求に保持する。' : 'No cross-cutting deadline, prohibition, or preserve condition is explicit; request-specific conditions remain attached to each request.'}`;
  return [`- ${lang === 'ja' ? '複数要求に共通して保持する条件' : 'Cross-cutting conditions to preserve'}:`, ...lines.map((line) => `  - ${line}`)].join('\n');
}
function section03(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '利用者入力の観測と、各判断要求に紐づく実行Taskで得た事実材料を分ける' : 'Separate user observations from factual material produced by execution tasks for each judgment request'}:`];
  for (const item of model.observations || []) lines.push(`  - ${item.id}: ${clean(item.text)} (${lang === 'ja' ? '利用者報告・外部未検証' : 'user-reported, externally unverified'})`);
  for (const request of model.judgment_requests || []) {
    const facts = groupFacts(groups.get(request.id) || []);
    lines.push(`  - ${request.id}: ${facts.length ? facts.join(' / ') : (lang === 'ja' ? '確認済み事実として追加できる材料はまだない。' : 'No additional confirmed factual material is available yet.')}`);
  }
  lines.push(`- ${lang === 'ja' ? '区別: 利用者が要求したこと／利用者が観測したこと／コードや外部根拠で確認済みの事実を混ぜない。' : 'Boundary: keep requested behavior, user-observed state, and code/external-evidence-confirmed facts separate.'}`);
  return lines.join('\n');
}
function section04(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '危険材料も判断要求ごとに分ける' : 'Keep risk material separate by judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const risks = groupRisks(groups.get(request.id) || []);
    lines.push(`  - ${request.id}: ${risks.length ? risks.join(' / ') : (lang === 'ja' ? '案件固有Riskはまだ確認材料不足。' : 'Case-specific risk material is still insufficient.')}`);
  }
  lines.push(`- ${lang === 'ja' ? '共通Risk: 複数要求を1件に潰すと、一部要求の消失、条件混同、別要求の根拠流用が起きる。利用者報告の現象は原因確認前なので、原因を推測で確定しない。' : 'Common risk: collapsing requests can drop requirements, mix constraints, or reuse evidence across requests. User-reported symptoms do not establish their cause.'}`);
  return lines.join('\n');
}
function section05(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '各判断要求について反証・失敗側の材料を別々に保持する' : 'Keep counter-evidence and failure-side material separate for each judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const counter = groupCounterMaterial(groups.get(request.id) || []);
    const observations = observationsFor(model, request).map((item) => clean(item.text));
    lines.push(`  - ${request.id}: ${clean(request.request_text)}`);
    lines.push(`    - ${lang === 'ja' ? '反証・失敗条件' : 'Counter/failure material'}: ${counter.length ? counter.join(' / ') : (lang === 'ja' ? '現在挙動・影響範囲・例外条件・既存機能への副作用を確認する。' : 'Check current behavior, affected scope, exceptions, and side effects.')}`);
    if (observations.length) lines.push(`    - ${lang === 'ja' ? '利用者報告' : 'User report'}: ${observations.join(' / ')}`);
  }
  return lines.join('\n');
}
function section06(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? 'A/B候補がない場合も「比較候補なし」で終わらせず、判断要求ごとに現在材料・不足材料・比較可能要素を出す' : 'Even without A/B candidates, show available, missing, and comparable material per judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const taskResults = groups.get(request.id) || [];
    const observations = observationsFor(model, request).map((item) => clean(item.text));
    const facts = groupFacts(taskResults);
    const missing = groupMissing(taskResults);
    const comparison = groupComparisonMaterial(taskResults);
    lines.push(`  - ${request.id} [${actionLabel(request.action, lang)}]`);
    lines.push(`    - ${lang === 'ja' ? '要求' : 'Request'}: ${clean(request.request_text)}`);
    lines.push(`    - ${lang === 'ja' ? '現在ある材料' : 'Material available now'}: ${unique([...observations, ...facts]).join(' / ') || (lang === 'ja' ? '要求本文のみ。現在実装・発生条件は未確認。' : 'Request text only; current implementation and trigger conditions are unverified.')}`);
    if (comparison.candidates.length) lines.push(`    - ${lang === 'ja' ? '候補' : 'Candidates'}: ${comparison.candidates.join(' / ')}`);
    if (comparison.dimensions.length) lines.push(`    - ${lang === 'ja' ? '比較観点' : 'Dimensions'}: ${comparison.dimensions.join(' / ')}`);
    lines.push(`    - ${lang === 'ja' ? 'まだ不足している材料' : 'Material still missing'}: ${missing.length ? missing.join(' / ') : (lang === 'ja' ? '現在実装、再現/適用条件、影響範囲、要求を満たしたと判定できる完了条件。' : 'Current implementation, reproduction/applicability conditions, affected scope, and completion criteria.')}`);
  }
  return lines.join('\n');
}
function section07(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '根拠成立状態も判断要求ごとに分離する' : 'Keep evidence status separate by judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const states = groupEvidence(groups.get(request.id) || [], lang);
    lines.push(`  - ${request.id}: ${states.join(' / ')}`);
  }
  lines.push(`- ${lang === 'ja' ? '利用者入力は要求・観測の根拠にはなるが、コード実装や原因の確認済み根拠には自動昇格しない。別R##のEvidenceを流用しない。' : 'User input supports what was requested or observed but does not verify implementation facts or causes. Evidence from one R## must not be silently reused for another.'}`);
  return lines.join('\n');
}
function section08(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '次の確認・実行も判断要求ごとに分ける' : 'Keep next verification/execution steps separate by judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const missing = groupMissing(groups.get(request.id) || []);
    lines.push(`  - ${request.id}: ${missing.length ? missing.join(' / ') : (lang === 'ja' ? `「${clean(request.request_text)}」について現在実装→発生/適用条件→影響範囲→完了条件を確認し、確認済み材料だけで判断する。` : `For “${clean(request.request_text)}”, verify current implementation, trigger/applicability conditions, affected scope, and completion criteria before judgment.`)}`);
  }
  lines.push(`- ${lang === 'ja' ? 'ある判断要求が未確認でも、別要求の材料で穴埋めしない。未確認はそのR##に残す。' : 'If one judgment request remains unresolved, do not fill the gap with material from another request; keep the uncertainty on that R##.'}`);
  return lines.join('\n');
}
function renderMultiJudgmentMain8(judgment = {}, result = {}) {
  if (!isMultiJudgment(judgment)) return null;
  const model = modelOf(judgment);
  const lang = langOf(judgment);
  const groups = resultTaskGroups(result, model);
  const rendered = {
    '01_purpose': section01(model, lang),
    '02_premise': section02(judgment, model, lang),
    '03_facts': section03(model, groups, lang),
    '04_crisis': section04(model, groups, lang),
    '05_opposition': section05(model, groups, lang),
    '06_comparison': section06(model, groups, lang),
    '07_evidence_status': section07(model, groups, lang),
    '08_reinstruction': section08(model, groups, lang)
  };
  const text = ORDER.map((key) => `${labelOf(judgment, key)}\n${rendered[key]}`).join('\n---\n');
  return {
    mode: 'judgment_material',
    target: 'user_ai',
    consumer_scope: 'HUMAN_AND_AI_SAME_MATERIAL',
    raw_policy: 'do_not_pass_raw_by_default',
    non_ai: true,
    decision_authority: 'EXTERNAL_ONLY',
    format: judgment.format,
    text,
    compact_text: ORDER.map((key) => `${labelOf(judgment, key)}: ${rendered[key].replace(/\n\s*/g, ' / ')}`).join('\n'),
    sections: ORDER.map((key) => ({ key, label: labelOf(judgment, key), text: rendered[key] }))
  };
}

module.exports = { renderMultiJudgmentMain8, isMultiJudgment, resultTaskGroups };
