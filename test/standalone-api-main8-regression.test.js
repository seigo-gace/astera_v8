'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const silentLogger = { write() {}, async flush() {} };
const POST = `低スペックPCで大規模AIを動かす候補をレビューする。
- Colibrì: GLM-5.2 744Bを25GB RAMのPCで動かす純C製エンジン。
- FreeToken: 8GBのノートPC GPUで35Bモデルを動作させる。
- bitnet.cpp: Microsoftが公開した1-bit LLM推論フレームワークで、x86 CPUで最大6.17倍の高速化を実現する。
- Exo: Mac、PC、Raspberry Piなどをクラスター化して分散実行する。
- Tiiny AI Pocket Lab: 120Bをオフライン実行し、80GB RAM、190 TOPS NPUを搭載する。
- BMASS: 4GB RAMの古いノートPCでQwen3 0.6Bを利用する。
- Kimari Local AI: GTX 1060 6GBでローカルLLMを動かす。
- PowerInfer: RTX 4090上で平均13.20 tokens/sを示す。`;

function createEngine() {
  return new AsteraEngine({
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null,
    logger: silentLogger,
    poolSize: 2
  });
}

test('public AsteraEngine prepareRequest resolves standalone review material from question only', async () => {
  const engine = createEngine();
  try {
    const prepared = await engine.prepareRequest({ question: POST });
    assert.equal(prepared.analysis_task_packet.analysis_intent.mode, 'review');
    assert.match(prepared.analysis_task_packet.user_goal, /レビュー/);
    assert.ok(prepared.analysis_task_packet.observable_material.claim_count > 0);
    assert.ok(prepared.analysis_task_packet.observable_material.candidate_count >= 8);
    assert.ok(prepared.analysis_task_packet.tasks.length > 0);
    assert.ok(prepared.analysis_task_packet.tasks.every((task) => String(task.target || '').trim().length > 0));
    assert.ok(prepared.analysis_task_packet.tasks.some((task) => task.material_only === true || task.observable_material));
  } finally {
    await engine.destroy();
  }
});

test('public AsteraEngine process produces standalone review Main8 from question only', async () => {
  const engine = createEngine();
  try {
    const out = await engine.process({ question: POST }, { id: 'standalone-main8-regression' });
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.judgment.analysis_intent.mode, 'review');
    assert.match(out.result.judgment['01_purpose'].summary, /レビュー/);
    assert.doesNotMatch(out.result.judgment['01_purpose'].summary, /^(?:かける|為る|する)$/u);

    const observable = out.result.analysis_task_packet.observable_material;
    assert.ok(observable);
    assert.ok(observable.claim_count > 0, `claim_count=${observable.claim_count}`);
    assert.ok(observable.candidate_count >= 8, `candidate_count=${observable.candidate_count}`);

    const comparison = out.result.judgment['06_comparison'];
    assert.ok(Array.isArray(comparison.comparison_candidates));
    assert.ok(comparison.comparison_candidates.length >= 8, JSON.stringify(comparison.comparison_candidates));
    assert.ok(comparison.comparison_candidates.includes('Colibrì'));
    assert.ok(comparison.comparison_candidates.includes('PowerInfer'));
    assert.deepEqual(comparison.candidate_ranking, []);
    assert.equal(comparison.selected_candidate, null);
    assert.deepEqual(comparison.rejected_candidates, []);

    const crisis = out.result.judgment['04_crisis'];
    assert.ok(crisis.risks.some((risk) => risk.key === 'PROJECT_EXISTENCE_UNVERIFIED'));
    assert.ok(crisis.risks.some((risk) => risk.key === 'BENCHMARK_CONTEXT_MISSING'));

    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
  } finally {
    await engine.destroy();
  }
});
