'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const AsteraEngine = require('../src/astera-engine');
const { defaultMockJapaneseParserClient } = require('./helpers/default-mock-japanese-parser');

const silentLogger = { write() {}, async flush() {} };
const MATERIAL = `
- A案: RAM 8GBで動作し、平均12 tokens/sとされる。
- B案: RAM 16GBで動作し、平均20 tokens/sとされる。`;

const CASES = Object.freeze([
  ['review', 'この内容をレビューして。', /レビュー/u],
  ['compare', 'A案とB案を比較して判断材料を整理して。', /比較/u],
  ['verify', 'この主張を検証して根拠成立状態を確認して。', /検証/u],
  ['improve', 'この構成を改善するための判断材料を整理して。', /改善/u],
  ['research', 'この技術を調査して不足情報を整理して。', /調査/u],
  ['plan', 'この移行の計画に必要な判断材料を整理して。', /計画/u],
  ['consider', 'A案を採用するか検討するための判断材料を整理して。', /検討/u]
]);

function createEngine() {
  return new AsteraEngine({
    japaneseParserClient: defaultMockJapaneseParserClient(),
    evidenceSearchClient: null,
    logger: silentLogger,
    poolSize: 2
  });
}

for (const [mode, instruction, purposePattern] of CASES) {
  test(`standalone API auto purpose ${mode} reaches final Main8 from question only`, async () => {
    const engine = createEngine();
    const question = `${instruction}${MATERIAL}`;
    try {
      const prepared = await engine.prepareRequest({ question });
      assert.equal(prepared.analysis_task_packet.analysis_intent.mode, mode);
      assert.equal(prepared.standalone_api_intent.mode, mode);
      assert.equal(prepared.analysis_task_packet.analysis_intent.source, 'EXPLICIT_INPUT');
      assert.ok(prepared.analysis_task_packet.observable_material.claim_count > 0);
      assert.ok(prepared.analysis_task_packet.tasks.length > 0);

      const out = await engine.process({ question }, { id: `standalone-seven-${mode}` });
      assert.equal(out.result.type, 'cognitive_map');
      assert.equal(out.result.judgment.analysis_intent.mode, mode);
      assert.match(out.result.judgment['01_purpose'].summary, purposePattern);
      assert.doesNotMatch(out.result.judgment['01_purpose'].summary, /^(?:かける|為る|する)$/u);
      assert.deepEqual(out.result.judgment['06_comparison'].candidate_ranking, []);
      assert.equal(out.result.judgment['06_comparison'].selected_candidate, null);
      assert.deepEqual(out.result.judgment['06_comparison'].rejected_candidates, []);
      assert.equal(out.runtime.ai_used, false);
      assert.equal(out.runtime.llm_called, false);
    } finally {
      await engine.destroy();
    }
  });
}
