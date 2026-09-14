'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'astera-effect-stories-unseen-v1.json');

function loadCorpus() {
  if (!fs.existsSync(FIXTURE)) {
    throw new Error(`Missing ${FIXTURE}; run npm run build:astera-effect-stories-unseen-v1`);
  }
  const payload = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  return payload.stories || payload;
}

module.exports = { loadCorpus, FIXTURE };
