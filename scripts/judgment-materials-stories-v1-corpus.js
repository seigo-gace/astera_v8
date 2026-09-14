'use strict';

const fs = require('node:fs');
const path = require('node:path');

const FIXTURE = path.join(__dirname, '..', 'test', 'fixtures', 'judgment-materials-stories-v1.json');

function buildCorpus() {
  if (!fs.existsSync(FIXTURE)) {
    throw new Error(`Missing ${FIXTURE}; run node scripts/build-judgment-materials-stories-v1-fixture.js`);
  }
  const payload = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  return payload.stories || payload;
}

module.exports = { buildCorpus, FIXTURE };
