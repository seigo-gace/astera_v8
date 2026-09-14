'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { enrichRequest, extractInstructionUnderstandingFields } = require('../src/deterministic-task-decomposer');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');

const PORTAL_QUESTION = '社内ポータルの検索を改善したい。予算は10%以内、納期は来週金曜。既存ユーザーの操作は変えない。最終結論は出さず判断材料だけ欲しい。';
const tenant = { id: 'portal-gate', is_global: true, plan: 'admin' };

function createEngine() {
  return new CanonicalAsteraEngine({
    logger: { write() {} },
    japaneseParserClient: createMockJapaneseParserClient()
  });
}

function countHasStateClaims(taskResults) {
  let count = 0;
  for (const result of taskResults || []) {
    for (const record of result.canonical?.records || []) {
      if (String(record.claim?.predicate || '').includes('HAS_STATE')) count += 1;
      if (/最終結論/.test(String(record.claim?.raw_text || '')) && String(record.claim?.predicate || '').includes('HAS_STATE')) count += 1;
    }
  }
  return count;
}

test('portal search example gate: instruction field trace', async () => {
  const engine = createEngine();
  try {
    const prepared = await engine.prepareRequest({ question: PORTAL_QUESTION, language: 'ja' });
    const fields = extractInstructionUnderstandingFields(PORTAL_QUESTION);
    assert.match(fields.user_goal, /社内ポータルの検索を改善/);
    assert.equal(fields.desired_effect, '未指定');
    assert.ok(fields.output_policy.ids.includes('FINAL_DECISION_PROHIBITED'));
    assert.ok(fields.output_policy.ids.includes('MATERIAL_ONLY_REQUIRED'));
    assert.ok(prepared.user_goal);
    assert.ok(prepared.analysis_task_packet?.user_goal);
    assert.equal(prepared.analysis_task_packet.tasks.length, 1);
  } finally {
    await engine.destroy();
  }
});

test('portal search example gate: Main8 public material contract', async () => {
  const engine = createEngine();
  try {
    const out = await engine.process({ question: PORTAL_QUESTION, language: 'ja' }, tenant);
    assert.equal(out.result.type, 'cognitive_map');
    const text = out.material.text;
    assert.match(text, /01 本当の目的/);
    assert.match(text, /目的:.*社内ポータルの検索を改善/);
    assert.match(text, /期待効果: 未指定/);
    assert.match(text, /予算.*10%|10%以内/);
    assert.match(text, /来週金曜/);
    assert.match(text, /既存ユーザーの操作/);
    assert.match(text, /Output Policy:.*最終判断は行わず/);
    assert.doesNotMatch(text, /UNRESOLVED_JAPANESE_TARGETを判断材料へ構造化/);
    assert.doesNotMatch(text, /HAS_STATE/);
    assert.doesNotMatch(text, /最終結論 HAS_STATE/);
    assert.doesNotMatch(text, /T02\[analyze\]/);
    assert.equal((text.match(/^---$/gm) || []).length, 7);
    assert.equal(countHasStateClaims(out.result.task_results), 0);
    const evidenceSection = text.split('---')[6] || '';
    assert.match(evidenceSection, /SearchExecution=NOT_REQUIRED|NOT_EXECUTED/);
    assert.doesNotMatch(evidenceSection, /FAILED/);
  } finally {
    await engine.destroy();
  }
});
