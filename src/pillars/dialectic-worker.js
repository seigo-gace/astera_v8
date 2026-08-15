'use strict';

const { analyzeRequest, normalizeEvidencePacket, unique } = require('../judgment-materials-analyzer');

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function metricScore({ objectiveFit, evidenceFit, riskControl, constraintFit, reversibility }) {
  return clamp(
    objectiveFit * 0.30
    + evidenceFit * 0.25
    + riskControl * 0.20
    + constraintFit * 0.15
    + reversibility * 0.10
  );
}

function candidate({ id, label, angle, thesis, strengths, failureModes, requiredChecks, metrics, rationale }) {
  const score = metricScore(metrics);
  return {
    id,
    label,
    angle,
    thesis,
    strengths: unique(strengths).slice(0, 6),
    failure_modes: unique(failureModes).slice(0, 6),
    required_checks: unique(requiredChecks).slice(0, 8),
    metrics,
    score,
    answer_line_distance: 100 - score,
    rationale
  };
}

function evidenceFit(evidence, unresolved) {
  if (evidence.state === 'VALID') return unresolved ? 78 : 92;
  if (evidence.state === 'REJECTED') return 25;
  if (evidence.state === 'PARTIAL') return 50;
  return 42;
}

async function run({ question = '', facts = {}, risks = {}, inquiry = {}, multi = {}, mood = {}, human = {}, domain = {}, task = null, evidence_packet = null }) {
  const request = task || analyzeRequest({ question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const unresolved = facts.unconfirmed?.length || 0;
  const verified = facts.confirmed?.length || 0;
  const riskCount = risks.risk_count || 0;
  const highRisk = risks.level === 'high' || riskCount >= 3;
  const constraints = request.constraints || [];
  const success = request.success_criteria || [];
  const missing = inquiry.missing_questions || [];
  const topRisk = risks.highest?.impact || risks.highest?.why || '重大Riskは未特定';
  const domainChecks = Array.isArray(domain.primary?.evidence_to_collect)
    ? domain.primary.evidence_to_collect.slice(0, 4)
    : [];
  const pressure = human.mode === 'high_pressure' || Number(mood.score || 0) < 0;
  const baseEvidenceFit = evidenceFit(evidence, unresolved);
  const constraintBase = constraints.length ? 90 : 76;

  const candidates = [
    candidate({
      id: 'mainline',
      label: '主案',
      angle: multi.recommended || 'balanced',
      thesis: `${request.objective} そのため、確認済みEvidenceを優先し、未確認は未確認のまま残して必要変更を実行単位へ分解する。`,
      strengths: [
        `対象を「${request.target}」に固定できる`,
        `確認済み根拠${verified}件と未確認${unresolved}件を分離できる`,
        constraints.length ? `明示Constraint ${constraints.length}件を保持できる` : '明示Constraintが少なく変更自由度がある'
      ],
      failureModes: [
        unresolved ? `未確認${unresolved}件が残る` : '',
        highRisk ? `最上位Risk「${topRisk}」を先に潰さないと事故化する` : '',
        missing.length ? `不足条件${missing.length}件が残る` : ''
      ],
      requiredChecks: [...success, ...constraints, ...domainChecks],
      metrics: {
        objectiveFit: 96,
        evidenceFit: baseEvidenceFit,
        riskControl: highRisk ? 68 : 86,
        constraintFit: constraintBase,
        reversibility: 78
      },
      rationale: '目的適合を最大化しつつ、未確認を事実へ昇格しない標準案。'
    }),
    candidate({
      id: 'opposition',
      label: '反対案',
      angle: 'opposition',
      thesis: `「${request.target}」の変更を急がず、${evidence.state === 'VALID' ? '残る未確認とRisk' : 'Evidence不足'}を解消してから判断する。`,
      strengths: [
        `最上位Risk「${topRisk}」を先に処理できる`,
        '未確認の確定扱いを防げる',
        '誤った前提に基づく実装を止められる'
      ],
      failureModes: [
        '停止条件を広げすぎると��進しない',
        evidence.state === 'VALID' && !highRisk ? '十分な根拠がある場合は過剰防御になる' : ''
      ],
      requiredChecks: [...missing.slice(0, 4), ...domainChecks],
      metrics: {
        objectiveFit: highRisk || evidence.state !== 'VALID' ? 82 : 68,
        evidenceFit: evidence.state === 'VALID' ? 88 : 72,
        riskControl: 96,
        constraintFit: constraintBase,
        reversibility: 94
      },
      rationale: 'Evidence不足または高Risk時に、誤実装を避ける対抗案。'
    }),
    candidate({
      id: 'third_way',
      label: '第三案',
      angle: 'third_way',
      thesis: `「${request.target}」を一括変更せず、Evidenceで確定できる部分から小さなChange Unitに分け、未確認部分を後段へ隔離する。`,
      strengths: [
        '前進と安全性を両立しやすい',
        'Rollback境界を作りやすい',
        'Evidence不足を局所化できる'
      ],
      failureModes: [
        'Change Unit分割が過剰だと統合コストが増える',
        '依存関係を誤ると局所変更でも破綻する'
      ],
      requiredChecks: [...constraints, 'Change Unit間の依存関係', '各Change UnitのAcceptance Test'],
      metrics: {
        objectiveFit: 90,
        evidenceFit: Math.min(95, baseEvidenceFit + 7),
        riskControl: highRisk ? 90 : 86,
        constraintFit: Math.min(98, constraintBase + 4),
        reversibility: 96
      },
      rationale: '確定部分と未確定部分を分けて前進する段階案。'
    }),
    candidate({
      id: 'human_fit',
      label: '実行負荷最適案',
      angle: 'human_fit',
      thesis: pressure
        ? `「${request.target}」について問い返しを増やさず、確認済み・未確認・次の一手を一庠に提示する。`
        : `「${request.target}」について、判断理由と次の一手を明示して実行時の迷いを減らす。`,
      strengths: ['実行手順が分かりやすい', '判断理由を保持できる', pressure ? '高負荷時の追加往復を減らせる' : '説明量を適正化できる'],
      failureModes: ['Human Signalは事実ではないため過信できない', '実装内容そのものの正しさはEvidenceとTestに依存する'],
      requiredChecks: ['Human Signalを仕様決定に使わない', ...success],
      metrics: {
        objectiveFit: 80,
        evidenceFit: baseEvidenceFit,
        riskControl: 78,
        constraintFit: constraintBase,
        reversibility: 84
      },
      rationale: '内容ではなく伝達・実行負荷を最適化する補助案。'
    }),
    candidate({
      id: 'bad_hand',
      label: '悪手案',
      angle: 'bad_hand',
      thesis: `Evidence状態とConstraintを無視し、「${request.target}」を一括変更して検証前に完成扱いする。`,
      strengths: ['短期的には速く見える', '事故パターンを対照例として可視化できる'],
      failureModes: ['未確認を事実化する', '責務境界を壊す', 'Rollback不能になり得る', '未Testを完成扱いする'],
      requiredChecks: ['採用しない', '他候補の事故防止材料としてのみ使う'],
      metrics: {
        objectiveFit: 35,
        evidenceFit: 10,
        riskControl: 5,
        constraintFit: 5,
        reversibility: 15
      },
      rationale: '採用候補ではなく、失敗条件を明示するための対照案。'
    })
  ];

  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return {
    pillar: 'dialectic',
    engine: 'Astera Deterministic Dialectic',
    mode: 'decision_materials',
    description: '入力目的・Constraint・Evidence・Riskから候補を構成し、固定文の選択ではなく候補固有MetricをCompareへ渡す。',
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null,
    selected: ranked[0],
    candidates: ranked,
    bad_hand_lessons: candidates.find((item) => item.id === 'bad_hand')?.failure_modes || [],
    integration_rule: '悪手は採用せず、事故検出材料としてのみ保持する。'
  };
}

module.exports = { run };
