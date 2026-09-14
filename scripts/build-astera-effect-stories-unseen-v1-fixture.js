'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { buildStories } = require('./astera-effect-stories-unseen-v1-data');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'astera-effect-stories-unseen-v1.json');

const stories = buildStories();
const body = {
  version: 'astera.effect-stories.unseen.v1',
  created_at: '2026-09-14T06:40:00.000Z',
  story_count: stories.length,
  stories
};
const canonical = `${JSON.stringify(body, null, 2)}\n`;
const fixture_sha256 = crypto.createHash('sha256').update(canonical).digest('hex');
const payload = { ...body, fixture_sha256 };

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.story_count} stories to ${OUT}`);
console.log(`FIXTURE_SHA256: ${fixture_sha256}`);
