'use strict';

const { detectMood } = require('../mood-detector');
const { readHumanState } = require('../hyperion-human-reader');

const DOMAIN_QUESTIONS = Object.freeze({
  G08: ['適用法域と期限は？', '契約・通知・Evidenceは揃っている？'],
  G10: ['成功指標・Budget・期限は？', '顧客Dataと競合Evidenceはある？'],
  G11: ['適用する会計・税務基準と法域は？', '返金・失効・未使用残高の条件は？'],
  G23: ['緊急のRed Flagはある？', '症状の経過・既往・現在の薬は？'],
  G29: ['互換条件・依存関係・Rollbackは？', 'Testと合格条件は何？'],
  G30: ['評価Setと品質基準は？', 'Human Reviewと失敗時の停止条件は？'],
  G31: ['Asset・Trust Boundary・影響Versionは？', '悪用痕跡・Patch・隔離・復旧経路は？'],
  G34: ['現場に継続中の危険はある？', 'Evidenceの保全と通報経路は？'],
  G38: ['地域・季節・Space・Budgetは？', '手間と安全条件はどこまで許容できる？']
});

function domainQuestions(domain = {}) {
  const primary = domain.primary || {};
  const questions = [...(DOMAIN_QUESTIONS[primary.id] || [])];
  for (const item of primary.inquiry_lens || []) {
    const text = String(item || '').trim();
    if (text && !questions.includes(text)) questions.push(text);
  }
  return questions.slice(0, 8);
}

async function run({ mode = 'analysis', question = '', moodAnswers = {}, domain = {} }) {
  const mood = detectMood(question, moodAnswers);
  const human = readHumanState(question, mood, moodAnswers);
  const text = String(question || '').trim();
  const tooShort = text.length < 4;
  const missingObject = !/(対象|誰|何|どこ|いつ|which|what|who|where|when|system|service|app|API|契約|患者|製品|地域|市場|研究)/i.test(text);
  const missingSuccess = !/(目的|成功|完了|条件|基準|どう|したい|goal|success|done|criteria|比較|判断|設計|移行|対策|選ぶ)/i.test(text);
  const questions = [];
  if (tooShort) questions.push('何を対象に、何を達成したいか具体化してください。');
  if (missingObject) questions.push('対象は誰・何ですか？');
  if (missingSuccess) questions.push('成功条件・完了条件は何ですか？');
  questions.push(...domainQuestions(domain));
  const uniqueQuestions = [...new Set(questions)];

  if (mode === 'preflight') {
    const blocked = tooShort || (missingObject && missingSuccess && text.length < 12);
    return {
      pillar: 'inquiry',
      stage: 'preflight',
      clarification_needed: blocked,
      questions: blocked ? uniqueQuestions.slice(0, 5) : [],
      rule: '追加質問は最小限。明確な問いは止めず、Lens固有の不足は分析結果へ渡す。',
      mood,
      human_reading: human,
      domain_template: domain.primary ? { id: domain.primary.id, name: domain.primary.name } : null
    };
  }

  return {
    pillar: 'inquiry',
    problem_health: {
      healthy: !(missingObject || missingSuccess),
      reason: missingObject || missingSuccess ? '対象または成功条件が曖昧' : '最低限の対象と判断目的がある'
    },
    missing_questions: uniqueQuestions,
    assumptions: [
      '入力本文に書かれていない事実は未確認として扱う。',
      '変更・公開・課金・法務・医療・Securityは適用条件を確認してから確定する。'
    ],
    inquiry_lens: domain.primary?.inquiry_lens || [],
    mood,
    human_reading: human,
    domain_template: domain.primary ? {
      id: domain.primary.id,
      name: domain.primary.name,
      inquiry_lens: domain.primary.inquiry_lens || []
    } : null
  };
}

module.exports = { run };
