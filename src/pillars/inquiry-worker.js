'use strict';

const { detectMood } = require('../mood-detector');
const { readHumanState } = require('../hyperion-human-reader');

function buildQuestions(question, mood) {
  const qs = [];
  const text = String(question || '').trim();
  if (text.length < 12) qs.push('目的を一文で足してください。何を決めたいですか？');
  if (!/(誰|対象|ユーザー|顧客|利用者|for|target)/i.test(text)) qs.push('対象者は誰ですか？');
  if (!/(成功|ゴール|目的|goal|KPI|条件)/i.test(text)) qs.push('成功条件は何ですか？');
  if (!/(期限|いつ|今日|明日|今週|deadline|date)/i.test(text)) qs.push('期限や優先度はありますか？');
  if (!/(予算|コスト|無料|有料|price|cost)/i.test(text)) qs.push('コスト制約はありますか？');
  const max = mood.score < 0 ? 1 : 5;
  return qs.slice(0, max);
}

async function run({ mode = 'analysis', question = '', moodAnswers = {}, facts, risks } = {}) {
  const mood = detectMood(question, moodAnswers);
  const human_reading = readHumanState(question, mood);
  const questions = buildQuestions(question, mood);

  if (mode === 'preflight') {
    const missingEnoughToStop = String(question || '').trim().length < 12 || /^(どう|何|なに|help|助けて)$/i.test(String(question || '').trim());
    return {
      pillar: 'inquiry',
      mode,
      mood,
      human_reading,
      clarification_needed: missingEnoughToStop,
      questions: missingEnoughToStop ? questions : [],
      rule: mood.score < 0 ? 'bad_mood_max_one_question' : 'normal_max_five_questions'
    };
  }

  const problemHealthy = questions.length <= 2;
  return {
    pillar: 'inquiry',
    mode,
    mood,
    problem_health: {
      healthy: problemHealthy,
      reason: problemHealthy ? '目的・対象・成功条件が大きく欠けていない。' : '問いの前提または成功条件が不足している。'
    },
    human_reading,
    assumptions: [
      '入力文のみを根拠にした一次分析である。',
      '外部検索・外部検証はこのWorker単体では実行しない。'
    ],
    missing_questions: questions,
    fact_summary: facts?.summary || null,
    risk_level: risks?.level || null
  };
}

module.exports = { run };
