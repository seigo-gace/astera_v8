'use strict';

const { normalizeEvidencePacket, unique } = require('../judgment-materials-analyzer');

function clamp(value) { return Math.max(0, Math.min(100, Math.round(value))); }

function candidate({ id, label, angle, thesis, strengths, failureModes, requiredChecks, metrics, rationale, ruleIds }) {
  const boundedMetrics = Object.fromEntries(Object.entries(metrics || {}).map(([key, value]) => [key, clamp(Number(value || 0))]));
  return {
    id,
    label,
    angle,
    thesis,
    strengths: unique(strengths).slice(0, 8),
    failure_modes: unique(failureModes).slice(0, 8),
    required_checks: unique(requiredChecks).slice(0, 10),
    metrics: boundedMetrics,
    rationale,
    rule_ids: ruleIds
  };
}

function evidenceFit(evidence, unresolved, evidenceRequired = false) {
  if (evidence.state === 'VALID') {
    const quality = Number(evidence.quality_score_bp || 9500) / 100;
    const diversity = Math.min(4, Math.max(0, (evidence.distinct_authority_count || 0) - 1) + Math.max(0, (evidence.distinct_source_family_count || 0) - 1));
    const corroboration = Math.min(2, Number(evidence.new_corroboration_count || 0));
    return clamp(quality + diversity + corroboration - (unresolved ? Math.min(10, unresolved * 3) : 0));
  }
  if (evidence.state === 'REJECTED') return evidenceRequired ? 5 : 20;
  if (evidence.state === 'PARTIAL') return evidenceRequired ? 15 : 45;
  if (evidence.state === 'NOT_REQUIRED') return evidenceRequired ? 10 : 88;
  if (evidence.state === 'NOT_PROVIDED') return evidenceRequired ? 5 : (unresolved ? 45 : 70);
  return evidenceRequired ? 10 : 50;
}

function evidenceMeta(evidence) {
  return {
    state: evidence.state,
    source_status: evidence.source_status,
    score_bp: evidence.quality_score_bp,
    gate_bp: evidence.quality_gate_bp,
    coverage_state: evidence.coverage_state,
    authority_count: evidence.distinct_authority_count || 0,
    source_family_count: evidence.distinct_source_family_count || 0,
    reinforcement_attempt_count: evidence.reinforcement_attempt_count || 0,
    new_corroboration_count: evidence.new_corroboration_count || 0,
    eligibility_reasons: evidence.eligibility_reasons || []
  };
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
  const evidenceRequired = Boolean(t.evidence_need?.required);
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
  const baseEvidenceFit = evidenceFit(evidence, unresolved, evidenceRequired);
  const evidenceState = evidenceMeta(evidence);
  const baseReversibility = /rollback|戻|復元|revert/i.test([...success, ...constraints].join(' ')) ? 96 : 78;
  const ja = /[ぁ-んァ-ヶ一-龠々]/.test(t.source_span?.text || question);
  const perspectiveIds = Array.isArray(multi.perspectives) ? multi.perspectives.map((item) => item.id).filter(Boolean) : [];

  const candidates = [
    candidate({
      id: 'mainline', label: ja ? '主案' : 'Mainline', angle: 'mainline',
      thesis: ja ? `Task ${t.id || '-'}「${t.objective}」を、確認済みFact・Risk・制約・Evidence品質に従って実行する。` : `Execute task ${t.id || '-'} from supported facts, risks, constraints, and evidence quality.`,
      strengths: [ja ? `目的「${t.objective}」へ直接対応する。` : `Directly fits objective: ${t.objective}`, ja ? `確認済み${verified}件・未確認${unresolved}仰を分離する。` : `Separates ${verified} supported and ${unresolved} unresolved facts.`, perspectiveIds.length ? (ja ? `Multiの視点集合(${perspectiveIds.join(',')})を候補生成材料として保持する。` : `Retains Multi perspectives (${perspectiveIds.join(',')}) as candidate-generation material.`) : '', evidence.state === 'VALID' ? (ja ? `Evidence ${evidence.quality_score_bp}bp・補強${evidence.new_corroboration_count}仰をMetric材料へ使用する。` : `Uses Evidence ${evidence.quality_score_bp}bp and corroboration as metric material.`) : ''],
      failureModes: [unresolved ? (ja ? `未確認${unresolved}件が残る。` : `${unresolved} unresolved facts remain.`) : '', evidenceRequired && evidence.state !== 'VALID' ? (ja ? `必須Evidenceが${evidence.state}。` : `Required evidence is ${evidence.state}.`) : '', highRisk ? (ja ? `最上位Risk「${topRisk}」への制御が不足すると破綻する。` : 'Fails if top risk is not controlled.') : '', missing.length ? (ja ? `不足条件${missing.length}件が残る。` : `${missing.length} missing conditions remain.`) : ''],
      requiredChecks: [...success, ...constraints, ...domainChecks, ...(evidenceRequired ? ['evidence_state=VALID'] : [])],
      metrics: { objectiveFit: 96, evidenceFit: baseEvidenceFit, riskControl: highRisk ? 68 : 86, constraintFit: constraintFit(t, 'mainline'), reversibility: baseReversibility },
      rationale: ja ? '最短の主案。採用可否はDialecticでは決めず、CompareがEvidence・Risk・Hard Constraintを含めて判定する。' : 'Shortest mainline; Dialectic does not select it. Compare decides after evidence, risk, and hard-constraint evaluation.',
      ruleIds: ['DIALECTIC-MAINLINE-OBJECTIVE', 'DIALECTIC-HARD-GATE-MATERIAL', 'DIALECTIC-EVIDENCE-METRIC-MATERIAL']
    }),
    candidate({
      id: 'opposition', label: ja ? '反対案' : 'Opposition', angle: 'opposition',
      thesis: ja ? `${t.target}を直ちに進めず、未確認・Evidence不足・上位Riskを解消してから進める。` : `Do not advance ${t.target} until unresolved facts, evidence gaps, and top risks are controlled.`,
      strengths: [ja ? `最上位Risk「${topRisk}」を優先できる。` : 'Prioritizes the top risk.', ja ? '未確認の事実化を防止する。' : 'Prevents unresolved claims from becoming facts.', ja ? 'Hard Constraint違反を抑える。' : 'Reduces hard-constraint violations.'],
      failureModes: [ja ? 'Evidenceが十分でRiskが低い場合は過剰停止になる。' : 'Can over-block when evidence is sufficient and risk is low.'],
      requiredChecks: [...missing.slice(0, 5), ...domainChecks, ...constraints, ...(evidence.eligibility_reasons || [])],
      metrics: { objectiveFit: highRisk || (evidenceRequired && evidence.state !== 'VALID') ? 90 : 70, evidenceFit: evidence.state === 'VALID' ? Math.max(82, baseEvidenceFit - 5) : 96, riskControl: 97, constraintFit: constraintFit(t, 'opposition'), reversibility: 96 },
      rationale: ja ? '誤断定・事故を防ぐ反対候補。停止自体を目的化せず、採否はCompareに委ねる。' : 'Opposition candidate for error prevention; stopping is not the objective and selection belongs to Compare.',
      ruleIds: ['DIALECTIC-OPPOSITION-RISK', 'DIALECTIC-OPPOSITION-EVIDENCE']
    }),
    candidate({
      id: 'third_way', label: ja ? '第三案' : 'Third way', angle: 'third_way',
      thesis: ja ? `${t.target}を一括確定せず、依存・Evidence・検証条件で分割し、成立部分だけ進める。` : `Do not decide ${t.target} monolithically; split by dependencies, evidence, and verification gates.`,
      strengths: [ja ? '前進と安全性を両立しやすい。' : 'Balances progress and safety.', ja ? 'Rollback単位を小さく保てる。' : 'Keeps rollback units small.', ja ? 'Evidence不足部分だけ保留できる。' : 'Can hold only evidence-deficient parts.'],
      failureModes: [ja ? '分割境界が依存関係と一致しない場合は複雑化する。' : 'Complexity increases if partition boundaries conflict with dependencies.'],
      requiredChecks: [...constraints, ...success, ...(t.depends_on || []).map((id) => `dependency:${id}`), ...(evidenceRequired ? ['evidence_gate_per_segment'] : [])],
      metrics: { objectiveFit: 90, evidenceFit: evidence.state === 'VALID' ? Math.min(98, baseEvidenceFit + 3) : Math.max(55, baseEvidenceFit + 20), riskControl: highRisk ? 91 : 87, constraintFit: constraintFit(t, 'third_way'), reversibility: 97 },
      rationale: ja ? 'Task GraphとGateを使って成立部分だけ進める候補。Evidence不足をTask単位で隔離する。' : 'Advances only graph segments whose gates are satisfied and isolates evidence gaps by task.',
      ruleIds: ['DIALECTIC-THIRD-WAY-PARTITION', 'DIALECTIC-DEPENDENCY-GATE', 'DIALECTIC-EVIDENCE-SEGMENT-GATE']
    }),
    candidate({
      id: 'human_fit', label: ja ? '人読み最適案' : 'Human-fit', angle: 'human_fit',
      thesis: pressure ? (ja ? `${t.target}について、問い返しを増やさず、確認済み・未確認・次の実行条仰を一括提示する。` : 'Minimize clarification turns and present supported, unresolved, and next-action conditions together.') : (ja ? `${t.target}の事実構造を変えず、説明量と次アクションだけをHuman Signalへ合わせる。` : 'Preserve facts and adjust only explanation density and next action to human signals.'),
      strengths: [ja ? 'Human Signalを回答制御に使える。' : 'Uses human signals only for response control.', ja ? '事実・Risk・EvidenceをHuman Signalで上書きしない。' : 'Does not override facts, risks, or evidence with human signals.'],
      failureModes: [ja ? 'Human Signal推定を事実判断ぶ使うと破綻する。' : 'Fails if human-signal inference changes factual judgment.'],
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

  return {
    pillar: 'dialectic',
    task_id: t.id || null,
    engine: 'Astera Deterministic Dialectic',
    mode: 'decision_materials',
    description: ja ? '主案・反対案・第三案・人読み最適案・悪手案を固定Ruleで生成し、Compareが後段で採点・Ranking・選択できるraw Metric材料を付与する。Dialectic自身はRanking・Selectedを所有しない。' : 'Generate five deterministic candidates with raw metrics for downstream Compare. Dialectic owns neither ranking nor selection.',
    evidence_state: evidenceState,
    candidates,
    bad_hand_lessons: candidates.find((item) => item.id === 'bad_hand')?.failure_modes || [],
    integration_rule: ja ? '悪手案は採用禁止。Evidence・Hard Constraint・Dependency・Riskを含むScore、Ranking、Selected、Hold判定はCompareだけが所有する。' : 'Never select bad-hand. Compare alone owns score, ranking, selected candidate, and hold decisions across evidence, hard constraints, dependencies, and risk.',
    metric_dimensions: ['objectiveFit', 'evidenceFit', 'riskControl', 'constraintFit', 'reversibility'],
    authority: {
      stage: 'dialectic',
      owns: ['candidate_generation', 'adoption_conditions', 'failure_conditions', 'raw_metrics'],
      does_not_own: ['score', 'candidate_ranking', 'selected_candidate', 'decision']
    }
  };
}

module.exports = { run };
