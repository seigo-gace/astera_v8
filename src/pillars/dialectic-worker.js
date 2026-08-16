'use strict';

const { normalizeEvidencePacket, unique } = require('../judgment-materials-analyzer');

function clamp(value) { return Math.max(0, Math.min(100, Math.round(value))); }

const WEIGHTS = Object.freeze({ objectiveFit: 0.30, evidenceFit: 0.25, riskControl: 0.20, constraintFit: 0.15, reversibility: 0.10 });

function metricScore(metrics) {
  return clamp(Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + Number(metrics[key] || 0) * weight, 0));
}

function candidate({ id, label, angle, thesis, strengths, failureModes, requiredChecks, metrics, rationale, ruleIds }) {
  const score = metricScore(metrics);
  return { id, label, angle, thesis, strengths: unique(strengths).slice(0, 8), failure_modes: unique(failureModes).slice(0, 8), required_checks: unique(requiredChecks).slice(0, 10), metrics, weights: WEIGHTS, score, answer_line_distance: 100 - score, rationale, rule_ids: ruleIds };
}

function evidenceFit(evidence, unresolved) {
  if (evidence.state === 'VALID') return unresolved ? 78 : 92;
  if (evidence.state === 'REJECTED') return 20;
  if (evidence.state === 'PARTIAL') return 45;
  if (evidence.state === 'NOT_REQUIRED') return 85;
  return unresolved ? 45 : 70;
}

function constraintFit(task, mode) {
  const hard = (task.prohibitions?.length || 0) + (task.preserve?.length || 0) + (task.constraints?.length || 0);
  if (!hard) return mode === 'bad_hand' ? 20 : 82;
  if (mode === 'bad_hand') return 5;
  if (mode === 'opposition') return 95;
  if (mode === 'third_way') return 94;
  return 90;
}

async function run({ question = '', facts = {}, risks = {}, inquiry = {}, multi = {}, mood = {}, human = {}, domain = {}, task = null, evidence_packet = null }) {
  const evidence = normalizeEvidencePacket(evidence_packet);
  const t = task || { id: null, target: '対象', objective: question, success_criteria: [], constraints: [], prohibitions: [], preserve: [], action: 'analyze' };
  const unresolved = facts.unconfirmed?.length || 0;
  const verified = facts.confirmed?.length || 0;
  const riskCount = risks.risk_count || 0;
  const highRisk = risks.level === 'high' || riskCount >= 3;
  const constraints = unique([...(t.constraints || []), ...(t.prohibitions || []), ...(t.preserve || [])]);
  const success = t.success_criteria || [];
  const missing = inquiry.missing_questions || [];
  const topRisk = risks.highest?.impact || risks.highest?.why || '重大Riskなし';
  const domainChecks = Array.isArray(domain.primary?.evidence_to_collect) ? domain.primary.evidence_to_collect.slice(0, 5) : [];
  const pressure = human.mode === 'high_pressure' || Number(mood.score || 0) < 0;
  const baseEvidenceFit = evidenceFit(evidence, unresolved);
  const baseReversibility = /rollback|戻|復元|revert/i.test([...success, ...constraints].join(' ')) ? 96 : 78;
  const ja = /[ぁ-んァ-ヶ一-龠々]/.test(t.source_span?.text || question);

  const candidates = [
    candidate({
      id: 'mainline', label: ja ? '主案' : 'Mainline', angle: multi.recommended || 'balanced',
      thesis: ja ? `Task ${t.id || '-'}「${t.objective}」を、確認済みFact・Risk・制約・Evidence状態に従って実行する。` : `Execute task ${t.id || '-'} from supported facts, risks, constraints, and evidence state.`,
      strengths: [ja ? `目的「${t.objective}」へ直接対応する。` : `Directly fits objective: ${t.objective}`, ja ? `確認済み${verified}件・未確認${unresolved}件を分離する。` : `Separates ${verified} supported and ${unresolved} unresolved facts.`, constraints.length ? (ja ? `Hard Constraint ${constraints.length}件を評価対象に含める。` : `Includes ${constraints.length} hard constraints.`) : ''],
      failureModes: [unresolved ? (ja ? `未確認${unresolved}件が残る。` : `${unresolved} unresolved facts remain.`) : '', highRisk ? (ja ? `最上位Risk「${topRisk}」への制御が不足すると破綻する。` : `Fails if top risk is not controlled.`) : '', missing.length ? (ja ? `不足条件${missing.length}件が残る。` : `${missing.length} missing conditions remain.`) : ''],
      requiredChecks: [...success, ...constraints, ...domainChecks],
      metrics: { objectiveFit: 96, evidenceFit: baseEvidenceFit, riskControl: highRisk ? 68 : 86, constraintFit: constraintFit(t, 'mainline'), reversibility: baseReversibility },
      rationale: ja ? '最短の主案だが、Evidence・Risk・Hard ConstraintのGateを全て満たす場合だけ採用可能。' : 'Shortest mainline; adopt only when evidence, risk, and hard-constraint gates pass.',
      ruleIds: ['DIALECTIC-MAINLINE-OBJECTIVE', 'DIALECTIC-HARD-GATE']
    }),
    candidate({
      id: 'opposition', label: ja ? '反対案' : 'Opposition', angle: 'opposition',
      thesis: ja ? `${t.target}を直ちに進めず、未確認・Evidence不足・上位Riskを解消してから進める。` : `Do not advance ${t.target} until unresolved facts, evidence gaps, and top risks are controlled.`,
      strengths: [ja ? `最上位Risk「${topRisk}」を優先できる。` : 'Prioritizes the top risk.', ja ? '未確認の事実化を防止する。' : 'Prevents unresolved claims from becoming facts.', ja ? 'Hard Constraint違反を抑える。' : 'Reduces hard-constraint violations.'],
      failureModes: [ja ? 'Evidenceが十分でRiskが低い場合は過剰停止になる。' : 'Can over-block when evidence is sufficient and risk is low.'],
      requiredChecks: [...missing.slice(0, 5), ...domainChecks, ...constraints],
      metrics: { objectiveFit: highRisk || evidence.state === 'REJECTED' ? 86 : 70, evidenceFit: evidence.state === 'VALID' ? 88 : 74, riskControl: 97, constraintFit: constraintFit(t, 'opposition'), reversibility: 96 },
      rationale: ja ? '誤断定・事故を防ぐ反対候補。停止自体を目的化せず、解除条件を保持する。' : 'Opposition candidate for error prevention; retain explicit release conditions.',
      ruleIds: ['DIALECTIC-OPPOSITION-RISK', 'DIALECTIC-OPPOSITION-EVIDENCE']
    }),
    candidate({
      id: 'third_way', label: ja ? '第三案' : 'Third way', angle: 'third_way',
      thesis: ja ? `${t.target}を一括確定せず、依存・Evidence・検証条件で分割し、成立部分だけ進める。` : `Do not decide ${t.target} monolithically; split by dependencies, evidence, and verification gates.`,
      strengths: [ja ? '前進と安全性を両立しやすい。' : 'Balances progress and safety.', ja ? 'Rollback単位を小さく保てる。' : 'Keeps rollback units small.', ja ? 'Evidence不足部分だけ保留できる。' : 'Can hold only evidence-deficient parts.'],
      failureModes: [ja ? '分割境界が依存関係と一致しない場合は複雑化する。' : 'Complexity increases if partition boundaries conflict with dependencies.'],
      requiredChecks: [...constraints, ...success, ...(t.depends_on || []).map((id) => `dependency:${id}`)],
      metrics: { objectiveFit: 90, evidenceFit: Math.min(95, baseEvidenceFit + 7), riskControl: highRisk ? 91 : 87, constraintFit: constraintFit(t, 'third_way'), reversibility: 97 },
      rationale: ja ? 'Task GraphとGateを使って成立部分だけ進める候補。' : 'Advances only graph segments whose gates are satisfied.',
      ruleIds: ['DIALECTIC-THIRD-WAY-PARTITION', 'DIALECTIC-DEPENDENCY-GATE']
    }),
    candidate({
      id: 'human_fit', label: ja ? '人読み最適案' : 'Human-fit', angle: 'human_fit',
      thesis: pressure ? (ja ? `${t.target}について、問い返しを増やさず、確認済み・未確認・次の実行条件を一括提示する。` : 'Minimize clarification turns and present supported, unresolved, and next-action conditions together.') : (ja ? `${t.target}の事実構造を変えず、説明量と次アクションだけをHuman Signalへ合わせる。` : 'Preserve facts and adjust only explanation density and next action to human signals.'),
      strengths: [ja ? 'Human Signalを回答制御に使える。' : 'Uses human signals only for response control.', ja ? '事実・Risk・EvidenceをHuman Signalで上書きしない。' : 'Does not override facts, risks, or evidence with human signals.'],
      failureModes: [ja ? 'Human Signal推定を事実判断へ使うと破綻する。' : 'Fails if human-signal inference changes factual judgment.'],
      requiredChecks: ['human_signal_is_response_only', ...success],
      metrics: { objectiveFit: 82, evidenceFit: baseEvidenceFit, riskControl: 80, constraintFit: constraintFit(t, 'human_fit'), reversibility: 86 },
      rationale: ja ? '利用者状態は表示制御だけに使い、判断内容の根拠にはしない。' : 'Human state controls presentation only, never factual judgment.',
      ruleIds: ['DIALECTIC-HUMAN-RESPONSE-ONLY']
    }),
    candidate({
      id: 'bad_hand', label: ja ? '悪手案' : 'Bad hand', angle: 'bad_hand',
      thesis: ja ? `Evidence・Constraint・Testを無視して${t.target}を即時確定する。` : `Immediately decide ${t.target} while ignoring evidence, constraints, and tests.`,
      strengths: [ja ? '短時間で結論だけは出る。' : 'Produces a fast conclusion.'],
      failureModes: [ja ? '未確認を事実化する。' : 'Promotes unresolved claims.', ja ? 'Hard Constraint違反。' : 'Violates hard constraints.', ja ? 'Rollback不能化。' : 'Can remove rollback.', ja ? '未検証完成宣言。' : 'Can falsely claim completion.'],
      requiredChecks: [ja ? '採用禁止。事故検出素材としてのみ保持。' : 'Never adopt; retain only as a failure reference.'],
      metrics: { objectiveFit: 30, evidenceFit: 5, riskControl: 5, constraintFit: constraintFit(t, 'bad_hand'), reversibility: 10 },
      rationale: ja ? '採用候補ではなく、失敗Patternの検出基準。' : 'Failure-reference candidate only.',
      ruleIds: ['DIALECTIC-BAD-HAND-NEVER-SELECT']
    })
  ];

  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    pillar: 'dialectic', task_id: t.id || null, engine: 'Astera Deterministic Dialectic', mode: 'decision_materials',
    description: ja ? '主案・反対案・第三案・人読み最適案・悪手案を固定Ruleと同一Metricで比較可能なCandidateへ変換する。' : 'Generate five deterministic candidates under the same metrics.',
    selected: ranked.find((item) => item.id !== 'bad_hand') || null, candidates: ranked,
    bad_hand_lessons: candidates.find((item) => item.id === 'bad_hand')?.failure_modes || [],
    integration_rule: ja ? '悪手案は採用禁止。Evidence・Hard Constraint・Dependency・Riskを満たさない候補はCompareで減点またはHoldする。' : 'Never select bad-hand; Compare must penalize or hold candidates that fail evidence, hard-constraint, dependency, or risk gates.',
    score_model: { weights: WEIGHTS }
  };
}

module.exports = { run };
