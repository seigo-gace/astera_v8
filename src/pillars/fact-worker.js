'use strict';

const { projectFactLane } = require('../canonical-v4-core');

async function run({ task = null, canonical_claim_records = [] } = {}) {
  const output = projectFactLane(canonical_claim_records, task?.id || null);
  return {
    ...output,
    unconfirmed: output.undetermined,
    not_applicable: [],
    corroborating_evidence: [],
    evidence_need: output.undetermined.flatMap((record) => record.search_plan?.required ? [{ item: record.statement, reason: 'Claim PolicyのEvidence要件が未成立。' }] : []),
    evidence_gaps: output.undetermined.map((record) => ({ item: record.statement, reason: (record.undetermined_reasons || []).join(' / ') || 'UNDETERMINED' })),
    evidence_state: {
      state: output.confirmed.length ? 'CLAIM_RECORDS_AVAILABLE' : 'NO_CONFIRMED_CLAIMS',
      confirmed_count: output.confirmed.length,
      undetermined_count: output.undetermined.length
    },
    summary: `CONFIRMED=${output.confirmed.length} / UNDETERMINED=${output.undetermined.length}`
  };
}

module.exports = { run };
