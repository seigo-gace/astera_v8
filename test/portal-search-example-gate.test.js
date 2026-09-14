'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { extractInstructionUnderstandingFields } = require('../src/deterministic-task-decomposer');
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
    assert.doesNotMatch(text, /\[analyze\]|判断材料へ構造化|verify/);
    assert.equal((text.match(/^---$/gm) || []).length, 7);

    const s02 = text.split('---')[1] || '';
    assert.match(s02, /予算上限: 10%以内/);
    assert.match(s02, /期限: 来週金曜/);
    assert.match(s02, /維持条件: 既存ユーザーの操作は変えない/);
    assert.doesNotMatch(s02, /hard_constraint=/);
    assert.doesNotMatch(s02, /最終結論/);
    assert.doesNotMatch(s02, /判断材料だけ/);
    assert.doesNotMatch(s02, /unresolved=T\d+/);
    assert.doesNotMatch(s02, /missing=T\d+/);

    const s03 = text.split('---')[2] || '';
    assert.doesNotMatch(s03, /[0-9a-f]{64}/i);
    assert.doesNotMatch(s03, /UNDETERMINED:/);
    assert.doesNotMatch(s03, /改善したい/);

    assert.doesNotMatch(text, /[0-9a-f]{64}/i);
    assert.doesNotMatch(text, /HAS_STATE/);
    assert.doesNotMatch(text, /UNRESOLVED_JAPANESE_TARGET/);
    assert.doesNotMatch(text, /PARSE_UNRESOLVED/);
    assert.doesNotMatch(text, /INSUFFICIENT_EVIDENCE/);
    assert.doesNotMatch(text, /MODALITY_NOT_VERIFIABLE/);
    assert.doesNotMatch(text, /Lens=UNRESOLVED/);
    assert.doesNotMatch(text, /confirmed_claim_ids:/);
    assert.doesNotMatch(text, /undetermined_claim_ids:/);
    assert.doesNotMatch(text, /candidate_id: -/);
    assert.doesNotMatch(text, /candidates: -/);
    assert.doesNotMatch(text, /claim_id: -/);
    assert.doesNotMatch(text, /dimensions: -/);
    assert.doesNotMatch(text, /id: opposition/);
    assert.doesNotMatch(text, /replace:/);

    assert.match(text, /比較候補は入力されていない/);
    assert.doesNotMatch(s02, /Output Policy/);

    const s08 = text.split('---')[7] || '';
    assert.match(s08, /Output Policy:.*最終判断は行わず/);

    const evidenceSection = text.split('---')[6] || '';
    assert.match(evidenceSection, /NOT_REQUIRED/);
    assert.doesNotMatch(evidenceSection, /FAILED/);

    assert.equal(countHasStateClaims(out.result.task_results), 0);
  } finally {
    await engine.destroy();
  }
});
