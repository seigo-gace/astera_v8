'use strict';

const { normalizeEvidencePacket, analyzeRequest, unique } = require('../judgment-materials-analyzer');

const RULES = Object.freeze([
  { id: 'RISK-SECURITY', key: 'security', re: /api.?key|secret|token|password|鍵|認証|credential|権限|permission/i, weight: 25, impact: '秘密情報漏洩・不正利用・権限逸脱' },
  { id: 'RISK-PRODUCTION', key: 'production', re: /本番|公開|deploy|デプロイ|release|リリース|0\.0\.0\.0|https/i, weight: 20, impact: '未検証変更の公開・Rollback不能・利用者影響' },
  { id: 'RISK-DATA', key: 'data', re: /ログ|保存|個人情報|プライバシ|履歴|DB|SQLite|データ|record/i, weight: 18, impact: '機密性・整合性・保持/削除境界の破綻' },
  { id: 'RISK-LEGAL', key: 'legal', re: /法務|契約|規約|著作権|商標|個人情報保護|legal|license|contract/i, weight: 22, impact: '適用法域・権利・義務の誤認' },
  { id: 'RISK-MEDICAL', key: 'medical_safety', re: /医療|症状|患者|診断|治療|薬|medical|patient|diagnos|treatment/i, weight: 28, impact: '健康・安全への高影響判断' },
  { id: 'RISK-COST', key: 'cost', re: /課金|従量|コスト|料金|credit|budget|費用/i, weight: 12, impact: '予算超過・予期しない継続費用' },
  { id: 'RISK-SCOPE', key: 'scope', re: /全部|全て|完璧|一切|丸ごと|entire|everything|complete/i, weight: 10, impact: '変更範囲肥大化・検証漏れ' }
]);

function domainRiskChecks(domain = {}) {
  const primary = domain.primary || {};
  const overlays = Array.isArray(domain.overlays) ? domain.overlays : [];
  const checks = [];
  for (const item of primary.risk_lens || []) checks.push({ source: `domain.${primary.id || 'general'}.risk_lens`, check: item, confidence: 0.6, weight: 6 });
  for (const overlay of overlays) for (const item of overlay.risk_lens || []) checks.push({ source: `overlay.${overlay.id}.risk_lens`, check: item, confidence: 0.7, weight: 8 });
  return checks.slice(0, 16);
}

async function run({ question = '', domain = {}, task = null, evidence_packet = null }) {
  const request = task || analyzeRequest({ question, domain });
  const evidence = normalizeEvidencePacket(evidence_packet);
  const text = [task?.source_span?.text || question, ...(task?.constraints || []), ...(task?.prohibitions || []), ...(task?.preserve || [])].join('\n');
  const risks = [];
  for (const rule of RULES) {
    if (!rule.re.test(text)) continue;
    const trigger = (text.match(rule.re) || [''])[0];
    risks.push({ rule_id: rule.id, key: rule.key, weight: rule.weight, trigger, impact: rule.impact, why: `Task ${task?.id || '-'} の入力Signal「${trigger}」が${rule.impact}に関係する。`, mitigation: '対象条件・変更境界・検証証拠を明示してから確定する。' });
  }
  if (evidence.state === 'REJECTED') risks.push({ rule_id: 'RISK-EVIDENCE-QUALITY', key: 'evidence_quality', weight: 24, trigger: evidence.source_status, impact: '根拠品質不足による誤判断', why: `Evidence Search status=${evidence.source_status} のため根拠を確定事実として利用できない。`, mitigation: '根拠不足を未解決として保持し追加根拠まで確定しない。' });
  if (evidence.conflict_detected) risks.push({ rule_id: 'RISK-EVIDENCE-CONFLICT', key: 'evidence_conflict', weight: 26, trigger: 'source conflict', impact: '相反する根拠による結論反転', why: 'Evidence SearchのSource Conflictが未解消。', mitigation: 'Authority・Version・Date・Scopeを揃えてConflictを解消する。' });
  if (/PARTIAL|UNKNOWN/.test(evidence.coverage_state) && !['NOT_PROVIDED', 'NOT_REQUIRED'].includes(evidence.state)) risks.push({ rule_id: 'RISK-EVIDENCE-COVERAGE', key: 'evidence_coverage', weight: 14, trigger: evidence.coverage_state, impact: '探索範囲不足による見落とし', why: `Evidence coverage=${evidence.coverage_state}。`, mitigation: 'Coverage不足を明示して必要Source範囲を追加する。' });
  if (evidence.provider_failures.length) risks.push({ rule_id: 'RISK-RETRIEVAL-FAILURE', key: 'retrieval_failure', weight: 16, trigger: evidence.provider_failures.map((item) => `${item.provider_id}:${item.error_code}`).join(', '), impact: '根拠取得失敗による判断材料欠落', why: `${evidence.provider_failures.length} Providerの取得失敗。`, mitigation: '取得失敗を未解決として保持する。' });
  if ((task?.prohibitions || []).length) risks.push({ rule_id: 'RISK-PROHIBITION-BREACH', key: 'prohibition_breach', weight: 30, trigger: (task.prohibitions || []).join(' / '), impact: 'Master明示禁止条件の違反', why: '禁止条件は候補Scoreより上位のHard Gate。', mitigation: '禁止条件に触れる候補を選択対象から除外する。' });

  const deduped = [...new Map(risks.map((risk) => [risk.key, risk])).values()].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
  const checks = domainRiskChecks(domain);
  const totalWeight = deduped.reduce((sum, item) => sum + item.weight, 0);
  const level = totalWeight >= 55 ? 'high' : totalWeight >= 20 ? 'medium' : 'low';
  const safetyGates = unique([...(domain.primary?.safety_gate || []), ...(domain.overlays || []).flatMap((overlay) => overlay.safety_gate || []), ...(task?.prohibitions || [])]);
  return {
    pillar: 'risk', task_id: task?.id || null, rule_ids: unique(deduped.map((item) => item.rule_id)), risk_count: deduped.length, risks: deduped,
    domain_checks: checks, safety_gates: safetyGates, highest: deduped[0] || null, level,
    evidence_state: { state: evidence.state, quality_score_bp: evidence.quality_score_bp, coverage_state: evidence.coverage_state, conflict_detected: evidence.conflict_detected },
    request_model: { target: request.target, action: request.action }, warnings: deduped.filter((risk) => risk.weight >= 20).map((risk) => risk.key)
  };
}

module.exports = { run };
