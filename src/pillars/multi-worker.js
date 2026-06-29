'use strict';

async function run({ question = '', facts = {}, risks = {}, inquiry = {} }) {
  const riskCount = Number(risks.risk_count || 0);
  const unconfirmed = facts.unconfirmed?.length || 0;
  let recommended = 'balanced';
  if (riskCount >= 2) recommended = 'defense';
  if (unconfirmed >= 3) recommended = 'critical';
  if (/攻め|成長|拡大|売上|growth|scale/i.test(question) && riskCount <= 1) recommended = 'attack';

  return {
    pillar: 'multi',
    angles: {
      attack: '勝ち筋・差別化・一点突破を優先して見る。',
      defense: '安全性・継続性・失敗時の被害縮小を優先して見る。',
      critical: '前提・盲点・矛盾・過信を疑って見る。'
    },
    recommended,
    reason: `risk=${riskCount}, unconfirmed=${unconfirmed}, inquiryHealthy=${Boolean(inquiry.problem_health?.healthy)}`
  };
}

module.exports = { run };
