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

test('public AsteraEngine produces review-oriented Main8 from question only', async () => {
  const engine = new AsteraEngine({
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null,
    poolSize: 2
  });
  try {
    const out = await engine.process({ question: POST }, { id: 'standalone-regression' });
    assert.equal(out.result.type, 'cognitive_map');
    assert.equal(out.result.judgment.analysis_intent.mode, 'review');
    assert.match(out.result.judgment['01_purpose'].summary, /レビュー/);
    assert.doesNotMatch(out.result.judgment['01_purpose'].summary, /^(?:かける|為る)$/u);

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

    assert.ok(out.result.claim_state.claim_count > 0, `claim_count=${out.result.claim_state.claim_count}`);
    assert.equal(out.runtime.ai_used, false);
    assert.equal(out.runtime.llm_called, false);
  } finally {
    await engine.destroy();
  }
});
