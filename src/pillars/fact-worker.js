'use strict';

function splitSentences(text) {
  return String(text || '')
    .split(/[。！？!?\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

async function run({ question = '' }) {
  const sentences = splitSentences(question);
  const confirmed = [];
  const unconfirmed = [];
  const opinions = [];

  for (const sentence of sentences) {
    if (/\d|円|%|％|GB|RAM|vCPU|Node|Stripe|API|VPS/i.test(sentence)) {
      confirmed.push({ text: sentence, confidence: 0.65, note: '入力文に具体値・固有語があるため確認候補として扱う。外部検証は未実行。' });
    } else if (/思う|感じ|たぶん|多分|予測|推測|かも|should|maybe/i.test(sentence)) {
      opinions.push({ text: sentence, confidence: 0.5 });
    } else {
      unconfirmed.push({ text: sentence, reason: '根拠未提示の主張または目的文' });
    }
  }

  return {
    pillar: 'fact',
    confirmed,
    unconfirmed,
    opinions,
    summary: `確認候補${confirmed.length} / 未確認${unconfirmed.length} / 意見${opinions.length}`
  };
}

module.exports = { run };
