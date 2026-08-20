'use strict';

const { unique } = require('../canonical-v4-core');

const RULES = Object.freeze([
  { id: 'RISK-SECURITY', key: 'security', re: /api.?key|secret|token|password|鍵|認証|credential|権限|permission/i, observation: '秘密情報・認証情報・権限境界に関係する入力Signalがある。' },
  { id: 'RISK-PRODUCTION', key: 'production', re: /本番|公開|deploy|デプロイ|release|リリース|0\.0\.0\.0|https/i, observation: '公開・本番・Release境界に関係する入力Signalがある。' },
  { id: 'RISK-DATA', key: 'data', re: /ログ|保存|個人情報|プライバシ|履歴|DB|SQLite|データ|record/i, observation: 'Data保持・整合性・機密性に関係する入力Signalがある。' },
  { id: 'RISK-LEGAL', key: 'legal', re: /法務|契約|規約|著作権|商標|個人情報保護|legal|license|contract/i, observation: '法域・権利・義務に関係する入力Signalがある。' },
  { id: 'RISK-MEDICAL', key: 'medical_safety', re: /医療|症状|患者|診断|治療|薬|medical|patient|diagnos|treatment/i, observation: '健康・医療安全に関係する入力Signalがある。' },
  { id: 'RISK-COST', key: 'cost', re: /課金|従量|コスト|料金|credit|budget|費用/i, observation: '費用・課金・Budgetに関係する入力Signalがある。' },
  { id: 'RISK-SCOPE', key: 'scope', re: /全部|全て|完璧|一切|丸ごと|entire|everything|complete/i, observation: '広いScopeを示す入力Signalがある。' }
]);

async function run({ question = '', domain = {}, task = null, canonical_claim_records = [] } = {}) {
  const t = task || { id: null, source_span: { text: question }, constraints: [], prohibitions: [], preserve: [], hard_blockers: [] };
  const text = [t.source_span?.text || question, ...(t.constraints || []), ...(t.prohibitions || []), ...(t.preserve || [])].join('\n');
  const risks = RULES.filter((rule) => rule.re.test(text)).map((rule) => ({ rule_id: rule.id, key: rule.key, trigger: (text.match(rule.re) || [''])[0], observation: rule.observation }));
  for (const record of canonical_claim_records.filter((record) => record.task_id === t.id && record.status === 'UNDETERMINED')) {
    risks.push({ rule_id: 'RISK-UNDETERMINED-CLAIM', key: `undetermined:${record.claim_id}`, trigger: record.statement, observation: `ClaimがUNDETERMINED。理由=${(record.undetermined_reasons || []).join(',') || 'UNKNOWN'}` });
  }
  const domainChecks = unique([...(domain.primary?.risk_lens || []), ...(domain.overlays || []).flatMap((overlay) => overlay.risk_lens || [])]);
  return {
    pillar: 'risk',
    task_id: t.id || null,
    rule_ids: unique(risks.map((item) => item.rule_id)),
    risk_count: risks.length,
    risks,
    highest: risks[0] || null,
    level: null,
    safety_gates: unique([...(domain.primary?.safety_gate || []), ...(domain.overlays || []).flatMap((overlay) => overlay.safety_gate || [])]),
    domain_checks: domainChecks.map((check) => ({ check })),
    hard_blockers: unique(t.hard_blockers || []),
    authority: { owns: ['risk_observation'], does_not_own: ['warning', 'recommendation', 'selection', 'decision'] }
  };
}

module.exports = { run };
