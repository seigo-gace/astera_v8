'use strict';

const crypto = require('node:crypto');
const {
  actionOccurrences,
  contextBindings,
  deliverables,
  extractInstructionUnderstandingFields
} = require('../deterministic-task-decomposer');
const { detectLanguageMetadata } = require('../input-understanding');
const { routeDomainTemplates } = require('../domain-template-router');

const ORDER = Object.freeze([
  '01_purpose',
  '02_premise',
  '03_facts',
  '04_crisis',
  '05_opposition',
  '06_comparison',
  '07_evidence_status',
  '08_reinstruction'
]);

const LABELS = Object.freeze({
  ja: Object.freeze([
    '01 本当の目的',
    '02 前提不足',
    '03 事実確認',
    '04 危機察知',
    '05 反対視点',
    '06 比較案',
    '07 根拠成立状態',
    '08 主役AI／利用者への再指示'
  ]),
  en: Object.freeze([
    '01 True Objective',
    '02 Missing Context',
    '03 Fact Check',
    '04 Risk Detection',
    '05 Opposing View',
    '06 Comparison Material',
    '07 Evidence Status',
    '08 Re-instruction to Main AI / User'
  ])
});

const EXTERNAL_EVIDENCE_CUE = /(?:根拠|証拠|出典|公式|一次(?:資料|情報)|最新|現在|現行|価格|料金|法令|規約|仕様|標準|release|current|latest|official|evidence|source|fact.?check)/i;
const HIGH_STAKES_CUE = /(?:医療|医学|薬|診断|治療|法律|法令|契約|税|金融|投資|決済|security|セキュリティ|脆弱性|本番|production|削除|破壊|rollback|認証|secret|個人情報|privacy)/i;
const CONSTRAINT_CUE = /(?:必ず|絶対|禁止|するな|しないで|維持|保持|変更せず|期限|までに|条件|例外|最優先|must\b|must not|do not|keep|preserve|deadline|only\b|without\b|if\b|unless\b)/i;
const COMPARISON_CUE = /(?:比較|比べ|候補|選択肢|案\b|方式|vs\.?|versus|compare)/i;

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function unique(items) {
  return [...new Set((items || []).map((item) => normalize(item)).filter(Boolean))];
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function splitSentences(value) {
  const text = normalize(value);
  if (!text) return [];
  return text.split(/(?<=[。！？!?;；\n])/u).map((item) => normalize(item)).filter(Boolean);
}

function languageFor(metadata) {
  return String(metadata?.language || metadata?.requested_output_language || 'und').split('-')[0] === 'ja' ? 'ja' : 'en';
}

function extractConstraints(question, context) {
  return unique([
    ...splitSentences(question).filter((item) => CONSTRAINT_CUE.test(item)),
    ...(contextBindings(context) || []).filter((item) => ['constraint', 'prohibition', 'preserve', 'deadline', 'condition', 'exception', 'priority'].includes(item.kind)).map((item) => item.value)
  ]).slice(0, 16);
}

function extractInputAssertions(question) {
  return splitSentences(question)
    .filter((item) => !/[?？]$/.test(item) && !/^(?:確認|検証|調査|分析|比較|実装|改善|修正|説明|教え|verify|validate|check|analy|compare|implement|improve|fix|explain)/i.test(item))
    .slice(0, 8)
    .map((item) => `INPUT_ASSERTED_UNVERIFIED: ${item}`);
}

function inferComparisonCandidates(question) {
  const q = normalize(question);
  if (!COMPARISON_CUE.test(q)) return [];
  const matches = q.match(/[A-Za-z0-9_.+#-]{2,32}(?:\s+[A-Za-z0-9_.+#-]{1,24})?|[一-龠々ァ-ヶぁ-ん]{2,20}(?:案|方式|候補|構成)/g) || [];
  return unique(matches.filter((item) => !/^(?:比較|候補|選択肢|compare|versus)$/i.test(item))).slice(0, 8);
}

function buildTaskSummary(question) {
  const actions = actionOccurrences(question) || [];
  if (!actions.length) {
    return [{ id: 'T01', action: 'analyze', source: normalize(question), target: normalize(question).slice(0, 160) || 'input' }];
  }
  return actions.slice(0, 8).map((action, index) => {
    const source = splitSentences(question).find((sentence) => sentence.includes(action.match)) || normalize(question);
    return {
      id: `T${String(index + 1).padStart(2, '0')}`,
      action: action.id === 'decide' ? 'analyze' : action.id,
      source,
      target: source.slice(0, 160) || 'input'
    };
  });
}

function buildRiskItems({ question, constraints, evidenceRequired, lang }) {
  const risks = [];
  if (HIGH_STAKES_CUE.test(question)) {
    risks.push(lang === 'ja'
      ? '高リスク領域を含むため、未確認事項を確定事実へ昇格させない。'
      : 'High-stakes content detected; unresolved items must not be promoted to confirmed facts.');
  }
  if (constraints.length) {
    risks.push(lang === 'ja'
      ? '明示制約の脱落・上書きが失敗条件になる。'
      : 'Dropping or overwriting explicit constraints is a failure condition.');
  }
  if (evidenceRequired) {
    risks.push(lang === 'ja'
      ? '外部根拠を取得する前に最新性・公式性を断定すると誤確認になる。'
      : 'Claiming currentness or authority before external evidence is retrieved would create false confirmation.');
  }
  if (!risks.length) {
    risks.push(lang === 'ja'
      ? '初期Fast Pathでは外部未確認事項を未確定のまま保持する。'
      : 'The initial Fast Path preserves externally unverified items as unresolved.');
  }
  return risks;
}

function buildInitialJudgmentMaterial(input = {}, caller = { id: 'unknown' }) {
  const startedAt = process.hrtime.bigint();
  const question = normalize(input.question);
  const context = normalize(input.context);
  const metadata = detectLanguageMetadata(`${question}\n${context}`, input);
  const lang = languageFor(metadata);
  const instruction = extractInstructionUnderstandingFields(question);
  const tasks = buildTaskSummary(question);
  const constraints = extractConstraints(question, context);
  const assertions = extractInputAssertions(question);
  const candidates = inferComparisonCandidates(question);
  const evidenceRequired = EXTERNAL_EVIDENCE_CUE.test(`${question}\n${context}`);
  let lens = null;
  try {
    lens = routeDomainTemplates({ question, context });
  } catch {
    lens = null;
  }
  const primaryLens = lens?.primary?.id || null;
  const materialId = `mat_${sha256(`${question}\n${context}`).slice(0, 24)}`;
  const purpose = instruction.user_goal || tasks.map((task) => task.source).filter(Boolean).join(' / ') || question || (lang === 'ja' ? '入力内容を判断材料へ構造化する' : 'Structure the input into judgment material');
  const missing = unique([
    ...(constraints.length ? [] : [lang === 'ja' ? '明示制約は初期入力から追加抽出されていない。' : 'No explicit constraint was extracted from the initial input.']),
    ...(evidenceRequired ? [lang === 'ja' ? '外部根拠はFast Path時点では未取得。' : 'External evidence is not retrieved in the Fast Path.'] : []),
    ...(question ? [] : [lang === 'ja' ? '質問本文がない。' : 'The request body is empty.'])
  ]);
  const riskItems = buildRiskItems({ question, constraints, evidenceRequired, lang });
  const oppositionItems = unique([
    lang === 'ja' ? '入力前提が誤っている場合の反証・失敗条件を後続検証で確認する。' : 'Check counter-evidence and failure conditions if input assumptions are wrong.',
    ...(evidenceRequired ? [lang === 'ja' ? '専門・Authority経路と一般・最新情報経路の双方で反対根拠も確認する。' : 'Check counter-evidence through both Specialist/Authoritative and General/Current routes.'] : [])
  ]);
  const comparisonItems = candidates.length
    ? candidates.map((candidate) => `${lang === 'ja' ? '比較候補' : 'candidate'}: ${candidate}`)
    : [lang === 'ja' ? '比較候補が明示されていない場合、勝手に候補や順位を生成しない。' : 'Do not invent candidates or rankings when comparison candidates are not explicit.'];
  const evidenceItems = [
    evidenceRequired
      ? (lang === 'ja' ? 'SEARCH_REQUIRED_BOTH_ROUTES: 専門・Authority + 一般・最新情報を後続で両方実行する。' : 'SEARCH_REQUIRED_BOTH_ROUTES: run Specialist/Authoritative + General/Current in the enrichment stage.')
      : (lang === 'ja' ? 'INITIAL_LOCAL_ONLY: 外部検索必須Signalは初期入力から検出されていない。' : 'INITIAL_LOCAL_ONLY: no mandatory external-search signal detected from the initial input.'),
    lang === 'ja' ? 'Fast Pathでは未取得EvidenceをCONFIRMEDへ昇格しない。' : 'The Fast Path never promotes unavailable evidence to CONFIRMED.'
  ];
  const reinstructionItems = unique([
    lang === 'ja' ? 'この初期Main8を判断材料として即時利用し、未確認事項を事実扱いしない。' : 'Use this initial Main8 immediately while preserving all unverified items as unresolved.',
    ...(evidenceRequired ? [lang === 'ja' ? '後続根拠検索では2 Routeを毎回ともに実行し、Candidateを統合検証する。' : 'In evidence enrichment, always run both routes and validate the merged candidates.'] : []),
    lang === 'ja' ? 'Asteraは採用・Ranking・Recommendation・最終Decisionを行わない。' : 'Astera does not select, rank, recommend, or make the final decision.'
  ]);

  const sections = {
    '01_purpose': { items: [purpose], summary: purpose },
    '02_premise': { items: unique([...constraints, ...missing]), summary: unique([...constraints, ...missing]).join(' / ') || '-' },
    '03_facts': { items: assertions.length ? assertions : [lang === 'ja' ? '外部確認済み事実はFast Path時点では0件。' : 'Externally confirmed facts at Fast Path time: 0.'], summary: assertions.length ? `input_assertions=${assertions.length}; confirmed_external=0` : 'confirmed_external=0' },
    '04_crisis': { items: riskItems, summary: riskItems.join(' / ') },
    '05_opposition': { items: oppositionItems, summary: oppositionItems.join(' / ') },
    '06_comparison': { items: comparisonItems, summary: comparisonItems.join(' / '), selected_candidate: null, candidate_ranking: [] },
    '07_evidence_status': { items: evidenceItems, summary: evidenceItems.join(' / '), state: evidenceRequired ? 'SEARCH_REQUIRED' : 'INITIAL_LOCAL_ONLY' },
    '08_reinstruction': { items: reinstructionItems, summary: reinstructionItems.join(' / ') }
  };

  const labels = LABELS[lang];
  const text = ORDER.map((key, index) => `${labels[index]}\n${sections[key].items.map((item) => `- ${item}`).join('\n')}`).join('\n---\n');
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  const result = Object.freeze({
    type: 'cognitive_map_initial',
    phase: 'INITIAL_FAST_PATH',
    revision: 1,
    material_id: materialId,
    decision_authority: 'EXTERNAL_ONLY',
    no_normative_decision_generated: true,
    non_ai: true,
    input_language: metadata.language,
    requested_output_language: metadata.requested_output_language,
    task_summary: Object.freeze(tasks),
    lens: primaryLens,
    deliverables: Object.freeze(deliverables(question) || []),
    evidence_required: evidenceRequired,
    evidence_route_policy: evidenceRequired ? 'BOTH_ROUTES_REQUIRED' : 'NOT_REQUIRED',
    judgment: Object.freeze({ order: ORDER, ...sections })
  });
  return Object.freeze({
    result,
    material: Object.freeze({
      mode: 'judgment_material_initial',
      phase: 'INITIAL_FAST_PATH',
      material_id: materialId,
      revision: 1,
      decision_authority: 'EXTERNAL_ONLY',
      no_normative_decision_generated: true,
      text,
      compact_text: ORDER.map((key, index) => `${labels[index]}: ${sections[key].summary}`).join('\n'),
      sections: Object.freeze(sections)
    }),
    prompt: '',
    runtime: Object.freeze({
      engine: 'v8_initial_fast_path',
      caller_id: String(caller?.id || 'unknown'),
      ai_used: false,
      llm_called: false,
      japanese_parser_used: false,
      evidence_search_used: false,
      external_network_wait: false,
      duration_ms: durationMs,
      basic_target_ms: 1000,
      engineering_target_ms: 100,
      within_basic_target: durationMs < 1000,
      within_engineering_target: durationMs < 100
    })
  });
}

module.exports = { buildInitialJudgmentMaterial, ORDER };
