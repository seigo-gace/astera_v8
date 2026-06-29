'use strict';

const RULES = [
  { key: 'security', re: /api.?key|secret|token|password|stripe|決済|鍵|認証/i, weight: 25, why: '秘密情報・認証・決済に関わるため漏洩/不正利用リスクがある。' },
  { key: 'production', re: /本番|公開|0\.0\.0\.0|https|deploy|デプロイ/i, weight: 20, why: '公開設定・HTTPS・本番運用の安全確認が必要。' },
  { key: 'ambiguity', re: /いい感じ|適当|全部|完璧|自動|任せる|よしなに/i, weight: 15, why: '要求が広すぎると仕様膨張や未確定実装が起きる。' },
  { key: 'cost', re: /LLM|OpenAI|Anthropic|Claude|Gemini|課金|従量|コスト/i, weight: 12, why: '外部LLMコスト・レート制限・失敗時の再試行費用に注意。' },
  { key: 'data', re: /ログ|保存|個人情報|プライバシ|履歴|DB|SQLite/i, weight: 18, why: '保存データのマスキング・削除方針・アクセス制御が必要。' }
];

async function run({ question = '' }) {
  const risks = [];
  for (const rule of RULES) {
    if (rule.re.test(question)) risks.push({ key: rule.key, weight: rule.weight, why: rule.why });
  }
  risks.sort((a, b) => b.weight - a.weight);
  return {
    pillar: 'risk',
    risk_count: risks.length,
    risks,
    highest: risks[0] || null,
    level: risks.length >= 3 ? 'high' : risks.length >= 1 ? 'medium' : 'low'
  };
}

module.exports = { run };
