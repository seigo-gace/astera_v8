'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildCorpus } = require('./judgment-materials-stories-v1-corpus');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'judgment-materials-stories-v1.json');

const payload = {
  version: 'astera.judgment-materials-stories.v1',
  created_at: new Date().toISOString(),
  story_count: 0,
  stories: buildCorpus()
};

payload.story_count = payload.stories.length;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`);

console.log(`Wrote ${payload.story_count} stories to ${OUT}`);
