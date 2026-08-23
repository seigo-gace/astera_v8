'use strict';

const CanonicalAsteraEngine = require('./canonical-astera-engine');
const { resolveTaskEvidence } = require('./canonical-evidence-resolver');

// Public decision-material runtime.
// It does not implement a second processing pipeline. The Canonical base owns
// Task/Lens/Claim/Binding/G1-G7/Lane/Main8 execution; this class only supplies
// the isolated Evidence Search API resolver at the canonical search boundary.
class AsteraEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    this.evidenceSearchClient = options.evidenceSearchClient || null;
  }

  setEvidenceSearchClient(client) {
    this.evidenceSearchClient = client || null;
    return this;
  }

  async resolveEvidenceForTask({ task, input, tenant }) {
    return resolveTaskEvidence({
      client: this.evidenceSearchClient,
      task,
      input,
      tenant
    });
  }
}

module.exports = AsteraEngine;
