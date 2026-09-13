'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildCorpus } = require('./judgment-materials-100-stories-data');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'judgment-materials-100-stories.json');

const stories = buildCorpus();
if (stories.length < 100) {
  console.error(`Expected at least 100 stories, got ${stories.length}`);
  process.exit(1);
}

const payload = {
  schema_version: 'astera.judgment-materials-100.v1',
  taxonomy_version: '1.0.0',
  count: stories.length,
  stories
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(`Wrote ${stories.length} stories to ${OUT}`);
