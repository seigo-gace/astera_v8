'use strict';

const { projectCompareLane } = require('../canonical-v4-core');

async function run({ task = null, domain = {}, canonical_claim_records = [] } = {}) {
  const t = task || { id: null };
  return projectCompareLane(canonical_claim_records, t, domain);
}

module.exports = { run };
