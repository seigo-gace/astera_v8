'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FIXTURE = path.join(__dirname, 'fixtures', 'astera-effect-stories-v1.json');

const FORBIDDEN_USER_PATTERNS = [
  /\bAstera\b/i,
  /\bMain8\b/i,
  /\bLens\b/i,
  /判断材料を構造化/,
  /\bG\d{2}\b/,
  /Evidence Need/i,
  /coverage_domain/i
];

test('astera-effect-stories-v1 fixture is frozen 100-story corpus', () => {
  assert.ok(fs.existsSync(FIXTURE), 'missing astera-effect-stories-v1.json');
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  const payload = JSON.parse(raw);
  assert.equal(payload.version, 'astera.effect-stories.v1');
  assert.equal(payload.story_count, 100);
  assert.equal(payload.stories.length, 100);

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

  const domains = new Set();
  for (const story of payload.stories) {
    assert.ok(story.story_id, 'story_id required');
    assert.ok(story.user_input, 'user_input required');
    assert.ok(story.coverage_domain, 'coverage_domain required');
    assert.ok(story.scenario_kind, 'scenario_kind required');
    domains.add(story.coverage_domain);
    for (const re of FORBIDDEN_USER_PATTERNS) {
      assert.ok(!re.test(story.user_input), `${story.story_id} forbidden pattern in user_input: ${re}`);
    }
  }
  assert.ok(domains.size >= 38, 'expected G01-G38 coverage in metadata');
});
