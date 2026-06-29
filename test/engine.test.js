'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');

test('KAGURA engine returns cognitive map for sufficient question', async () => {
  const engine = new KaguraEngine({ poolSize: 2 });
  try {
    const out = await engine.process({
      question: '新規事業のニッチを見つけたい。対象は小規模事業者。成功条件は初月から低コストで試せること。',
      llm: { chain: ['null'] }
    }, { id: 'test', is_global: true, plan: 'admin' });
    assert.equal(out.result.type, 'cognitive_map');
    assert.ok(out.result.comparison.score <= 100);
    assert.match(out.prompt, /answer線距離/);
  } finally {
    await engine.destroy();
  }
});

test('KAGURA engine asks clarification for short question', async () => {
  const engine = new KaguraEngine({ poolSize: 1 });
  try {
    const out = await engine.process({ question: 'どう？', llm: { chain: ['null'] } }, { id: 'test', is_global: true, plan: 'admin' });
    assert.equal(out.result.type, 'clarification_needed');
    assert.ok(out.result.questions.length >= 1);
  } finally {
    await engine.destroy();
  }
});

test('Hyperion/PCE integration returns dialectic candidates and selected candidate', async () => {
  const engine = new KaguraEngine({ poolSize: 3 });
  try {
    const out = await engine.process({
      question: '最大火力でKAGURAを完成させたい。対象はAI開発者。成功条件はDL式で実行でき、リスクと悪手も残すこと。',
      llm: { chain: ['null'] },
      moodAnswers: { urgent: true, deepThink: true, confused: false }
    }, { id: 'test', is_global: true, plan: 'admin' });
    assert.equal(out.result.mode, 'hyperion_max_firepower');
    assert.equal(out.result.hyperion.mode, 'max_firepower');
    assert.ok(out.result.hyperion.dialectic.candidates.length >= 5);
    assert.ok(out.result.comparison.selected_candidate);
    assert.match(out.prompt, /Hyperion\/PCE-DCE 多重案ランキング/);
  } finally {
    await engine.destroy();
  }
});
