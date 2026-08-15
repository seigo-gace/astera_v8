'use strict';

const {
  splitSentences,
  normalizeEvidencePacket,
  analyzeRequest,
  unique
} = require('../judgment-materials-analyzer');

const RULES = Object.freeze([
  { key: 'security', re: /api.?key|secret|token|password|鍵|認証|credential|権限|permission/i, weight: 25, impact: '秘密情報漏洩・不正利用・権限逸脱' },
  { key: 'production', re: /本番|公開|deploy|デプロイ|release|リリース|0\.0\.0\.0|https/i, weight: 20, impact: '未検証変更の公開・Rollback不能・利用者影響' },
  { key: 'data', re: /ログ|保存|個人情報|プライバシ|履歴|DB|SQLite|データ|record/i, weight: 18, impact: '機密性・整合性・保持/削除境界の破綻' },
  { key: 'legal', re: /法務|契約|規約|著作権|商標|個人情報保護|legal|license|contract/i, weight: 22, impact: '適用法域・権利・義務の誤認' },
  { key: 'medical_safety', re: /医療|症状|患者|診断|治療|薬|medical|patient|diagnos|treatment/i, weight: 28, impact: '健康・安全への高影響判断' },
  { key: 'cost', re: /課金|従量|コスト|料金|credit|budget|費用/i, weight: 12, impact: '予算超過・予期しない継続費用' },
  { key: 'scope', re: /全部|全て|完璧|一切|丸ごと|entire|everything|complete/i, weight: 10, impact: '変更範囲肥大化・検証漏れ' }
]);

function matchedSentence(question, re) {
  return splitSentences(question).find((sentence) => re.test(sentence)) || '';
}

function domainRiskChecks(domain = {}) {
  const primary = domain.primary || {};
  const overlays = Array.isArray(domain.overlays) ? domain.overlays : [];
  const checks = [];
  for (const item of primary.risk_lens || []) {
    checks.push({ source: `domain.${primary.id || 'general'}.risk_lens`, check: item, confidence: 0.6, weight: 6 });
  }
  for (const overlay of overlays) {
    for (const item of overlay.risk_lens || []) {
      checks.push({ source: `overlay.${overlay.id}.risk_lens`, check: item, confidence: 0.7, weight: 8 });
    }
  }
  return checks.slice(0, 12);
}

async function run({ question = '', domain = {}, task = null, evidence_packet = null }) {
  const request = task || analyzeRequest({ question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const risks = [];

  for (const rule of RULES) {
    if (!rule.re.test(question)) continue;
    const trigger = matchedSentence(question, rule.re);
    risks.push({
      key: rule.key,
      weight: rule.weight,
      trigger,
      impact: rule.impact,
      why: `入力中の「${trigger.slice(0, 120)}」が${rule.impact}につながる可能性を持つ。`,
      mitigation: '対象条件・変更境界・検証証拠を明示してから確定する。'
    });
  }

  if (evidence.state === 'REJECTED') {
    risks.push({
      key: 'evidence_quality', weight: 24,
      trigger: evidence.source_status,
      impact: '根拠品質不足による誤判断',
      why: `Evidence Search status=${evidence.source_status} のため、根拠を確定事実として利用できない。`,
      mitigation: '根拠不足を未解決として保持し、追加根拠または条件明示まで確定しない。'
    });
  }
  if (evidence.conflict_detected) {
    risks.push({
      key: 'evidence_conflict', weight: 26,
      trigger: 'source conflict',
      impact: '相反する根拠による結論の反転',
      why: 'Evidence Searchの品質判定にSource Conflictが含まれる。',
      mitigation: 'Authority・Version・Date・Scopeを揃えてConflictを解消する。'
    });
  }
  if (/PARTIAL|UNKNOWN/.test(evidence.coverage_state) && evidence.state !== 'NOT_PROVIDED') {
    risks.push({
      key: 'evidence_coverage', weight: 14,
      trigger: evidence.coverage_state,
      impact: '探索範囲不足による見落とし',
      why: `Evidence coverage=${evidence.coverage_state} で探索完了性が不足している。`,
      mitigation: 'Coverage不足を明示し、必要Source範囲を追加する。'
    });
  }
  if (evidence.provider_failures.length) {
    risks.push({
      key: 'retrieval_failure', weight: 16,
      trigger: evidence.provider_failures.map((item) => `${item.provider_id}:${item.error_code}`).join(', '),
      impact: '根拠取得失敗による判断材料欠落',
      why: `${evidence.provider_failures.length} Providerの取得失敗がある。`,
      mitigation: '取得失敗を未解決として保持し、失敗Sourceなしで確定しない。'
    });
  }

  const deduped = [...new Map(risks.map((risk) => [risk.key, risk])).values()]
    .sort((a, b) => b.weight - a.weight);
  const checks = domainRiskChecks(domain);
  const totalWeight = deduped.reduce((sum, item) => sum + item.weight, 0);
  const level = totalWeight >= 55 ? 'high' : totalWeight >= 20 ? 'medium' : 'low';
  const safetyGates = unique([
    ...(Array.isArray(domain.primary?.safety_gate) ? domain.primary.safety_gate : []),
    ...(Array.isArray(domain.overlays) ? domain.overlays.flatMap((overlay) => overlay.safety_gate || []) : [])
  ]);

  return {
    pillar: 'risk',
    risk_count: deduped.length,
    risks: deduped,
    domain_checks: checks,
    safety_gates: safetyGates,
    highest: deduped[0] || null,
    level,
    evidence_state: {
      state: evidence.state,
      quality_score_bp: evidence.quality_score_bp,
      coverage_state: evidence.coverage_state,
      conflict_detected: evidence.conflict_detected
    },
    request_model: { target: request.target, action: request.action },
    warnings: deduped.filter((risk) => risk.weight >= 20).map((risk) => risk.key)
  };
}

module.exports = { run };
