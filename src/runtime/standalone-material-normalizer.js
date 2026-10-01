'use strict';

const GENERIC_PURPOSE = /^(?:-|為る|する|かける|なる|analyze|analysis|判断対象|入力内容)$/iu;
const FAIL_CLOSED = /JAPANESE_PARSER_FAIL_CLOSED|PARSER_NOT_CONFIGURED|PARSER_TIMEOUT|PARSER_PROTOCOL_ERROR|PARSER_EXECUTION_FAILED|PARSER_OVERALL_FAILED/i;
const MATERIAL_TENSION = /NO_EXECUTABLE_ACTION|PARSER_ACTION_GUARD_BLOCKED|parser_task_graph_empty/i;
const WEAK_TARGET = /^(?:|これ|それ|あれ|ここ|そこ|this|that|it|what|how)$/iu;

const INTENT_RULES = Object.freeze([
  ['review', /(?:レビュー|批評|講評|査読|review|critique)/iu],
  ['compare', /(?:比較|比べ|比較して|compare|versus|\bvs\.?\b)/iu],
  ['verify', /(?:検証|事実確認|ファクトチェック|裏取り|真偽|verify|validate|fact\s*check)/iu],
  ['improve', /(?:改善|改良|修正|最適化|強化|improve|optimi[sz]e|refactor|\bfix\b)/iu],
  ['research', /(?:調査|リサーチ|調べ(?:る|て|ろ)|research|investigate)/iu],
  ['plan', /(?:計画|設計|ロードマップ|方針|plan|roadmap|design)/iu],
  ['consider', /(?:検討|考慮|吟味|consider|consideration)/iu]
]);

const PURPOSE = Object.freeze({
  review: '入力内容の主張・根拠・欠陥・比較材料をレビューする',
  compare: '入力内の候補を比較可能な判断材料として整理する',
  verify: '入力内容の検証可能な主張を抽出し、根拠成立状態を確認する',
  improve: '改善対象・欠陥・制約・検証条件を判断材料として整理する',
  research: '調査対象の主張・不足情報・必要Evidenceを判断材料として整理する',
  plan: '計画対象の前提・選択肢・Risk・検証条件を判断材料として整理する',
  consider: '検討対象の前提・選択肢・Risk・未確定事項を判断材料として整理する',
  analyze: '入力内容から検証可能な主張・候補・比較材料を抽出し、判断材料として整理する'
});

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
    if (end <= start) continue;
    spans.push({ start, end, text: source.slice(start, end) });
  }
  return spans;
}

function cleanCandidateLabel(value) {
  return norm(value)
    .replace(/^\*\*|\*\*$/g, '')
    .replace(/^[「『【\[]+|[」』】\]]+$/g, '')
    .replace(/[：:：\-–—]+$/g, '')
    .trim();
}

function candidateLabelAllowed(label) {
  if (!label || label.length < 2 || label.length > 80) return false;
  if (/^(?:概要|特徴|ポイント|注意|比較|結論|まとめ|用途|補足|メリット|デメリット|根拠|Source|Evidence|参考|重要)$/iu.test(label)) return false;
  if (/^[\d.]+$/.test(label)) return false;
  return /[\p{L}\p{N}]/u.test(label);
}

function extractObservableCandidates(text) {
  const labels = [];
  const value = norm(text);
  for (const rawLine of value.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let match = line.match(/^\s*(?:[-*・●▪◦]|\d{1,2}[.)．]|#{1,6})\s*(?:\*\*)?([^：:\n*]{2,80}?)(?:\*\*)?\s*[：:]\s*\S/u);
    if (!match) match = line.match(/^\s*(?:[-*・]\s*)?\*\*([^*]{2,80})\*\*\s*(?:[：:]|[-–—])?\s*\S*/u);
    if (match) {
      const label = cleanCandidateLabel(match[1]);
      if (candidateLabelAllowed(label)) labels.push(label);
    }
  }
  for (const match of value.matchAll(/([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案)と([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案)(?=を|で|について|の|、|,|。|\s)/gu)) {
    for (const raw of [match[1], match[2]]) {
      const label = cleanCandidateLabel(raw);
      if (candidateLabelAllowed(label)) labels.push(label);
    }
  }
  for (const match of value.matchAll(/(?:^|[、,。\s])([A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案)(?=は|が|を|と|、|,|。|\s)/gu)) {
    const label = cleanCandidateLabel(match[1]);
    if (candidateLabelAllowed(label)) labels.push(label);
  }
  for (const match of value.matchAll(/\b(?:Option|Candidate)\s+[A-Z0-9][A-Za-z0-9_-]*\b/giu)) {
    const label = cleanCandidateLabel(match[0]);
    if (candidateLabelAllowed(label)) labels.push(label);
  }
  return unique(labels).slice(0, 32);
}

function claimSignal(line) {
  const value = norm(line);
  if (!value || value.length < 4) return false;
  const numeric = /\b\d+(?:\.\d+)?\s*(?:B|K|M|GB|MB|TB|GiB|MiB|GHz|MHz|TOPS|tok(?:en)?s?\/s|req\/s|ms|x|倍|%|％)\b|\b\d{3,4}年\b/iu.test(value);
  const localizedCount = /\d+(?:\.\d+)?\s*(?:件|人|回|日|時間|分|秒|円|万円|億円|台|個|社|本|枚|%|％)/u.test(value);
  const technicalAssertion = /(?:動作|実行|対応|可能|実現|最大|平均|利用|搭載|特化|特徴|framework|engine|supports?|runs?|can\s+run|available|up\s+to)/iu.test(value);
  const pendingState = /(?:未確認|未完了|未成立|終わっていない|完了していない|確認していない|not\s+yet|pending|incomplete)/iu.test(value);
  const copula = /(?:です|である|だ。?$|となる|を実現|を使用|を公開|is\b|are\b|has\b|have\b)/iu.test(value);
  return numeric || localizedCount || technicalAssertion || pendingState || copula;
}

function extractObservableClaimTexts(text) {
  const out = [];
  for (const rawLine of norm(text).split('\n')) {
    const line = rawLine.trim().replace(/^\s*(?:[-*・●▪◦]|\d{1,2}[.)．])\s*/, '');
    if (!line) continue;
    const parts = line.split(/(?<=[。！？!?])\s*/u).filter(Boolean);
    for (const part of parts) {
      if (claimSignal(part)) out.push(part.trim());
    }
  }
  return unique(out).slice(0, 128);
}

function explicitComparisonDimensions(text) {
  const value = norm(text);
  const dimensions = [];
  const jp = /[A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案と[A-Za-zＡ-Ｚａ-ｚ0-9０-９一-龠ぁ-んァ-ヶ]{1,12}案を([^。！？\n]{2,160}?)で(?:比較|比べ)/u.exec(value)
    || /比較軸(?:は|:|=)\s*([^。！？\n]{2,160})/u.exec(value);
  if (jp?.[1]) {
    for (const part of jp[1].split(/\s*(?:と|、|,|・|\/|／)\s*/u)) {
      const item = norm(part);
      if (item && item.length <= 80) dimensions.push(item);
    }
  }
  const en = /\bcompare\b[^.!?]{0,160}?\b(?:by|on|across|in\s+terms\s+of)\s+([^.!?]{2,160})/iu.exec(value);
  if (en?.[1]) {
    for (const part of en[1].split(/\s*(?:,|\band\b|\/)\s*/iu)) {
      const item = norm(part);
      if (item && item.length <= 80) dimensions.push(item);
    }
  }
  return unique(dimensions);
}

function detectDimensions(text) {
  const value = norm(text);
  const explicit = explicitComparisonDimensions(value);
  const dimensions = [...explicit];
  if (/(?:RAM|VRAM|GB|GiB|メモリ)/iu.test(value)) dimensions.push('メモリ要件');
  if (/(?:parameter|パラメータ|\b\d+(?:\.\d+)?B\b|MoE)/iu.test(value)) dimensions.push('モデル規模');
  if (/(?:tok(?:en)?s?\/s|TOPS|倍|benchmark|ベンチマーク|性能)/iu.test(value)) dimensions.push('性能・Benchmark条件');
  if (/(?:CPU|GPU|NPU|ARM|x86|RTX|GTX)/iu.test(value)) dimensions.push('実行ハードウェア');
  if (/(?:GitHub|公式|repository|repo\b|fork|framework|engine|プロジェクト)/iu.test(value)) dimensions.push('実装・Sourceの公式性');
  if (!dimensions.length) dimensions.push('主張の検証状態');
  return unique(dimensions);
}

function detectObservableRisks(text, candidates, claimTexts) {
  const value = norm(text);
  const risks = [];
  const push = (code, impact) => risks.push({ code, impact });
  if (candidates.length) push('CANDIDATE_DEFINITION_UNVERIFIED', '入力された候補ごとの条件・成立範囲を未確認のまま比較する危険');
  if (/\b\d+(?:\.\d+)?B\b|parameter|パラメータ/iu.test(value)) push('MODEL_SIZE_CLAIM_UNVERIFIED', 'モデル規模・Parameter数の主張条件が未検証の危険');
  if (/(?:RAM|メインメモリ)/iu.test(value) && /(?:VRAM|GPU|GPUメモリ)/iu.test(value)) push('RAM_VRAM_AMBIGUITY', 'RAMとVRAM/GPUメモリの要件を混同する危険');
  if (/(?:MoE|active\s+parameter|active parameters?|総パラメータ|総Parameter)/iu.test(value)) push('TOTAL_VS_ACTIVE_PARAMETER_AMBIGUITY', '総Parameter数とActive Parameter数を混同する危険');
  if (/(?:動かす|動作|実行可能|runs?|can\s+run)/iu.test(value) && /(?:tok(?:en)?s?\/s|TOPS|性能|実用)/iu.test(value)) push('RUNNABLE_VS_PRACTICAL_CONFUSION', '起動可能と実用性能を同一視する危険');
  if (/(?:tok(?:en)?s?\/s|TOPS|倍|benchmark|ベンチマーク)/iu.test(value)) push('BENCHMARK_CONTEXT_MISSING', 'BenchmarkのModel・量子化・Context・Hardware・測定条件不足の危険');
  if (/\b20\d{2}年?\b/iu.test(value)) push('BENCHMARK_STALENESS', '時点依存の性能・仕様情報が古くなっている危険');
  if (/(?:GitHub|fork|非公式|unofficial|公式)/iu.test(value)) push('OFFICIAL_VS_FORK_AMBIGUITY', '公式実装・Fork・第三者実装を取り違える危険');
  if (candidates.length > 1 && /(?:model|モデル|LLM|Qwen|LLaMA|GLM)/iu.test(value)) push('MODEL_COMPATIBILITY_UNVERIFIED', '候補ごとの対応Model・形式・量子化互換性が未検証の危険');
  if (/(?:法務|契約|規約|返金|legal|contract|policy)/iu.test(value)) push('LEGAL_POLICY_CONDITION_UNVERIFIED', '法務・Policy条件が未確認のまま候補比較を確定する危険');
  if (!risks.length && claimTexts.length) push('CLAIM_SCOPE_UNVERIFIED', '入力中の外部検証可能な主張について成立条件・Sourceが未確認の危険');
  return risks;
}

function explicitIntent(text) {
  const value = norm(text);
  for (const [mode, re] of INTENT_RULES) {
    const match = re.exec(value);
    if (match) return { mode, source: 'EXPLICIT_INPUT', cue: match[0] };
  }
  return null;
}

function caseSpecificPurpose(text, fallback) {
  const spans = sentenceSpans(text);
  const material = spans.find((span) => /(?:判断材料|decision\s+material|materials?\s+(?:for|to))/iu.test(span.text)
    && !/(?:最終判断|最終結論)(?:や|・|と)?(?:推奨)?(?:は|を)?(?:しない|禁止|出さない)/u.test(span.text));
  if (material) return norm(material.text).replace(/[。！？!?]+$/u, '');
  const goal = spans.find((span) => /(?:したい|実現したい|改善したい|追加したい|want\s+to|in\s+order\s+to)/iu.test(span.text));
  return goal ? norm(goal.text).replace(/[。！？!?]+$/u, '') : fallback;
}

function detectAnalysisIntent(text, observable = null) {
  const material = observable || observeDocumentMaterial(text);
  const explicit = explicitIntent(text);
  if (explicit) return { ...explicit, confidence: 'high', purpose: caseSpecificPurpose(text, PURPOSE[explicit.mode]) };
  if (material.candidates.length >= 2 && material.claim_texts.length >= 2) {
    return { mode: 'review', source: 'OBSERVABLE_MATERIAL', cue: 'MULTI_CANDIDATE_WITH_VERIFIABLE_CLAIMS', confidence: 'medium', purpose: caseSpecificPurpose(text, PURPOSE.review) };
  }
  if (material.candidates.length >= 2) {
    return { mode: 'compare', source: 'OBSERVABLE_MATERIAL', cue: 'MULTI_CANDIDATE', confidence: 'medium', purpose: caseSpecificPurpose(text, PURPOSE.compare) };
  }
  if (material.claim_texts.length >= 2) {
    return { mode: 'verify', source: 'OBSERVABLE_MATERIAL', cue: 'MULTIPLE_VERIFIABLE_CLAIMS', confidence: 'medium', purpose: caseSpecificPurpose(text, PURPOSE.verify) };
  }
  return { mode: 'analyze', source: 'DEFAULT_MATERIAL_ANALYSIS', cue: null, confidence: 'low', purpose: caseSpecificPurpose(text, PURPOSE.analyze) };
}

function extractMaterialContracts(text) {
  const premises = [];
  const constraints = [];
  const prohibitions = [];
  const preserve = [];
  const deadlines = [];
  const unresolved = [];
  const conditions = [];
  const exceptions = [];
  for (const span of sentenceSpans(text)) {
    const value = norm(span.text);
    if (!value) continue;
    if (/(?:期限|締切|納期|までに|今日中|明日まで|今週中|来週|来月|deadline|due\s+date|\bby\s+\w+)/iu.test(value)) deadlines.push(value);
    if (/(?:変えない|変えず|変更しない|変更せず|維持|保持|そのまま|keep|preserve|retain|without\s+changing)/iu.test(value)) preserve.push(value);
    if (/(?:最終判断|最終結論|推奨|採用|選定)[^。！？!?]{0,80}(?:しない|しないで|禁止|せず|出さない)|(?:must\s+not|do\s+not|never)\b/iu.test(value)) prohibitions.push(value);
    if (/(?:未確認|未完了|未成立|終わっていない|完了していない|確認していない|not\s+yet|pending|incomplete)/iu.test(value)) {
      premises.push(value);
      unresolved.push(value);
    }
    if (extractObservableCandidates(value).length >= 1 && claimSignal(value)) premises.push(value);
    if (/(?:場合|なら|ならば|if\b|when\b|provided\s+that)/iu.test(value)) conditions.push(value);
    if (/(?:ただし|例外|except\b|however\b)/iu.test(value)) exceptions.push(value);
  }
  constraints.push(...deadlines);
  return {
    premises: unique(premises),
    constraints: unique(constraints),
    prohibitions: unique(prohibitions),
    preserve: unique(preserve),
    deadlines: unique(deadlines),
    unresolved: unique(unresolved),
    conditions: unique(conditions),
    exceptions: unique(exceptions)
  };
}

function findComparisonSpan(text, observable) {
  const spans = sentenceSpans(text);
  return spans.find((span) => {
    if (!/(?:比較|比べ|compare|versus|\bvs\.?\b)/iu.test(span.text)) return false;
    const candidates = extractObservableCandidates(span.text);
    return candidates.length >= 2 || (observable?.candidates || []).filter((candidate) => span.text.includes(candidate)).length >= 2;
  }) || null;
}

function observeDocumentMaterial(text) {
  const candidates = extractObservableCandidates(text);
  const claimTexts = extractObservableClaimTexts(text);
  const contracts = extractMaterialContracts(text);
  return {
    source: 'ORIGINAL_QUESTION',
    candidates,
    candidate_count: candidates.length,
    claim_texts: claimTexts,
    claim_count: claimTexts.length,
    dimensions: detectDimensions(text),
    risks: detectObservableRisks(text, candidates, claimTexts),
    contracts
  };
}

function lowInformationPurpose(value) {
  const normalized = norm(value);
  return !normalized || GENERIC_PURPOSE.test(normalized) || normalized.length <= 2;
}

function hasFailClosed(request) {
  const packet = request?.analysis_task_packet || {};
  const markers = [
    ...(packet.hard_blockers || []),
    ...(packet.unresolved || []),
    ...(request?.instruction_understanding?.blocked_reasons || [])
  ].map(String);
  return request?.instruction_understanding?.mode === 'FAIL_CLOSED' || markers.some((value) => FAIL_CLOSED.test(value));
}

function taskCoverage(task, questionLength) {
  const start = Number(task?.source_span?.start);
  const end = Number(task?.source_span?.end);
  if (!Number.isInteger(start) || !Number.isInteger(end) || questionLength <= 0 || end <= start) return 0;
  return Math.max(0, Math.min(1, (end - start) / questionLength));
}

function taskCoverageRatio(tasks, questionLength) {
  if (!questionLength || !tasks.length) return 0;
  const intervals = tasks.map((task) => {
    const start = Math.max(0, Math.min(questionLength, Number(task?.source_span?.start)));
    const end = Math.max(0, Math.min(questionLength, Number(task?.source_span?.end)));
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
  }).filter(Boolean).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (!intervals.length) return 0;
  let covered = 0;
  let [start, end] = intervals[0];
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else {
      covered += end - start;
      start = nextStart;
      end = nextEnd;
    }
  }
  covered += end - start;
  return Math.max(0, Math.min(1, covered / questionLength));
}

function nextTaskId(tasks) {
  let max = 0;
  for (const task of tasks) {
    const match = /^T(\d+)$/i.exec(String(task?.id || ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `T${String(max + 1).padStart(2, '0')}`;
}

function actionForIntent(intent) {
  if (intent?.mode === 'compare') return 'compare';
  if (intent?.mode === 'verify') return 'verify';
  return 'analyze';
}

function buildDocumentMaterialTask(question, intent, observable, tasks) {
  const id = nextTaskId(tasks);
  const comparisonSpan = findComparisonSpan(question, observable);
  const sourceSpan = comparisonSpan || { start: 0, end: question.length, text: question };
  const contracts = observable.contracts || extractMaterialContracts(question);
  const target = observable.candidates?.length >= 2 ? observable.candidates.join(' / ') : '入力内容';
  return {
    id,
    order: tasks.length + 1,
    action: actionForIntent(intent),
    target,
    objective: intent.purpose,
    purpose: intent.purpose,
    user_goal: intent.purpose,
    analysis_intent: intent,
    material_only: true,
    observable_material: observable,
    source_span: sourceSpan,
    raw_text: question,
    source_role: 'DIRECT_INPUT',
    source_axes: { container_role: ['PLAIN_CONTAINER'], content_role: ['OBSERVABLE_MATERIAL'], quotation_role: ['DIRECT'] },
    actionable: true,
    premises: unique([...(observable.claim_texts || []), ...(contracts.premises || [])]),
    constraints: contracts.constraints || [],
    prohibitions: contracts.prohibitions || [],
    preserve: contracts.preserve || [],
    replace: [],
    verification: [],
    completion_criteria: [],
    success_criteria: [],
    conditions: contracts.conditions || [],
    exceptions: contracts.exceptions || [],
    deadlines: contracts.deadlines || [],
    priority_records: [],
    deliverables: [],
    unresolved: contracts.unresolved || [],
    hard_blockers: [],
    depends_on: [],
    branches: [],
    conditional_branch: null,
    execution_gate: 'ALWAYS',
    parallel_group: null,
    supersedes: [],
    superseded_by: [],
    evidence_need: {
      required: observable.claim_count > 0,
      queries: observable.claim_texts || [],
      reasons: observable.claim_count > 0 ? ['OBSERVABLE_EXTERNAL_CLAIMS'] : []
    },
    field_provenance: {
      action: [{ source: 'STANDALONE_API_AUTO_MATERIAL' }],
      target: [{ source: 'STANDALONE_API_AUTO_MATERIAL', candidates: observable.candidates || [] }],
      purpose: [{ source: intent.source, cue: intent.cue || null }],
      observable_material: [{ source: 'ORIGINAL_QUESTION', span: { start: 0, end: question.length } }]
    }
  };
}

function materialTargetMode(intent) {
  return ['review', 'compare', 'verify', 'improve', 'research', 'plan', 'consider', 'analyze'].includes(String(intent?.mode || ''));
}

function resolveMaterialTargets(tasks, packet, intent, observable) {
  if (!materialTargetMode(intent) || observable.claim_count === 0) {
    return { tasks, unresolved: packet.unresolved || [], resolved_target_unresolved: [] };
  }
  const resolvedTargetUnresolved = (packet.unresolved || []).filter((item) => /:target$/.test(String(item)));
  const unresolved = (packet.unresolved || []).filter((item) => !/:target$/.test(String(item)));
  const nextTasks = tasks.map((task) => {
    if (!WEAK_TARGET.test(norm(task?.target))) return task;
    return {
      ...task,
      target: '入力内容',
      target_resolution: 'OBSERVABLE_DOCUMENT_SCOPE',
      field_provenance: {
        ...(task.field_provenance || {}),
        target: [
          ...((task.field_provenance || {}).target || []),
          { source: 'STANDALONE_API_OBSERVABLE_DOCUMENT_TARGET', prior_target: task.target || null }
        ]
      }
    };
  });
  return { tasks: nextTasks, unresolved, resolved_target_unresolved: resolvedTargetUnresolved };
}

function ensureStandaloneDecisionMaterialRequest(prepared, input = {}) {
  if (!prepared?.analysis_task_packet) return prepared;
  const question = String(input.question ?? prepared.original_question ?? prepared.normalized_question ?? '');
  if (!question.trim()) return prepared;

  const observable = observeDocumentMaterial(question);
  const intent = detectAnalysisIntent(question, observable);
  const packet = prepared.analysis_task_packet || {};
  const originalTasks = Array.isArray(packet.tasks) ? packet.tasks : [];
  const targetResolution = resolveMaterialTargets(originalTasks, packet, intent, observable);
  const tasks = targetResolution.tasks;
  const coverageRatio = taskCoverageRatio(tasks, question.length);
  const maxCoverage = tasks.reduce((max, task) => Math.max(max, taskCoverage(task, question.length)), 0);
  const markers = [...(packet.hard_blockers || []), ...targetResolution.unresolved].map(String);
  const materialTension = markers.some((value) => MATERIAL_TENSION.test(value));
  const richObservable = observable.candidate_count >= 2 || observable.claim_count >= 2;
  const projectionIncomplete = tasks.length === 0 || coverageRatio < 0.75;
  const needsDocumentTask = !hasFailClosed(prepared)
    && richObservable
    && (projectionIncomplete || materialTension)
    && !tasks.some((task) => task?.observable_material?.source === 'ORIGINAL_QUESTION');

  let materialTask = null;
  if (needsDocumentTask) materialTask = buildDocumentMaterialTask(question, intent, observable, tasks);
  const replacePartialProjection = Boolean(materialTask && projectionIncomplete);
  const nextTasks = materialTask
    ? (replacePartialProjection ? [materialTask] : [...tasks, materialTask])
    : [...tasks];

  let waves = Array.isArray(packet.execution_waves) ? packet.execution_waves.map((wave) => [...wave]) : [];
  if (replacePartialProjection) waves = [[materialTask.id]];
  else if (materialTask) waves.push([materialTask.id]);
  if (!waves.length && nextTasks.length) waves.push(nextTasks.map((task) => task.id));

  const contracts = observable.contracts || extractMaterialContracts(question);
  const recoveredTensions = replacePartialProjection
    ? (packet.hard_blockers || []).filter((value) => MATERIAL_TENSION.test(String(value)))
    : [];
  const nextHardBlockers = replacePartialProjection
    ? (packet.hard_blockers || []).filter((value) => !MATERIAL_TENSION.test(String(value)))
    : (packet.hard_blockers || []);
  const nextBlockedReasons = replacePartialProjection
    ? (prepared.instruction_understanding?.blocked_reasons || []).filter((value) => !MATERIAL_TENSION.test(String(value)))
    : (prepared.instruction_understanding?.blocked_reasons || []);
  const packetPurpose = materialTask
    ? intent.purpose
    : (lowInformationPurpose(packet.user_goal) ? intent.purpose : packet.user_goal);
  const recoveryConflict = replacePartialProjection ? [{
    type: 'PARSER_PROJECTION_COVERAGE_RECOVERED',
    note: `Original parser task projection covered ${(coverageRatio * 100).toFixed(1)}% of the input; full-input material projection was used.`,
    original_task_ids: tasks.map((task) => task.id),
    recovered_tension_markers: recoveredTensions
  }] : [];
  const nextPacket = {
    ...packet,
    tasks: nextTasks,
    dependencies: replacePartialProjection ? [] : (packet.dependencies || []),
    execution_waves: waves,
    branches: replacePartialProjection ? [] : (packet.branches || []),
    branch_groups: replacePartialProjection ? [] : (packet.branch_groups || []),
    supersession_relations: replacePartialProjection ? [] : (packet.supersession_relations || []),
    reference_resolutions: replacePartialProjection ? [] : (packet.reference_resolutions || []),
    user_goal: packetPurpose,
    analysis_intent: intent,
    observable_material: observable,
    constraints: unique([...(packet.constraints || []), ...(contracts.constraints || [])]),
    prohibitions: unique([...(packet.prohibitions || []), ...(contracts.prohibitions || [])]),
    preserve: unique([...(packet.preserve || []), ...(contracts.preserve || [])]),
    deadlines: unique([...(packet.deadlines || []), ...(contracts.deadlines || [])]),
    conditions: unique([...(packet.conditions || []), ...(contracts.conditions || [])]),
    exceptions: unique([...(packet.exceptions || []), ...(contracts.exceptions || [])]),
    unresolved: unique([
      ...targetResolution.unresolved.filter((value) => !(replacePartialProjection && MATERIAL_TENSION.test(String(value)))),
      ...(materialTask ? (contracts.unresolved || []) : [])
    ]),
    hard_blockers: nextHardBlockers,
    conflicts: [...(packet.conflicts || []), ...recoveryConflict],
    resolved_target_unresolved: targetResolution.resolved_target_unresolved,
    source_spans: replacePartialProjection
      ? [{ task_id: materialTask.id, ...materialTask.source_span }]
      : materialTask
        ? [...(packet.source_spans || []), { task_id: materialTask.id, ...materialTask.source_span }]
        : (packet.source_spans || []),
    task_graph_validation: replacePartialProjection
      ? { ...(packet.task_graph_validation || {}), valid: true, cycle: [], dependency_count: 0, wave_count: 1, branch_count: 0, reference_resolution_count: 0 }
      : packet.task_graph_validation,
    parser_projection_recovery: materialTask ? {
      applied: true,
      replaced_partial_projection: replacePartialProjection,
      task_union_coverage_ratio: coverageRatio,
      max_single_task_coverage_ratio: maxCoverage,
      original_task_count: tasks.length,
      recovered_task_id: materialTask.id,
      recovered_tension_markers: recoveredTensions
    } : null
  };
  const understanding = {
    ...(prepared.instruction_understanding || {}),
    execution_allowed: materialTask ? true : prepared.instruction_understanding?.execution_allowed,
    blocked_reasons: nextBlockedReasons,
    analysis_intent: intent,
    observable_material: {
      candidate_count: observable.candidate_count,
      claim_count: observable.claim_count,
      dimensions: observable.dimensions
    },
    parser_projection_recovery: nextPacket.parser_projection_recovery,
    resolved_target_unresolved: targetResolution.resolved_target_unresolved
  };
  return {
    ...prepared,
    target: replacePartialProjection ? materialTask.target : prepared.target,
    objective: materialTask ? intent.purpose : (lowInformationPurpose(prepared.objective) ? intent.purpose : prepared.objective),
    user_goal: materialTask ? intent.purpose : prepared.user_goal,
    analysis_task_packet: nextPacket,
    instruction_understanding: understanding,
    standalone_api_intent: intent,
    observable_material: observable
  };
}

module.exports = {
  PURPOSE,
  extractObservableCandidates,
  extractObservableClaimTexts,
  extractMaterialContracts,
  observeDocumentMaterial,
  detectAnalysisIntent,
  lowInformationPurpose,
  ensureStandaloneDecisionMaterialRequest
};