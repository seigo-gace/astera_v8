'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const KaguraEngine = require('../src/kagura-engine');
const silentLogger = { write() {} };

test('KAGURA engine returns cognitive map for sufficient question', async () => {
  const engine = new KaguraEngine({ poolSize: 2, logger: silentLogger });
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
  const engine = new KaguraEngine({ poolSize: 1, logger: silentLogger });
  try {
    const out = await engine.process({ question: 'どう？', llm: { chain: ['null'] } }, { id: 'test', is_global: true, plan: 'admin' });
    assert.equal(out.result.type, 'clarification_needed');
    assert.ok(out.result.questions.length >= 1);
  } finally {
    await engine.destroy();
  }
});

test('Hyperion/PCE integration returns dialectic candidates and selected candidate', async () => {
  const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
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
    assert.ok(out.result.hyperion.dialectic.candidates[0].id);
    assert.notEqual(out.result.hyperion.dialectic.candidates[0], '[Circular]');
    assert.match(out.prompt, /Hyperion\/PCE-DCE Candidate Ranking/);
    assert.doesNotMatch(out.prompt, /undefined\/undefined/);
  } finally {
    await engine.destroy();
  }
});

test('Astera judgment frame carries 01-08 decision sections into result and prompt', async () => {
  const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: '本番サービス改善を判断したい。目的は公開前にV8の判断を安定させること。前提はDocker運用とTGserverログ連携を守ること。',
      llm: { chain: ['null'] },
      moodAnswers: { deepThink: true, accuracy: true }
    }, { id: 'test', is_global: true, plan: 'admin' });

    assert.equal(out.result.judgment.format, 'astera_judgment_v2');
    assert.equal(out.result.judgment.canonical_language, 'en');
    assert.equal(out.result.judgment.output_language, 'ja');
    assert.deepEqual(out.result.judgment.order, [
      '01_purpose',
      '02_premise',
      '03_facts',
      '04_crisis',
      '05_opposition',
      '06_comparison',
      '07_recommendation',
      '08_reinstruction'
    ]);
    assert.equal(out.result.judgment['01_purpose'].canonical_label, '01 True Objective');
    assert.equal(out.result.judgment['01_purpose'].label, '01 本当の目的');
    assert.equal(out.result.judgment['02_premise'].label, '02 前提不足');
    assert.equal(out.result.judgment['03_facts'].label, '03 事実確認');
    assert.equal(out.result.judgment['04_crisis'].label, '04 危機察知');
    assert.equal(out.result.judgment['05_opposition'].label, '05 反対視点');
    assert.equal(out.result.judgment['06_comparison'].label, '06 比較案');
    assert.equal(out.result.judgment['07_recommendation'].label, '07 推奨判断');
    assert.equal(out.result.judgment['08_reinstruction'].label, '08 主役AIへの再指示');
    assert.ok(out.result.judgment['08_reinstruction'].items.length >= 1);
    assert.ok(out.result.judgment['03_facts'].evidence.length >= 1);
    assert.ok(out.result.judgment['04_crisis'].evidence.length >= 1);
    assert.equal(out.material.mode, 'judgment_material');
    assert.equal(out.material.target, 'user_ai');
    assert.equal(out.material.raw_policy, 'do_not_pass_raw_by_default');
    assert.match(out.material.text, /01 本当の目的/);
    assert.match(out.material.text, /一言説明/);
    assert.match(out.material.text, /主役AIへ渡す内容/);
    assert.match(out.material.text, /08 主役AIへの再指示/);
    assert.match(out.material.compact_text, /01 本当の目的/);
    assert.match(out.prompt, /## Judgment Frame/);
    assert.match(out.prompt, /Internal reasoning labels and evaluation criteria are canonical English/);
    for (const label of ['01 True Objective', '02 Missing Context', '03 Fact Check', '04 Risk Detection', '05 Opposing View', '06 Alternative Options', '07 Recommendation', '08 Re-instruction to Main AI']) {
      assert.match(out.prompt, new RegExp(label));
    }
  } finally {
    await engine.destroy();
  }
});

test('Astera material stays exactly eight lines and keeps context out of purpose', async () => {
  const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const context = [
      '--- FILE: src/server.js ---',
      'const secretImplementationDetail = "this should not enter purpose";',
      '本番、ログ、API、Docker、Stripe、SQLite、TGserver、危機、比較。',
      'x'.repeat(2000)
    ].join('\n');
    const out = await engine.process({
      question: 'Asteraフォルダー全体から改善案を出す。',
      context,
      llm: { chain: ['null'] },
      moodAnswers: { deepThink: true, accuracy: true }
    }, { id: 'test', is_global: true, plan: 'admin' });

    const lines = out.material.compact_text.split('\n');
    assert.equal(lines.length, 8);
    assert.deepEqual(lines.map((line) => line.split(':')[0]), ['01 本当の目的', '02 前提不足', '03 事実確認', '04 危機察知', '05 反対視点', '06 比較案', '07 推奨判断', '08 主役AIへの再指示']);
    assert.match(lines[0], /Asteraフォルダー全体から改善案を出す。/);
    assert.doesNotMatch(lines[0], /secretImplementationDetail/);
    assert.match(lines[1], /context_length=/);
    assert.doesNotMatch(lines[2], /確認候補\d+ \/ 未確認\d+/);
    assert.match(lines[2], /ev_001/);
    assert.match(lines[2], /Docker|TGserver|API/);
    assert.match(lines[3], /risk_ev_001/);
    assert.match(out.material.text, /エビデンス/);
  } finally {
    await engine.destroy();
  }
});

test('Astera visible output follows explicit English language while keeping canonical internals', async () => {
  const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'Improve the production API. Success means fewer rollout risks and clear evidence handling.',
      language: 'en',
      llm: { chain: ['null'] },
      moodAnswers: { deepThink: true, accuracy: true }
    }, { id: 'test', is_global: true, plan: 'admin' });

    assert.equal(out.result.judgment.canonical_language, 'en');
    assert.equal(out.result.judgment.output_language, 'en');
    assert.equal(out.result.judgment['01_purpose'].label, '01 True Objective');
    assert.equal(out.result.judgment['03_facts'].canonical_label, '03 Fact Check');
    assert.match(out.material.text, /One-Line Explanation/);
    assert.match(out.material.text, /03 Fact Check/);
    assert.doesNotMatch(out.material.text, /一言説明/);
  } finally {
    await engine.destroy();
  }
});

test('Astera automatically selects a domain template without user choice', async () => {
  const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const out = await engine.process({
      question: 'マーケティング施策を決めたい。対象は小規模SaaSの見込み客。CVは無料登録で、広告コピーとLP訴求を比較したい。',
      llm: { chain: ['null'] },
      moodAnswers: { deepThink: true, accuracy: true }
    }, { id: 'test', is_global: true, plan: 'admin' });

    assert.equal(out.result.domain.user_selection_required, false);
    assert.equal(out.result.domain.primary.id, 'G10');
    assert.equal(out.result.judgment.domain_template.primary.id, 'G10');
    assert.match(out.result.judgment['02_premise'].items.join('\n'), /auto_domain=Business・経営・Marketing・Entrepreneurship/);
    assert.match(out.result.judgment['03_facts'].evidence_to_collect.join('\n'), /顧客Data|市場調査/);
    assert.match(out.result.judgment['04_crisis'].domain_checks.map((x) => x.check).join('\n'), /市場誤認|Brand毀損/);
    assert.match(out.prompt, /Auto Domain Template/);
    assert.match(out.prompt, /G10/);
  } finally {
    await engine.destroy();
  }
});

test('Astera strips pasted 8-section template before running five pillars', async () => {
  const engine = new KaguraEngine({ poolSize: 3, logger: silentLogger });
  try {
    const pastedTemplate = [
      '01 本当の目的',
      '',
      '一言説明',
      '',
      '表面的な依頼の奥にある、本当に達成したいことを整理する。',
      '',
      '回答がどう強くなるか',
      '',
      '主役AIの回答が、表面的な答えではなく、目的に合った答えになりやすくなる。',
      '',
      '---',
      '',
      '08 主役AIへの再指示',
      '',
      '回答がどう強くなるか',
      '',
      '主役AIが判断材料をもとに回答を作り直せる。'
    ].join('\n');
    const out = await engine.process({
      question: `法律相談っぽい問い合わせの分類精度を上げたい。契約トラブルでは管轄と証拠を必ず確認したい。\n\n${pastedTemplate}`,
      llm: { chain: ['null'] },
      moodAnswers: { deepThink: true, accuracy: true }
    }, { id: 'test', is_global: true, plan: 'admin' });

    assert.equal(out.result.domain.primary.id, 'G08');
    assert.equal(out.result.domain.normalized.removed_meta_blocks, 1);
    assert.doesNotMatch(JSON.stringify(out.result.facts), /表面的な依頼の奥/);
    assert.match(out.result.risks.domain_checks.map((x) => x.check).join('\n'), /法域違い|事実不足/);
    assert.equal(out.result.inquiry.domain_template.id, 'G08');
    assert.match(out.result.inquiry.domain_template.inquiry_lens.join('\n'), /どの法域か|契約・通知文はあるか/);
    assert.doesNotMatch(out.material.compact_text.split('\n')[0], /表面的な依頼の奥/);
  } finally {
    await engine.destroy();
  }
});
