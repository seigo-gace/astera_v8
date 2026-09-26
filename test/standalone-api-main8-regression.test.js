'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const POST = `低スペックPCで大規模AIを動かす候補をレビューする。
- Colibrì: GLM-5.2 744Bを25GB RAMのPCで動かす純C製エンジン。
- FreeToken: 8GBのノートPC GPUで35Bモデルを動作させる。
- bitnet.cpp: Microsoftが公開した1-bit LLM推論フレームワークで、x86 CPUで最大6.17倍の高速化を実現する。
- Exo: Mac、PC、Raspberry Piなどをクラスター化して分散実行する。
- Tiiny AI Pocket Lab: 120Bをオフライン実行し、80GB RAM、190 TOPS NPUを搭載する。
- BMASS: 4GB RAMの古いノートPCでQwen3 0.6Bを利用する。
- Kimari Local AI: GTX 1060 6GBでローカルLLMを動かす。
- PowerInfer: RTX 4090上で平均13.20 tokens/sを示す。`;

test('public AsteraEngine prepareRequest resolves standalone review material from question only', async () => {
  const engine = new AsteraEngine({
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null,
    poolSize: 2
  });
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
