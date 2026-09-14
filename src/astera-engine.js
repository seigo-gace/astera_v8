'use strict';

const CanonicalAsteraEngine = require('./canonical-astera-engine');
const { resolveTaskEvidence } = require('./canonical-evidence-resolver');
const { createEvidenceSearchClient } = require('./evidence-search/api/runtime-client');

// Public decision-material runtime.
// It does not implement a second processing pipeline. The Canonical base owns
// Task/Lens/Claim/Binding/G1-G7/Lane/Main8 execution; this class only supplies
// the isolated Evidence Search API resolver at the canonical search boundary.
class AsteraEngine extends CanonicalAsteraEngine {
  constructor(options = {}) {
    super(options);
    const explicitClient = Object.prototype.hasOwnProperty.call(options, 'evidenceSearchClient')
      ? options.evidenceSearchClient
      : undefined;
    this.evidenceSearchClient = explicitClient === undefined
      ? createEvidenceSearchClient({ logger: options.logger })
      : (explicitClient || null);
  }

  setEvidenceSearchClient(client) {
    this.evidenceSearchClient = client || null;
    return this;
  }

  async resolveEvidenceForTask({ task, input, tenant, signal = null }) {
    return resolveTaskEvidence({
      client: this.evidenceSearchClient,
      task,
      input,
      tenant,
      signal
    });
  }
}

module.exports = AsteraEngine;
