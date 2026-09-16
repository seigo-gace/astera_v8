'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'astera-effect-stories-holdout-v1.json');

function loadCorpus() {
  if (!fs.existsSync(FIXTURE)) {
    throw new Error(`Missing ${FIXTURE}; run npm run build:astera-effect-stories-holdout-v1`);
  }
  const raw = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  return raw.stories || raw;
}

module.exports = { loadCorpus, FIXTURE };
