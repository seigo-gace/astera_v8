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

function buildDomainQuestions(domain = {}, text = '') {
  const id = domain.primary?.id || 'general_judgment';
  const q = [];
  const has = (pattern) => pattern.test(text);
  if (id === 'legal_compliance') {
    if (!has(/管轄|国|都道府県|州|jurisdiction/i)) q.push('法域・管轄はどこですか？');
    if (!has(/契約書|証拠|メール|書面|document|evidence/i)) q.push('確認できる書面・証拠はありますか？');
  } else if (id === 'medical_health') {
    if (!has(/症状|期間|いつから|duration|symptom/i)) q.push('症状・期間・緊急度は何ですか？');
    if (!has(/医師|病院|薬|treatment|doctor|medication/i)) q.push('現在の治療・服薬・医師相談の有無は？');
  } else if (id === 'business_strategy') {
    if (!has(/売上|利益|KPI|指標|revenue|metric/i)) q.push('判断に使う主要指標は何ですか？');
    if (!has(/撤退|期限|予算|runway|budget|deadline/i)) q.push('予算・期限・撤退条件は何ですか？');
  } else if (id === 'marketing_growth') {
    if (!has(/対象|顧客|ターゲット|segment|target/i)) q.push('対象顧客・セグメントは誰ですか？');
    if (!has(/CV|コンバージョン|KPI|成約|conversion/i)) q.push('測りたいCV・KPIは何ですか？');
  } else if (id === 'engineering_architecture') {
    if (!has(/テスト|検証|test|verify/i)) q.push('何をテストすれば完了と言えますか？');
    if (!has(/rollback|ロールバック|戻す|互換/i)) q.push('ロールバック・互換性条件は何ですか？');
  } else if (id === 'cybersecurity_privacy') {
    if (!has(/資産|データ|asset|data/i)) q.push('守るべき資産・データは何ですか？');
    if (!has(/ログ|検知|incident|log|detect/i)) q.push('検知・監査に使えるログはありますか？');
  } else if (id === 'ai_ml_governance') {
    if (!has(/評価|eval|テスト|accuracy|精度/i)) q.push('品質を判断する評価データ・基準は何ですか？');
    if (!has(/人間|承認|review|human/i)) q.push('人間の確認・差し戻し条件はありますか？');
  }
  return q;
}

async function run({ mode = 'analysis', question = '', moodAnswers = {}, facts, risks, domain = {} } = {}) {
  const mood = detectMood(question, moodAnswers);
  const human_reading = readHumanState(question, mood);
  const questions = [
    ...buildQuestions(question, mood),
    ...buildDomainQuestions(domain, String(question || ''))
  ];

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
      '外部検索・外部検証はこのWorker単体では実行しない。',
      `用途テンプレートはAsteraが自動判定した: ${domain.primary?.name || 'General Judgment / Default'}`
    ],
    missing_questions: questions,
    domain_template: domain.primary ? {
      id: domain.primary.id,
      name: domain.primary.name,
      inquiry_lens: domain.primary.inquiry_lens || []
    } : null,
    fact_summary: facts?.summary || null,
    risk_level: risks?.level || null
  };
}

module.exports = { run };
