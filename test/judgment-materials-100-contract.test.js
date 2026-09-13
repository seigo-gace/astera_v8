'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const CanonicalAsteraEngine = require('../src/canonical-astera-engine');
const { createMockJapaneseParserClient } = require('./helpers/japanese-parser-mcp-mock');
const { GENRE_LENSES } = require('../src/all-domain-lens-catalog');

const FIXTURE = path.join(__dirname, 'fixtures', 'judgment-materials-100-stories.json');
const silentLogger = { write() {} };
const tenant = { id: 'judgment-materials-100-contract', is_global: true, plan: 'admin' };

const MAIN8_ORDER = Object.freeze([
  '01_purpose',
  '02_premise',
  '03_facts',
  '04_crisis',
  '05_opposition',
  '06_comparison',
  '07_evidence_status',
  '08_reinstruction'
]);

test('fixture has at least 100 stories covering every G01-G38 twice', () => {
  assert.ok(fs.existsSync(FIXTURE), 'missing judgment-materials-100-stories.json');
  const payload = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const stories = payload.stories;
  assert.ok(Array.isArray(stories));
  assert.ok(stories.length >= 100);
  const counts = Object.fromEntries(GENRE_LENSES.map((g) => [g.id, 0]));
  for (const story of stories) {
    assert.ok(story.id && story.expected_domain && story.question);
    if (counts[story.expected_domain] != null) counts[story.expected_domain] += 1;
  }
  for (const g of GENRE_LENSES) {
    assert.ok(counts[g.id] >= 2, `${g.id} has ${counts[g.id]} stories`);
  }
});

test('corpus sample: cognitive_map keeps EXTERNAL_ONLY and Main8 without selected_candidate', async () => {
  const payload = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const sample = payload.stories.find((s) => s.id === 'BND-02-compare-ab') || payload.stories[0];
  const engine = new CanonicalAsteraEngine({
    poolSize: 1,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient()
  });
  try {
    const out = await engine.process({ question: sample.question, language: sample.language }, tenant);
    if (out.result.type === 'cognitive_map') {
      assert.equal(out.result.decision_authority, 'EXTERNAL_ONLY');
      assert.equal(out.result.no_normative_decision_generated, true);
      assert.equal(out.result.comparison?.selected_candidate, null);
      assert.deepEqual(out.result.judgment.order, MAIN8_ORDER);
    } else {
      assert.ok(['task_graph_blocked', 'clarification_needed'].includes(out.result.type));
      assert.equal(out.result.judgment, undefined);
    }
  } finally {
    await engine.destroy();
  }
});

test('corpus sample: hard blocker story fails closed without Main8', async () => {
  const payload = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const sample = payload.stories.find((s) => s.id === 'BND-01-hard-blocker');
  assert.ok(sample);
  const engine = new CanonicalAsteraEngine({
    poolSize: 1,
    logger: silentLogger,
    japaneseParserClient: createMockJapaneseParserClient()
  });
  try {
    const out = await engine.process({ question: sample.question, language: 'ja' }, tenant);
    assert.equal(out.result.type, 'task_graph_blocked');
    assert.equal(out.result.judgment, undefined);
  } finally {
    await engine.destroy();
  }
});
