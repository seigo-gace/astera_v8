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
  for (const rawLine of norm(text).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let match = line.match(/^\s*(?:[-*・●▪◦]|\d{1,2}[.)．]|#{1,6})\s*(?:\*\*)?([^：:\n*]{2,80}?)(?:\*\*)?\s*[：:]\s*\S/u);
    if (!match) match = line.match(/^\s*(?:[-*・]\s*)?\*\*([^*]{2,80})\*\*\s*(?:[：:]|[-–—])?\s*\S*/u);
    if (!match) continue;
    const label = cleanCandidateLabel(match[1]);
    if (candidateLabelAllowed(label)) labels.push(label);
  }
  return unique(labels).slice(0, 32);
}

function claimSignal(line) {
  const value = norm(line);
  if (!value || value.length < 4) return false;
  const numeric = /\b\d+(?:\.\d+)?\s*(?:B|K|M|GB|MB|TB|GiB|MiB|GHz|MHz|TOPS|tok(?:en)?s?\/s|req\/s|ms|x|倍|%|％)\b|\b\d{3,4}年\b/iu.test(value);
  const technicalAssertion = /(?:動作|実行|対応|可能|実現|最大|平均|利用|搭載|特化|特徴|framework|engine|supports?|runs?|can\s+run|available|up\s+to)/iu.test(value);
  const copula = /(?:です|である|だ。?$|となる|を実現|を使用|を公開|is\b|are\b|has\b|have\b)/iu.test(value);
  return numeric || technicalAssertion || copula;
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

function detectDimensions(text) {
  const value = norm(text);
  const dimensions = [];
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
  if (candidates.length) push('PROJECT_EXISTENCE_UNVERIFIED', '列挙されたProject／実装の存在・公式性を未検証のまま扱う危険');
  if (/\b\d+(?:\.\d+)?B\b|parameter|パラメータ/iu.test(value)) push('MODEL_SIZE_CLAIM_UNVERIFIED', 'モデル規模・Parameter数の主張条件が未検証の危険');
  if (/(?:RAM|メインメモリ)/iu.test(value) && /(?:VRAM|GPU|GPUメモリ)/iu.test(value)) push('RAM_VRAM_AMBIGUITY', 'RAMとVRAM/GPUメモリの要件を混同する危険');
  if (/(?:MoE|active\s+parameter|active parameters?|総パラメータ|総Parameter)/iu.test(value)) push('TOTAL_VS_ACTIVE_PARAMETER_AMBIGUITY', '総Parameter数とActive Parameter数を混同する危険');
  if (/(?:動かす|動作|実行可能|runs?|can\s+run)/iu.test(value) && /(?:tok(?:en)?s?\/s|TOPS|性能|実用)/iu.test(value)) push('RUNNABLE_VS_PRACTICAL_CONFUSION', '起動可能と実用性能を同一視する危険');
  if (/(?:tok(?:en)?s?\/s|TOPS|倍|benchmark|ベンチマーク)/iu.test(value)) push('BENCHMARK_CONTEXT_MISSING', 'BenchmarkのModel・量子化・Context・Hardware・測定条件不足の危険');
  if (/\b20\d{2}年?\b/iu.test(value)) push('BENCHMARK_STALENESS', '時点依存の性能・仕様情報が古くなっている危険');
  if (/(?:GitHub|fork|非公式|unofficial|公式)/iu.test(value)) push('OFFICIAL_VS_FORK_AMBIGUITY', '公式実装・Fork・第三者実装を取り違える危険');
  if (candidates.length > 1 && /(?:model|モデル|LLM|Qwen|LLaMA|GLM)/iu.test(value)) push('MODEL_COMPATIBILITY_UNVERIFIED', '候補ごとの対応Model・形式・量子化互換性が未検証の危険');
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

function detectAnalysisIntent(text, observable = null) {
  const material = observable || observeDocumentMaterial(text);
  const explicit = explicitIntent(text);
  if (explicit) return { ...explicit, confidence: 'high', purpose: PURPOSE[explicit.mode] };
  if (material.candidates.length >= 2 && material.claim_texts.length >= 2) {
    return { mode: 'review', source: 'OBSERVABLE_MATERIAL', cue: 'MULTI_CANDIDATE_WITH_VERIFIABLE_CLAIMS', confidence: 'medium', purpose: PURPOSE.review };
  }
  if (material.candidates.length >= 2) {
    return { mode: 'compare', source: 'OBSERVABLE_MATERIAL', cue: 'MULTI_CANDIDATE', confidence: 'medium', purpose: PURPOSE.compare };
  }
  if (material.claim_texts.length >= 2) {
    return { mode: 'verify', source: 'OBSERVABLE_MATERIAL', cue: 'MULTIPLE_VERIFIABLE_CLAIMS', confidence: 'medium', purpose: PURPOSE.verify };
  }
  return { mode: 'analyze', source: 'DEFAULT_MATERIAL_ANALYSIS', cue: null, confidence: 'low', purpose: PURPOSE.analyze };
}

function observeDocumentMaterial(text) {
  const candidates = extractObservableCandidates(text);
  const claimTexts = extractObservableClaimTexts(text);
  return {
    source: 'ORIGINAL_QUESTION',
    candidates,
    candidate_count: candidates.length,
    claim_texts: claimTexts,
    claim_count: claimTexts.length,
    dimensions: detectDimensions(text),
    risks: detectObservableRisks(text, candidates, claimTexts)
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

function nextTaskId(tasks) {
  let max = 0;
  for (const task of tasks) {
    const match = /^T(\d+)$/i.exec(String(task?.id || ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `T${String(max + 1).padStart(2, '0')}`;
}

function buildDocumentMaterialTask(question, intent, observable, tasks) {
  const id = nextTaskId(tasks);
  return {
    id,
    order: tasks.length + 1,
    action: 'analyze',
    target: '入力内容',
    objective: intent.purpose,
    purpose: intent.purpose,
    user_goal: intent.purpose,
    analysis_intent: intent,
    material_only: true,
    observable_material: observable,
    source_span: { start: 0, end: question.length, text: question },
    raw_text: question,
    source_role: 'DIRECT_INPUT',
    source_axes: { container_role: ['PLAIN_CONTAINER'], content_role: ['OBSERVABLE_MATERIAL'], quotation_role: ['DIRECT'] },
    actionable: true,
    premises: [], constraints: [], prohibitions: [], preserve: [], replace: [], verification: [],
    completion_criteria: [], success_criteria: [], conditions: [], exceptions: [], deadlines: [],
    priority_records: [], deliverables: [], unresolved: [], hard_blockers: [], depends_on: [], branches: [],
    conditional_branch: null, execution_gate: 'ALWAYS', parallel_group: null, supersedes: [], superseded_by: [],
    evidence_need: {
      required: observable.claim_count > 0,
      queries: [],
      reasons: observable.claim_count > 0 ? ['OBSERVABLE_EXTERNAL_CLAIMS'] : []
    },
    field_provenance: {
      action: [{ source: 'STANDALONE_API_AUTO_MATERIAL' }],
      target: [{ source: 'STANDALONE_API_AUTO_MATERIAL' }],
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
  const maxCoverage = tasks.reduce((max, task) => Math.max(max, taskCoverage(task, question.length)), 0);
  const markers = [...(packet.hard_blockers || []), ...targetResolution.unresolved].map(String);
  const materialTension = markers.some((value) => MATERIAL_TENSION.test(value));
  const richObservable = observable.candidate_count >= 2 || observable.claim_count >= 2;
  const needsDocumentTask = !hasFailClosed(prepared)
    && richObservable
    && (tasks.length === 0 || maxCoverage < 0.75 || materialTension)
    && !tasks.some((task) => task?.observable_material?.source === 'ORIGINAL_QUESTION');

  const nextTasks = [...tasks];
  let materialTask = null;
  if (needsDocumentTask) {
    materialTask = buildDocumentMaterialTask(question, intent, observable, nextTasks);
    nextTasks.push(materialTask);
  }

  const waves = Array.isArray(packet.execution_waves) ? packet.execution_waves.map((wave) => [...wave]) : [];
  if (materialTask) waves.push([materialTask.id]);
  if (!waves.length && nextTasks.length) waves.push(nextTasks.map((task) => task.id));

  const packetPurpose = lowInformationPurpose(packet.user_goal) ? intent.purpose : packet.user_goal;
  const nextPacket = {
    ...packet,
    tasks: nextTasks,
    execution_waves: waves,
    user_goal: packetPurpose,
    analysis_intent: intent,
    observable_material: observable,
    unresolved: targetResolution.unresolved,
    resolved_target_unresolved: targetResolution.resolved_target_unresolved,
    source_spans: materialTask
      ? [...(packet.source_spans || []), { task_id: materialTask.id, ...materialTask.source_span }]
      : (packet.source_spans || [])
  };
  const understanding = {
    ...(prepared.instruction_understanding || {}),
    analysis_intent: intent,
    observable_material: {
      candidate_count: observable.candidate_count,
      claim_count: observable.claim_count,
      dimensions: observable.dimensions
    },
    resolved_target_unresolved: targetResolution.resolved_target_unresolved
  };
  return {
    ...prepared,
    objective: lowInformationPurpose(prepared.objective) ? intent.purpose : prepared.objective,
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
  observeDocumentMaterial,
  detectAnalysisIntent,
  lowInformationPurpose,
  ensureStandaloneDecisionMaterialRequest
};