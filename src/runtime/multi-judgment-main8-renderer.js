'use strict';

const ORDER = Object.freeze([
  '01_purpose','02_premise','03_facts','04_crisis',
  '05_opposition','06_comparison','07_evidence_status','08_reinstruction'
]);

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
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
  const ja = { analyze: '検討・整理', verify: '検証', compare: '比較', implement: '実装・追加', improve: '改善・見直し', remove: '削除・除去' };
  const en = { analyze: 'analyze', verify: 'verify', compare: 'compare', implement: 'implement/add', improve: 'improve/review', remove: 'remove' };
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
function premiseLines(judgment, model, lang) {
  const context = model.global_context || {};
  const lines = [];
  const push = (labelJa, labelEn, values) => {
    for (const value of unique(values || [])) lines.push(`${lang === 'ja' ? labelJa : labelEn}: ${value}`);
  };
  push('期限', 'Deadline', context.deadlines);
  push('維持条件', 'Preserve', context.preserve);
  push('禁止条件', 'Prohibition', context.prohibitions);
  push('未確定事項', 'Unresolved', context.unresolved);
  push('成立条件', 'Condition', context.conditions);
  push('例外', 'Exception', context.exceptions);
  for (const item of judgment['02_premise']?.items || []) {
    const value = clean(item);
    if (!value || /PARSER_|TASK_GRAPH|NO_EXECUTABLE_ACTION|T\d+:/iu.test(value)) continue;
    if (!lines.some((line) => line.includes(value))) lines.push(value);
  }
  return unique(lines);
}
function usefulRisks(judgment) {
  const rows = [];
  for (const risk of judgment['04_crisis']?.risks || []) {
    const value = clean(risk?.impact || risk?.failure_condition || risk?.key);
    if (!value || /PARSER_|TASK_GRAPH|MATERIAL_ONLY|INSUFFICIENT_|RETRIEVAL_FAILED|VERIFICATION_TARGET/iu.test(value)) continue;
    rows.push(value);
  }
  return unique(rows).slice(0, 8);
}
function evidenceByTask(judgment) {
  return judgment['07_evidence_status']?.evidence_search || judgment.evidence_state?.per_task || {};
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
function section01(judgment, model, lang) {
  const requests = model.judgment_requests || [];
  const lines = [
    `- ${lang === 'ja' ? `今回の入力は1件ではなく、${requests.length}件の判断要求を含む` : `This input contains ${requests.length} separate judgment requests, not one`}。`
  ];
  for (const request of requests) lines.push(`  - ${request.id} [${actionLabel(request.action, lang)}]: ${clean(request.request_text)}`);
  lines.push(`- ${lang === 'ja' ? '処理原則: 各要求を別Taskとして分析し、共通条件だけを共有する。1つの目的文へ潰さない。' : 'Processing rule: analyze each request as a separate task and share only cross-cutting constraints; do not collapse them into one purpose.'}`);
  return lines.join('\n');
}
function section02(judgment, model, lang) {
  const lines = premiseLines(judgment, model, lang);
  if (!lines.length) return `- ${lang === 'ja' ? '複数要求に共通して固定すべき期限・禁止・維持条件は入力から明示されていない。要求固有の条件は各要求本文に保持する。' : 'No cross-cutting deadline, prohibition, or preserve condition is explicit; request-specific conditions remain attached to each request.'}`;
  return [`- ${lang === 'ja' ? '複数要求に共通して保持する条件' : 'Cross-cutting conditions to preserve'}:`, ...lines.map((line) => `  - ${line}`)].join('\n');
}
function section03(judgment, model, lang) {
  const lines = [`- ${lang === 'ja' ? '利用者入力からそのまま保持できる観測・要求状態' : 'Observations and request state preserved directly from the user input'}:`];
  const observations = model.observations || [];
  if (observations.length) {
    for (const item of observations) lines.push(`  - ${item.id}: ${clean(item.text)} (${lang === 'ja' ? '利用者報告・外部未検証' : 'user-reported, externally unverified'})`);
  } else {
    lines.push(`  - ${lang === 'ja' ? '現象・数値としての観測は明示されていない。要求内容そのものを事実へ変換しない。' : 'No explicit observed state or numeric fact is supplied; request text is not converted into a fact.'}`);
  }
  lines.push(`- ${lang === 'ja' ? '要求として確実に言えること' : 'What is certain as requested work'}:`);
  for (const request of model.judgment_requests || []) lines.push(`  - ${request.id}: ${clean(request.request_text)}`);
  lines.push(`- ${lang === 'ja' ? '区別: 利用者が要求したこと／利用者が観測したこと／コードや外部根拠で確認済みの事実を混ぜない。' : 'Boundary: keep requested behavior, user-observed state, and code/external-evidence-confirmed facts separate.'}`);
  return lines.join('\n');
}
function section04(judgment, model, lang) {
  const lines = [`- ${lang === 'ja' ? '複数要求を1件として処理した場合の主要な危険' : 'Primary risks if multiple requests are processed as one'}:`];
  lines.push(`  - ${lang === 'ja' ? '対象・完了条件・未確認事項が混ざり、一部要求が結果から消える。' : 'Targets, completion conditions, and unresolved items can mix, causing some requests to disappear from the result.'}`);
  lines.push(`  - ${lang === 'ja' ? '一つの要求で得た事実や根拠を別要求へ誤って流用する。' : 'Facts or evidence from one request can be incorrectly reused for another.'}`);
  for (const risk of usefulRisks(judgment)) lines.push(`  - ${risk}`);
  if ((model.observations || []).length) lines.push(`  - ${lang === 'ja' ? '利用者報告の現象は原因確認前なので、発生原因を推測で確定しない。' : 'User-reported symptoms do not establish their cause; do not infer the cause before verification.'}`);
  return lines.join('\n');
}
function section05(judgment, model, lang) {
  const lines = [`- ${lang === 'ja' ? '各要求について「その修正だけをすれば十分か」を別々に確認する' : 'For each request, independently check whether the requested change alone is sufficient'}:`];
  for (const request of model.judgment_requests || []) {
    const observations = observationsFor(model, request).map((item) => clean(item.text));
    lines.push(`  - ${request.id}: ${clean(request.request_text)}`);
    lines.push(`    - ${lang === 'ja' ? '反対側から確認する点' : 'Counter-check'}: ${lang === 'ja' ? '現在挙動・影響範囲・例外条件・既存機能への副作用を確認し、要求文だけから原因や最適解を決めない。' : 'Check current behavior, affected scope, exceptions, and side effects; do not infer the cause or optimal fix from the request text alone.'}`);
    if (observations.length) lines.push(`    - ${lang === 'ja' ? '利用者報告' : 'User report'}: ${observations.join(' / ')}`);
  }
  return lines.join('\n');
}
function section06(judgment, model, lang) {
  const lines = [`- ${lang === 'ja' ? 'この入力は候補A/Bの比較ではない。代わりに、要求ごとの判断単位を分離して並べる' : 'This is not an A/B candidate comparison. Keep separate judgment units per request'}:`];
  for (const request of model.judgment_requests || []) {
    const observations = observationsFor(model, request).map((item) => clean(item.text));
    lines.push(`  - ${request.id} [${actionLabel(request.action, lang)}]`);
    lines.push(`    - ${lang === 'ja' ? '要求' : 'Request'}: ${clean(request.request_text)}`);
    lines.push(`    - ${lang === 'ja' ? '現在ある材料' : 'Material available now'}: ${observations.length ? observations.join(' / ') : (lang === 'ja' ? '要求本文のみ。現在実装・発生条件は未確認。' : 'Request text only; current implementation and trigger conditions are unverified.')}`);
    lines.push(`    - ${lang === 'ja' ? '追加で必要な材料' : 'Additional material needed'}: ${lang === 'ja' ? '現在実装、再現条件、影響範囲、要求を満たしたと判定できる完了条件。' : 'Current implementation, reproduction conditions, affected scope, and completion criteria that prove the request is satisfied.'}`);
  }
  return lines.join('\n');
}
function section07(judgment, model, lang) {
  const byTask = evidenceByTask(judgment);
  const mapping = model.task_mapping || {};
  const lines = [`- ${lang === 'ja' ? '要求ごとに根拠状態を分離する' : 'Keep evidence status separate for each request'}:`];
  for (const request of model.judgment_requests || []) {
    const taskId = mapping[request.id];
    const entry = taskId ? byTask[taskId] : null;
    lines.push(`  - ${request.id}: ${evidenceText(entry, lang)}`);
  }
  lines.push(`- ${lang === 'ja' ? '利用者入力は要求・観測の根拠にはなるが、コード実装や原因の確認済み根拠には自動昇格しない。必要な外部・コード根拠は成立したものだけEvidenceとして紐付ける。' : 'User input supports what was requested or observed, but does not automatically verify implementation facts or causes. Only accepted external/code evidence may be linked as Evidence.'}`);
  return lines.join('\n');
}
function section08(judgment, model, lang) {
  const lines = [`- ${lang === 'ja' ? '次に確認・実行する単位も要求ごとに分ける' : 'Keep the next verification/execution steps separate per request'}:`];
  for (const request of model.judgment_requests || []) {
    lines.push(`  - ${request.id}: ${lang === 'ja' ? `「${clean(request.request_text)}」について、現在実装→発生/適用条件→影響範囲→完了条件の順に確認し、確認済み材料だけで修正可否を判断する。` : `For “${clean(request.request_text)}”, verify current implementation → trigger/applicability conditions → affected scope → completion criteria, then judge the change only from verified material.`}`);
  }
  lines.push(`- ${lang === 'ja' ? '複数要求のうち1件が未確認でも、他の要求の材料で埋めない。未確認はその要求に残す。' : 'If one request remains unresolved, do not fill it with material from another request; keep the uncertainty attached to that request.'}`);
  return lines.join('\n');
}
function renderMultiJudgmentMain8(judgment = {}) {
  if (!isMultiJudgment(judgment)) return null;
  const model = modelOf(judgment);
  const lang = langOf(judgment);
  const rendered = {
    '01_purpose': section01(judgment, model, lang),
    '02_premise': section02(judgment, model, lang),
    '03_facts': section03(judgment, model, lang),
    '04_crisis': section04(judgment, model, lang),
    '05_opposition': section05(judgment, model, lang),
    '06_comparison': section06(judgment, model, lang),
    '07_evidence_status': section07(judgment, model, lang),
    '08_reinstruction': section08(judgment, model, lang)
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
    sections: ORDER.map((key) => ({ key, label: labelOf(judgment, key), text: rendered[key] })),
    multi_judgment_case: { request_count: model.request_count, request_ids: (model.judgment_requests || []).map((item) => item.id) }
  };
}

module.exports = { renderMultiJudgmentMain8, isMultiJudgment };