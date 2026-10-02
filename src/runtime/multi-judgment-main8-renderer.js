'use strict';

const ORDER = Object.freeze([
  '01_purpose','02_premise','03_facts','04_crisis',
  '05_opposition','06_comparison','07_evidence_status','08_reinstruction'
]);
const INTERNAL = /PARSER_|TASK_GRAPH|MATERIAL_ONLY|INSUFFICIENT_|RETRIEVAL_FAILED|VERIFICATION_TARGET|NO_EXECUTABLE_ACTION|claim_id|candidate_id|binding_id|SearchExecution|EvidenceQuality/iu;

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}
function sanitizePublicValue(value) {
  let text = clean(value);
  if (!text) return '';
  text = text
    .replace(/\b[0-9a-f]{64}\b/giu, '')
    .replace(/\bHAS_STATE\b/giu, '')
    .replace(/\bTask\s+T\d+\b/giu, '')
    .replace(/\bT\d+\s*:\s*(?:deliverable|completion_criteria|success_criteria|verification|missing|unresolved)\b\s*[:=]?/giu, '')
    .replace(/\b(?:deliverable|completion_criteria|success_criteria)\b\s*[:=]?/giu, '')
    .replace(/^(?:Counter|Alternative evidence angle)\s*[:：-]?\s*/giu, '')
    .replace(/\s*:\s*:/g, ':')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[:：;\-\s]+|[:：;\-\s]+$/g, '')
    .trim();
  return text;
}
function unique(values = []) {
  return [...new Set(values.map(sanitizePublicValue).filter(Boolean))];
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
function operationMissingMaterial(action, lang) {
  const ja = {
    analyze: '現在状態、対象範囲、利用者影響、望ましい状態、満たしたと判定できる完了条件',
    decide: '判断対象、固定条件、未確定事項、比較可能な差、判断可能になる完了条件',
    improve: '現在状態、問題が出る条件、対象範囲、利用者影響、改善後の状態、回帰を含む完了条件',
    implement: '実装箇所・接続点、現在のイベント/データ経路、期待する挙動、既存機能への影響、受入・完了条件',
    integrate: '接続点、入力/出力契約、既存経路、失敗時挙動、互換性、統合完了条件',
    migrate: '現在状態と移行先、依存関係、移行順序、Rollback条件、互換性、完了条件',
    remove: '不要物の正確な再現条件、生成元または発生源、CSS/style/layout・Component依存、削除影響、回帰確認条件',
    verify: '検証対象、再現条件、確認するコード/Source/Record、成立条件、反証・例外、確認完了条件',
    compare: '比較候補、比較軸、同一条件で測れる値、各候補の不足値、優劣を確定できない条件',
    preserve: '維持対象、壊してはいけない境界、変更可能範囲、回帰確認、維持できたと判定する条件',
    explain: '説明対象、前提、確認済みSource、用語の意味、対象範囲、まだ不明な点'
  };
  const en = {
    analyze: 'current state, scope, user impact, desired state, and completion criteria',
    decide: 'decision target, fixed conditions, unresolved items, comparable differences, and decision-ready criteria',
    improve: 'current state, trigger conditions, scope, user impact, desired state, and regression-aware completion criteria',
    implement: 'implementation/connection point, current event or data path, expected behavior, compatibility impact, and acceptance criteria',
    integrate: 'integration point, input/output contract, existing path, failure behavior, compatibility, and completion criteria',
    migrate: 'current and target states, dependencies, order, rollback conditions, compatibility, and completion criteria',
    remove: 'exact reproduction, generating source, CSS/style/layout or component dependency, removal impact, and regression criteria',
    verify: 'verification target, reproduction conditions, code/source/record to inspect, validity conditions, contrary evidence, and completion criteria',
    compare: 'candidates, dimensions, same-condition measurements, missing values, and conditions that prevent a winner',
    preserve: 'behavior to preserve, invariant boundary, editable scope, regression checks, and preservation criteria',
    explain: 'subject, premises, verified sources, terminology, scope, and unresolved points'
  };
  return (lang === 'ja' ? ja : en)[String(action || '')] || (lang === 'ja' ? ja.analyze : en.analyze);
}
function operationCounterMaterial(action, lang) {
  const ja = {
    implement: '追加先を誤っていないか、OFF/失敗/未設定時に無反応や誤案内にならないか、既存操作を壊さないかを確認する。',
    improve: '見直しで必要情報まで隠さないか、変更対象外まで変えないか、改善後に別の利用者影響を生まないかを確認する。',
    remove: '見えている不要物だけを消して原因を残していないか、必要な境界やAttachment表示まで消さないか、再発しないかを確認する。',
    verify: '支持材料だけでなく反証・例外・対象範囲違い・時点違いを同じ強さで確認する。',
    compare: '単一指標だけで優劣を決めず、各候補を同一条件・同一軸で比較できているか確認する。',
    integrate: '片側だけ正常でも契約不一致・失敗時処理・既存経路破壊がないか確認する。',
    migrate: '移行成功だけでなくRollback不能、データ/契約互換性、途中状態の失敗を確認する。',
    preserve: '維持対象を守るために必要な変更まで禁止していないか、境界外の副作用がないか確認する。',
    explain: '説明が確認済み事実と未確認情報を混ぜていないか、対象範囲を越えて一般化していないか確認する。',
    decide: '判断に都合のよい材料だけを残していないか、未確定事項を0や問題なしへ置き換えていないか確認する。',
    analyze: '現在状態・例外・影響範囲・失敗条件を確認し、利用者報告から原因を推測確定しない。'
  };
  const en = {
    implement: 'Check wrong insertion points, OFF/failure/unconfigured behavior, and regressions in existing actions.',
    improve: 'Check whether useful information is hidden, out-of-scope behavior changes, or new user impact is introduced.',
    remove: 'Check whether only the symptom is hidden, necessary UI boundaries are removed, or the defect can recur.',
    verify: 'Check contrary evidence, exceptions, scope mismatches, and time mismatches as strongly as supporting material.',
    compare: 'Do not choose by one metric; compare candidates under the same conditions and dimensions.',
    integrate: 'Check contract mismatch, failure behavior, and regressions even when one side works.',
    migrate: 'Check rollback failure, data/contract compatibility, and intermediate-state failures.',
    preserve: 'Check whether preservation blocks necessary changes or causes side effects outside the protected boundary.',
    explain: 'Check that verified facts and unresolved information remain separate and are not overgeneralized.',
    decide: 'Check for selection bias and for unresolved items being converted into zero or no-problem assumptions.',
    analyze: 'Check current state, exceptions, scope, and failure conditions without inferring causes from user reports.'
  };
  return (lang === 'ja' ? ja : en)[String(action || '')] || (lang === 'ja' ? ja.analyze : en.analyze);
}
function overlaps(left = {}, right = {}) {
  const start = Math.max(Number(left.start || 0), Number(right.start || 0));
  const end = Math.min(Number(left.end || 0), Number(right.end || 0));
  return end > start;
}
function observationsFor(model, request) {
  return (model.observations || []).filter((item) => (item.request_ids || []).includes(request.id) || overlaps(item.source_span, request.source_span));
}
function requestContextLines(request, lang) {
  const context = request.local_context || {};
  const pairs = lang === 'ja'
    ? [['期限','deadlines'],['維持条件','preserve'],['禁止条件','prohibitions'],['未確定事項','unresolved'],['成立条件','conditions'],['例外','exceptions']]
    : [['Deadline','deadlines'],['Preserve','preserve'],['Prohibition','prohibitions'],['Unresolved','unresolved'],['Condition','conditions'],['Exception','exceptions']];
  const lines = [];
  for (const [label, key] of pairs) for (const value of publicValues(context[key] || [])) lines.push(`${label}: ${value}`);
  return unique(lines);
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
  if (typeof item === 'string') return sanitizePublicValue(item);
  return sanitizePublicValue(item.text || item.raw_text || item.claim?.raw_text || item.claim?.text || item.impact || item.failure_condition || item.question || '');
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
function premiseLines(model, lang) {
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
  return unique(lines);
}
function caseContextValues(model, key) {
  return publicValues([
    ...(model.global_context?.[key] || []),
    ...(model.judgment_requests || []).flatMap((request) => request.local_context?.[key] || [])
  ]);
}
function caseRiskLines(model, lang) {
  const lines = [];
  const unresolved = caseContextValues(model, 'unresolved');
  const preserve = caseContextValues(model, 'preserve');
  const compareRequests = (model.judgment_requests || []).filter((request) => String(request.action || '') === 'compare');
  const compareText = compareRequests.map((request) => sanitizePublicValue(request.request_text)).join(' / ');
  const quantitative = publicValues((model.observations || [])
    .map((item) => item?.text)
    .filter((text) => /\d+(?:\.\d+)?\s*(?:件|人|回|日|時間|分|秒|円|万円|台|個|社|本|枚|%|％)/u.test(String(text || ''))));

  for (const value of unresolved) {
    lines.push(lang === 'ja'
      ? `未確定事項「${value}」を確認前に確定・断定扱いしない。`
      : `Do not treat unresolved item “${value}” as confirmed before verification.`);
  }
  for (const value of preserve) {
    lines.push(lang === 'ja'
      ? `維持条件「${value}」を壊す変更を判断材料上の安全な選択肢として扱わない。`
      : `Do not treat a change that breaks preserve condition “${value}” as a safe option.`);
  }
  if (quantitative.length && compareRequests.length) {
    if (lang === 'ja') {
      const dimensions = publicValues([
        /作業時間|工数|時間/u.test(compareText) ? '作業時間' : '',
        /法務|legal/iu.test(compareText) ? '法務リスク' : '',
        /利用者理解|理解度|可読|ユーザー|user/iu.test(compareText) ? '利用者理解' : ''
      ]);
      const axes = dimensions.length ? dimensions.join('・') : '比較軸';
      lines.push(`入力材料「${quantitative.join(' / ')}」の件数・数量差だけで${axes}の優劣を断定しない。各軸は同一条件の確認材料が揃うまで未確認として分離する。`);
    } else {
      lines.push(`Do not infer superiority on comparison dimensions from input quantity differences alone (“${quantitative.join(' / ')}”); keep each dimension unverified until same-condition material exists.`);
    }
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
function groupEvidence(taskResults = [], request = {}, lang) {
  const entries = taskResults.map((taskResult) => taskResult?.evidence || null).filter(Boolean);
  if (!entries.length) {
    return [evidenceText({ search_state: request.external_evidence_requested === true ? 'NOT_EXECUTED' : 'NOT_REQUIRED' }, lang)];
  }
  const states = unique(entries.map((entry) => evidenceText(entry, lang)));
  return states.length ? states : [evidenceText({ search_state: request.external_evidence_requested === true ? 'NOT_EXECUTED' : 'NOT_REQUIRED' }, lang)];
}
function section01(model, lang) {
  const requests = model.judgment_requests || [];
  const lines = [`- ${lang === 'ja' ? `今回の入力には${requests.length}件の判断要求がある。` : `This input contains ${requests.length} judgment requests.`}`];
  for (const request of requests) lines.push(`  - ${request.id} [${actionLabel(request.action, lang)}]: ${sanitizePublicValue(request.request_text)}`);
  lines.push(`- ${lang === 'ja' ? '処理原則: 判断要求R##を一つに潰さず保持し、各R##に必要な実行Taskを1件以上紐付ける。実行Taskが複数でも、それだけで判断要求を水増ししない。' : 'Processing rule: preserve each R## judgment request and map one or more execution tasks to it. Multiple execution tasks do not create extra judgment requests by themselves.'}`);
  return lines.join('\n');
}
function section02(judgment, model, lang) {
  const globalLines = premiseLines(model, lang);
  const requests = model.judgment_requests || [];
  const lines = [`- ${lang === 'ja' ? '複数要求に共通して保持する条件' : 'Cross-cutting conditions to preserve'}:`];
  if (globalLines.length) {
    lines.push(...globalLines.map((line) => `  - ${line}`));
  } else {
    lines.push(`  - ${lang === 'ja' ? '共通条件として明示された期限・禁止・維持・成立条件はない。' : 'No deadline, prohibition, preserve, or condition is explicit as cross-cutting context.'}`);
  }
  lines.push(`- ${lang === 'ja' ? '判断要求ごとの固有条件' : 'Request-specific conditions'}:`);
  for (const request of requests) {
    const local = requestContextLines(request, lang);
    lines.push(`  - ${request.id}: ${local.length ? local.join(' / ') : (lang === 'ja' ? '固有条件の明示なし。' : 'No request-specific condition is explicit.')}`);
  }
  return lines.join('\n');
}
function section03(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '利用者入力の観測と、各判断要求に紐づく実行Taskで得た事実材料を分ける' : 'Separate user observations from factual material produced by execution tasks for each judgment request'}:`];
  for (const item of model.observations || []) lines.push(`  - ${item.id}: ${sanitizePublicValue(item.text)} (${lang === 'ja' ? '利用者報告・外部未検証' : 'user-reported, externally unverified'})`);
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
  const sourceRisks = caseRiskLines(model, lang);
  if (sourceRisks.length) {
    lines.push(`- ${lang === 'ja' ? '入力条件・未確定事項から直接保持するRisk' : 'Risks preserved directly from input constraints and unresolved items'}:`);
    lines.push(...sourceRisks.map((risk) => `  - ${risk}`));
  }
  lines.push(`- ${lang === 'ja' ? '共通Risk: 複数要求を1件に潰すと、一部要求の消失、条件混同、別要求の根拠流用が起きる。利用者報告の現象は原因確認前なので、原因を推測で確定しない。' : 'Common risk: collapsing requests can drop requirements, mix constraints, or reuse evidence across requests. User-reported symptoms do not establish their cause.'}`);
  return lines.join('\n');
}
function section05(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '各判断要求について反証・失敗側の材料を別々に保持する' : 'Keep counter-evidence and failure-side material separate for each judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const counter = groupCounterMaterial(groups.get(request.id) || []);
    const observations = observationsFor(model, request).map((item) => sanitizePublicValue(item.text)).filter(Boolean);
    lines.push(`  - ${request.id}: ${sanitizePublicValue(request.request_text)}`);
    lines.push(`    - ${lang === 'ja' ? '反証・失敗条件' : 'Counter/failure material'}: ${counter.length ? counter.join(' / ') : operationCounterMaterial(request.action, lang)}`);
    if (observations.length) lines.push(`    - ${lang === 'ja' ? '利用者報告' : 'User report'}: ${observations.join(' / ')}`);
  }
  return lines.join('\n');
}
function section06(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? 'A/B候補がない場合も「比較候補なし」で終わらせず、判断要求ごとに現在材料・不足材料・比較可能要素を出す' : 'Even without A/B candidates, show available, missing, and comparable material per judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const taskResults = groups.get(request.id) || [];
    const observations = observationsFor(model, request).map((item) => sanitizePublicValue(item.text)).filter(Boolean);
    const facts = groupFacts(taskResults);
    const missing = groupMissing(taskResults);
    const comparison = groupComparisonMaterial(taskResults);
    const localContext = requestContextLines(request, lang);
    lines.push(`  - ${request.id} [${actionLabel(request.action, lang)}]`);
    lines.push(`    - ${lang === 'ja' ? '要求' : 'Request'}: ${sanitizePublicValue(request.request_text)}`);
    if (localContext.length) lines.push(`    - ${lang === 'ja' ? '要求固有条件' : 'Request-specific conditions'}: ${localContext.join(' / ')}`);
    lines.push(`    - ${lang === 'ja' ? '現在ある材料' : 'Material available now'}: ${unique([...observations, ...facts]).join(' / ') || (lang === 'ja' ? '要求本文のみ。現在実装・発生条件は未確認。' : 'Request text only; current implementation and trigger conditions are unverified.')}`);
    if (comparison.candidates.length) lines.push(`    - ${lang === 'ja' ? '候補' : 'Candidates'}: ${comparison.candidates.join(' / ')}`);
    if (comparison.dimensions.length) lines.push(`    - ${lang === 'ja' ? '比較観点' : 'Dimensions'}: ${comparison.dimensions.join(' / ')}`);
    lines.push(`    - ${lang === 'ja' ? 'まだ不足している材料' : 'Material still missing'}: ${missing.length ? missing.join(' / ') : operationMissingMaterial(request.action, lang)}`);
  }
  return lines.join('\n');
}
function section07(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '根拠成立状態も判断要求ごとに分離する' : 'Keep evidence status separate by judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const states = groupEvidence(groups.get(request.id) || [], request, lang);
    lines.push(`  - ${request.id}: ${states.join(' / ')}`);
  }
  lines.push(`- ${lang === 'ja' ? '利用者入力は要求・観測の根拠にはなるが、コード実装や原因の確認済み根拠には自動昇格しない。別R##のEvidenceを流用しない。' : 'User input supports what was requested or observed but does not verify implementation facts or causes. Evidence from one R## must not be silently reused for another.'}`);
  return lines.join('\n');
}
function section08(model, groups, lang) {
  const lines = [`- ${lang === 'ja' ? '次の確認・実行も判断要求ごとに分ける' : 'Keep next verification/execution steps separate by judgment request'}:`];
  for (const request of model.judgment_requests || []) {
    const missing = groupMissing(groups.get(request.id) || []);
    const localContext = requestContextLines(request, lang);
    const next = missing.length ? missing.join(' / ') : operationMissingMaterial(request.action, lang);
    lines.push(`  - ${request.id}: ${lang === 'ja' ? `「${sanitizePublicValue(request.request_text)}」について、${next}を確認する。` : `For “${sanitizePublicValue(request.request_text)}”, verify ${next}.`}`);
    if (localContext.length) lines.push(`    - ${lang === 'ja' ? '固定して保持する要求固有条件' : 'Request-specific conditions to preserve'}: ${localContext.join(' / ')}`);
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

module.exports = { renderMultiJudgmentMain8, isMultiJudgment, resultTaskGroups, sanitizePublicValue };