'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FIXTURE = path.join(__dirname, 'fixtures', 'astera-effect-stories-unseen-v1.json');

const FORBIDDEN_USER_PATTERNS = [
  /\bAstera\b/i,
  /\bMain8\b/i,
  /\bLens\b/i,
  /判断材料を構造化/,
  /\bG\d{2}\b/,
  /Evidence Need/i,
  /coverage_domain/i
];

const REQUIRED_SCENARIO_KINDS = [
  'short_natural',
  'ambiguous_target',
  'multi_task',
  'condition_exception',
  'forbid_maintain',
  'deadline_budget',
  'task_order',
  'correction',
  'premise_change',
  'quote_mixed_command',
  'code_quote',
  'multi_domain',
  'compare_insufficient_candidates',
  'compare_insufficient_axes',
  'unverified_facts',
  'emotional_consult'
];

test('astera-effect-stories-unseen-v1 fixture is frozen unseen corpus', () => {
  assert.ok(fs.existsSync(FIXTURE), 'missing astera-effect-stories-unseen-v1.json');
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  const payload = JSON.parse(raw);
  assert.equal(payload.version, 'astera.effect-stories.unseen.v1');
  assert.ok(payload.story_count >= 16, 'expected at least 16 stories');
  assert.equal(payload.stories.length, payload.story_count);

  const expectedHash = payload.fixture_sha256;
  if (expectedHash) {
    const body = {
      version: payload.version,
      created_at: payload.created_at,
      story_count: payload.story_count,
      stories: payload.stories
    };
    const canonical = `${JSON.stringify(body, null, 2)}\n`;
    const actualHash = crypto.createHash('sha256').update(canonical).digest('hex');
    assert.equal(actualHash, expectedHash, 'fixture stories content was modified');
  }

  const kinds = new Set();
  const ids = new Set();
  for (const story of payload.stories) {
    assert.ok(story.story_id, 'story_id required');
    assert.ok(!ids.has(story.story_id), `duplicate story_id ${story.story_id}`);
    ids.add(story.story_id);
    assert.ok(story.user_input, 'user_input required');
    assert.ok(story.coverage_domain, 'coverage_domain required');
    assert.ok(story.scenario_kind, 'scenario_kind required');
    kinds.add(story.scenario_kind);
    for (const re of FORBIDDEN_USER_PATTERNS) {
      assert.ok(!re.test(story.user_input), `${story.story_id} forbidden pattern in user_input: ${re}`);
    }
  }
  for (const kind of REQUIRED_SCENARIO_KINDS) {
    assert.ok(kinds.has(kind), `missing required scenario_kind ${kind}`);
  }
});
