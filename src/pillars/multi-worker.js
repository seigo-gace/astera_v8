'use strict';

const { analyzeRequest, normalizeEvidencePacket, unique } = require('../judgment-materials-analyzer');

function firstRisk(risks) {
  return risks?.highest?.impact || risks?.highest?.why || '重大Riskは未特定';
}

async function run({ question = '', facts = {}, risks = {}, inquiry = {}, domain = {}, task = null, evidence_packet = null }) {
  const request = task || analyzeRequest({ question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const riskCount = Number(risks.risk_count || 0);
  const unresolved = facts.unconfirmed?.length || 0;
  const verified = facts.confirmed?.length || 0;
  const constraints = request.constraints || [];
  const domainPerspectives = Array.isArray(domain.primary?.multi_lens) ? domain.primary.multi_lens : [];

  const perspectives = [
    {
      id: 'attack',
      label: request.language === 'ja' ? '前進視点' : 'Forward view',
      focus: request.objective,
      benefit: `目的に直結する変更を優先し、検証済み材料${verified}件を使って��進する。`,
      weakness: unresolved ? `未確認${unresolved}件を抱えたまま進むと誤判断が残る。` : '根拠不足による停止要因は小さい。',
      adoption_conditions: unique([...(request.success_criteria || []), '重大RiskにRollbackまたは停止条件があること']).slice(0, 5)
    },
    {
      id: 'defense',
      label: request.language === 'ja' ? '防御視点' : 'Defensive view',
      focus: firstRisk(risks),
      benefit: `最上位Risk「${firstRisk(risks)}」と責務境界を先に潰し、事故確率を下げる。`,
      weakness: riskCount === 0 ? '重大Riskが少ない場合は過剰防御になり得る。' : '前進速度が落ちる可能性がある。',
      adoption_conditions: unique([...(constraints || []), ...(risks.safety_gates || [])]).slice(0, 5)
    },
    {
      id: 'critical',
      label: request.language === 'ja' ? '批判視点' : 'Critical view',
      focus: `${request.target}の前提・Evidence・成功条件`,
      benefit: `未確認${unresolved}件、Evidence=${evidence.state}、前提不足を分離して過信を防ぐ。`,
      weakness: '疑義を増やすだけでは実行案にならない。',
      adoption_conditions: unique([...(inquiry.missing_questions || []).slice(0, 3), '疑義ごとに解消条件を付ける']).slice(0, 5)
    }
  ];

  if (domainPerspectives.length) {
    perspectives.push({
      id: 'domain',
      label: domain.primary?.name || 'Domain',
      focus: domainPerspectives.join(' / '),
      benefit: 'Domain固有の見落としを一般論から分離して確認できる。',
      weakness: 'Domain Lensだけで結論を決めると横断Riskを落とす。',
      adoption_conditions: domainPerspectives.slice(0, 5)
    });
  }

  let recommended = 'attack';
  if (riskCount >= 2 || risks.level === 'high') recommended = 'defense';
  if (unresolved >= Math.max(2, verified + 1) || evidence.state === 'REJECTED') recommended = 'critical';
  if (riskCount <= 1 && evidence.state === 'VALID' && inquiry.problem_health?.healthy) recommended = 'attack';

  const chosen = perspectives.find((item) => item.id === recommended) || perspectives[0];
  return {
    pillar: 'multi',
    perspectives,
    angles: Object.fromEntries(perspectives.map((item) => [item.id, `${item.focus}｜利点:${item.benefit}｜弱点:${item.weakness}`])),
    trade_off_map: perspectives.map((item) => ({
      id: item.id,
      benefit: item.benefit,
      weakness: item.weakness,
      adoption_conditions: item.adoption_conditions
    })),
    domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null,
    recommended,
    reason: `objective=${request.objective} / risk=${riskCount}(${risks.level || 'unknown'}) / verified=${verified} / unresolved=${unresolved} / evidence=${evidence.state}`,
    selected_perspective: chosen
  };
}

module.exports = { run };
