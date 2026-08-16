'use strict';

const { normalizeEvidencePacket, unique } = require('../judgment-materials-analyzer');

function firstRisk(risks) {
  return risks?.highest?.impact || risks?.highest?.why || '重大Riskは検出されていない';
}

function taskModel(task = {}, question = '') {
  return {
    id: task.id || null,
    language: /[ぁ-んァ-ヶ一-龠々]/.test(task.source_span?.text || question) ? 'ja' : 'en',
    target: task.target || '対象',
    action: task.action || 'analyze',
    objective: task.objective || '判断材料を構造化する',
    success_criteria: task.success_criteria || [],
    constraints: task.constraints || [],
    prohibitions: task.prohibitions || [],
    preserve: task.preserve || []
  };
}

async function run({ question = '', facts = {}, risks = {}, inquiry = {}, domain = {}, task = null, evidence_packet = null }) {
  const request = taskModel(task, question);
  const evidence = normalizeEvidencePacket(evidence_packet);
  const riskCount = Number(risks.risk_count || 0);
  const unresolved = facts.unconfirmed?.length || 0;
  const verified = facts.confirmed?.length || 0;
  const constraints = unique([...(request.constraints || []), ...(request.prohibitions || []), ...(request.preserve || [])]);
  const domainPerspectives = Array.isArray(domain.primary?.multi_lens) ? domain.primary.multi_lens : [];
  const ja = request.language === 'ja';

  const perspectives = [
    {
      id: 'attack',
      label: ja ? '前進視点' : 'Forward view',
      focus: request.objective,
      benefit: ja ? `目的達成を優先し、確認済みFact ${verified}件を利用して前進条件を明示する。` : `Prioritize the objective using ${verified} supported facts and explicit progress conditions.`,
      weakness: ja ? (unresolved ? `未確認Fact ${unresolved}件が残るため、根拠なしの加速は不可。` : '未確認Factによる主要阻害は検出されていない。') : (unresolved ? `${unresolved} unresolved facts prevent unsupported acceleration.` : 'No material unresolved-fact blocker detected.'),
      adoption_conditions: unique([...(request.success_criteria || []), ...constraints, 'Rollbackまたは停止条件を保持する。']).slice(0, 8),
      basis: { rule_ids: ['MULTI-ATTACK-OBJECTIVE'], verified, unresolved, risk_count: riskCount }
    },
    {
      id: 'defense',
      label: ja ? '防御視点' : 'Defensive view',
      focus: firstRisk(risks),
      benefit: ja ? `最上位Risk「${firstRisk(risks)}」と禁止・維持条件を先に固定し、失敗時被害を抑える。` : `Fix the top risk and hard constraints first to limit failure impact.`,
      weakness: ja ? (riskCount === 0 ? '重大Riskがない場合は過剰防御で前進速度を落とす可能性がある。' : '防御条件を過剰化すると目的達成を遅らせる。') : 'Over-defense can slow objective completion.',
      adoption_conditions: unique([...constraints, ...(risks.safety_gates || [])]).slice(0, 8),
      basis: { rule_ids: ['MULTI-DEFENSE-RISK'], highest_risk: risks.highest?.key || null, risk_count: riskCount }
    },
    {
      id: 'critical',
      label: ja ? '批判視点' : 'Critical view',
      focus: ja ? `${request.target}の前提・Evidence・矛盾` : `Premises, evidence, and contradictions for ${request.target}`,
      benefit: ja ? `未確認${unresolved}件・Evidence=${evidence.state}・不足条件を事実と分離して、誤断定を抑える。` : `Separate ${unresolved} unresolved claims and Evidence=${evidence.state} from supported facts.`,
      weakness: ja ? '不足確認だけを優先すると実行可能な部分まで停止しやすい。' : 'Over-prioritizing gaps can stop executable work.',
      adoption_conditions: unique([...(inquiry.missing_questions || []).slice(0, 5), '未確認を確認済みに昇格しない。']).slice(0, 8),
      basis: { rule_ids: ['MULTI-CRITICAL-EVIDENCE'], evidence_state: evidence.state, unresolved }
    }
  ];

  if (domainPerspectives.length) {
    perspectives.push({
      id: 'domain',
      label: domain.primary?.name || 'Domain',
      focus: domainPerspectives.join(' / '),
      benefit: ja ? '選択されたGenre Lens固有の観点を、汎用3視点とは別に保持する。' : 'Preserve domain-lens-specific perspectives separately from generic views.',
      weakness: ja ? 'Lens選択が誤っている場合はDomain観点も誤るためSelection Evidenceを保持する必要がある。' : 'A wrong lens selection propagates a wrong domain view, so selection evidence must be retained.',
      adoption_conditions: domainPerspectives.slice(0, 8),
      basis: { rule_ids: ['MULTI-DOMAIN-LENS'], lens_id: domain.primary?.id || null, lens_confidence: domain.confidence ?? domain.primary?.confidence ?? null }
    });
  }

  let recommended = 'attack';
  const recommendationRules = [];
  if (riskCount >= 2 || risks.level === 'high') { recommended = 'defense'; recommendationRules.push('MULTI-SELECT-HIGH-RISK-DEFENSE'); }
  if (unresolved >= Math.max(2, verified + 1) || evidence.state === 'REJECTED') { recommended = 'critical'; recommendationRules.push('MULTI-SELECT-EVIDENCE-CRITICAL'); }
  if (riskCount <= 1 && ['VALID', 'NOT_REQUIRED', 'NOT_PROVIDED'].includes(evidence.state) && inquiry.problem_health?.healthy) { recommended = 'attack'; recommendationRules.push('MULTI-SELECT-HEALTHY-FORWARD'); }
  const chosen = perspectives.find((item) => item.id === recommended) || perspectives[0];

  return {
    pillar: 'multi', task_id: request.id, perspectives,
    angles: Object.fromEntries(perspectives.map((item) => [item.id, `${item.focus}｜利点:${item.benefit}｜弱点:${item.weakness}`])),
    trade_off_map: perspectives.map((item) => ({ id: item.id, benefit: item.benefit, weakness: item.weakness, adoption_conditions: item.adoption_conditions, basis: item.basis })),
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null,
    recommended, recommendation_rule_ids: recommendationRules, reason: `objective=${request.objective} / risk=${riskCount}(${risks.level || 'unknown'}) / verified=${verified} / unresolved=${unresolved} / evidence=${evidence.state}`,
    selected_perspective: chosen
  };
}

module.exports = { run };
