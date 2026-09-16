'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { buildStories } = require('./astera-effect-stories-holdout-v1-data');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'astera-effect-stories-holdout-v1.json');

const stories = buildStories();
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ schema_version: 'astera.effect.holdout.v1', frozen: true, stories }, null, 2)}\n`);
console.log(`Wrote ${stories.length} holdout stories to ${OUT}`);
