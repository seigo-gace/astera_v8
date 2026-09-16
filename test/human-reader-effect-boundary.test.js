'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');
const { ClaimStatus } = require('../src/v4-canonical/confirmation');

const silentLogger = { write() {} };
const caller = { id: 'human-reader-effect', is_global: true, plan: 'admin' };

function claimFingerprint(result) {
  const records = result?.canonical_claims?.records || [];
  return records.map((r) => ({
    id: r.claim_id || r.claim?.claim_id,
    status: r.confirmation?.status || r.status,
    raw: r.claim?.raw_text || r.claim?.subject
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function constraintFingerprint(result) {
  const p = result?.analysis_task_packet || {};
  return {
    prohibitions: [...(p.prohibitions || [])].map(String).sort(),
    preserve: [...(p.preserve || [])].map(String).sort(),
    constraints: [...(p.constraints || [])].map(String).sort()
  };
}

function comparisonFingerprint(result) {
  const c = result?.comparison || {};
  return {
    candidates: (c.candidates || c.options || []).length,
    dimensions: (c.dimensions || []).length,
    selected: c.selected_candidate ?? null
  };
}

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

test('HUMAN READER EFFECT: mood variants preserve claim confirmation and constraints', async () => {
  await withEngine(async (engine) => {
    const baseQuestion = '来週金曜までにFAQを更新したい。公開済みの返金ポリシー条文は変えず、新しい問い合わせ例だけ追記して。';
    const moods = [
      {},
      { urgent: true, deepThink: true },
      { angry: true, accuracy: true },
      { confused: true, anxious: true }
    ];
    const baselines = [];
    for (let i = 0; i < moods.length; i += 1) {
      const out = await engine.process({
        question: baseQuestion,
        context: '法務確認=未',
        language: 'ja',
        moodAnswers: moods[i]
      }, caller);
      assert.equal(out?.result?.type, 'cognitive_map');
      baselines.push({
        claims: claimFingerprint(out.result),
        constraints: constraintFingerprint(out.result),
        comparison: comparisonFingerprint(out.result),
        undetermined: out.result.canonical_claims?.undetermined_count ?? 0
      });
    }
    const ref = baselines[0];
    for (let i = 1; i < baselines.length; i += 1) {
      const cur = baselines[i];
      assert.deepEqual(cur.constraints, ref.constraints);
      assert.deepEqual(cur.comparison, ref.comparison);
      assert.equal(cur.undetermined, ref.undetermined);
      for (const rec of cur.claims) {
        if (rec.status === ClaimStatus.CONFIRMED) {
          const match = ref.claims.find((r) => r.id === rec.id);
          if (match) assert.equal(match.status, ClaimStatus.CONFIRMED);
        }
      }
    }
  });
});
