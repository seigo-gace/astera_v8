'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildStories } = require('./astera-effect-stories-v1-data');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'astera-effect-stories-v1.json');

if (fs.existsSync(OUT)) {
  console.error(`Refusing to overwrite frozen fixture: ${OUT}`);
  process.exit(1);
}

const stories = buildStories();
const payload = {
  version: 'astera.effect-stories.v1',
  created_at: '2026-09-14T03:31:00.000Z',
  story_count: stories.length,
  stories
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${payload.story_count} stories to ${OUT}`);
