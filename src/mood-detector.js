'use strict';

const NEGATIVE_WORDS = ['むかつく', '怒', '不安', '怖', '焦', '疲', 'だる', '最悪', 'しんど', 'つら', '詰ん', 'urgent', 'angry', 'tired', 'bad'];
const POSITIVE_WORDS = ['最高', 'いい', '楽しい', '進め', 'できる', '勝', 'good', 'great', 'happy', 'excited'];

function labelFromScore(score) {
  if (score >= 2) return { code: 'GOOD', label: '好調', score: 2 };
  if (score === 1) return { code: 'OK_GOOD', label: 'やや好調', score: 1 };
  if (score === -1) return { code: 'OK_BAD', label: 'やや不調', score: -1 };
  if (score <= -2) return { code: 'BAD', label: '不調', score: -2 };
  return { code: 'NEUTRAL', label: '通常', score: 0 };
}

function detectFromAnswers(moodAnswers = {}) {
  const keys = Object.keys(moodAnswers || {});
  if (!keys.length) return null;
  let score = 0;
  if (moodAnswers.good || moodAnswers.confident || moodAnswers.calm) score += 1;
  if (moodAnswers.deepThink) score += 1;
  if (moodAnswers.urgent || moodAnswers.angry || moodAnswers.tired || moodAnswers.bad) score -= 1;
  if (moodAnswers.confused || moodAnswers.anxious) score -= 1;
  const base = labelFromScore(Math.max(-2, Math.min(2, score)));
  return { ...base, confidence: keys.length >= 3 ? 0.85 : 0.7, source: 'moodAnswers' };
}

function detectMood(question = '', moodAnswers = {}) {
  const explicit = detectFromAnswers(moodAnswers);
  if (explicit) return explicit;
  const text = String(question || '').toLowerCase();
  let score = 0;
  for (const word of NEGATIVE_WORDS) if (text.includes(word)) score -= 1;
  for (const word of POSITIVE_WORDS) if (text.includes(word)) score += 1;
  const clipped = Math.max(-2, Math.min(2, score));
  const base = labelFromScore(clipped);
  return { ...base, confidence: clipped === 0 ? 0.4 : 0.6, source: 'text_estimation' };
}

module.exports = { detectMood };
