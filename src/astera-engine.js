'use strict';

const CanonicalAsteraEngine = require('./canonical-astera-engine');
const { resolveTaskEvidence } = require('./canonical-evidence-resolver');
const { createEvidenceSearchClient } = require('./evidence-search/api/runtime-client');
const { buildInitialJudgmentMaterial } = require('./runtime/initial-material-fast-path');

// Public decision-material runtime.
// It does not implement a second canonical processing pipeline. The Canonical base owns
// Task/Lens/Claim/Binding/G1-G7/Lane/Main8 execution. This class supplies the isolated
// Evidence Search resolver plus the no-network initial Fast Path used before progressive
// Parser/Evidence enrichment.
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

  processInitial(input = {}, caller = { id: 'unknown' }) {
    return buildInitialJudgmentMaterial(input, caller);
  }

  async processProgressive(input = {}, caller = { id: 'unknown' }, executionContext = {}) {
    const initial = this.processInitial(input, caller);
    if (typeof executionContext.onRevision === 'function') {
      await executionContext.onRevision(initial);
    }

    const final = await this.process(input, caller, executionContext);
    const revision = {
      ...final,
      result: final?.result && typeof final.result === 'object'
        ? { ...final.result, phase: 'FINAL_ENRICHED', revision: 2, material_id: initial.result.material_id }
        : final?.result,
      material: final?.material && typeof final.material === 'object'
        ? { ...final.material, phase: 'FINAL_ENRICHED', revision: 2, material_id: initial.result.material_id }
        : final?.material,
      runtime: final?.runtime && typeof final.runtime === 'object'
        ? { ...final.runtime, progressive: true, initial_duration_ms: initial.runtime.duration_ms }
        : final?.runtime
    };
    if (typeof executionContext.onRevision === 'function') {
      await executionContext.onRevision(revision);
    }
    return Object.freeze({ initial, final: revision });
  }

  async resolveEvidenceForTask({ task, input, caller, signal = null }) {
    return resolveTaskEvidence({
      client: this.evidenceSearchClient,
      task,
      input,
      caller,
      signal
    });
  }
}

module.exports = AsteraEngine;
