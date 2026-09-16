'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');
const { evaluateStory } = require('../src/astera-effect-rubric');

const silentLogger = { write() {} };
const caller = { id: 'purpose-effect-story', is_global: true, plan: 'admin' };

async function withEngine(fn) {
  const engine = new CanonicalAsteraEngine({
    poolSize: 2,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient()
  });
  try {
    await fn(engine);
  } finally {
    await engine.destroy();
  }
}

test('PURPOSE EFFECT: engine output preserves purpose and constraints structurally', async () => {
  await withEngine(async (engine) => {
    const story = {
      story_id: 'PE-PURPOSE-01',
      user_input: '来週金曜までにFAQを更新したい。公開済みの返金ポリシー条文は変えず、新しい問い合わせ例だけ追記して。',
      context: '法務確認=未',
      coverage_domain: 'G32',
      scenario_kind: 'condition_exception'
    };
    const out = await engine.process({
      question: story.user_input,
      context: story.context,
      language: 'ja'
    }, caller);
    assert.equal(out?.result?.type, 'cognitive_map');
    const packet = out.result.analysis_task_packet || {};
    assert.ok((packet.tasks || []).length >= 1, 'expected task decomposition');
    const evaluation = evaluateStory(story, out);
    assert.equal(evaluation.violations.task_decomposition_failure, false);
    assert.ok(evaluation.astera_scores.R01_purpose_clear >= 1);
    assert.ok(evaluation.astera_scores.R02_premise_constraints >= 1);
    assert.ok((out.result.canonical_claims?.records || []).length >= 0);
  });
});
