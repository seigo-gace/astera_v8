'use strict';

const TARGETS = Object.freeze({
  DECISION_MATERIALS: 'astera.decision-materials',
  EVIDENCE_SEARCH: 'astera.evidence-search',
  QUALITY_GATE: 'astera.quality-gate'
});

const ALLOWED_TARGETS = Object.freeze(Object.values(TARGETS));

function switchError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

class AsteraModuleSwitch {
  constructor({ decisionMaterials, evidenceSearch, qualityGate } = {}) {
    const handlers = {
      [TARGETS.DECISION_MATERIALS]: decisionMaterials,
      [TARGETS.EVIDENCE_SEARCH]: evidenceSearch,
      [TARGETS.QUALITY_GATE]: qualityGate
    };
    for (const [target, handler] of Object.entries(handlers)) {
      if (typeof handler !== 'function') {
        throw new TypeError(`AsteraModuleSwitch requires a handler for ${target}`);
      }
    }
    this.handlers = Object.freeze(handlers);
  }

  async execute({ target, input, context = {} } = {}) {
    const selected = String(target || '').trim();
    if (!ALLOWED_TARGETS.includes(selected)) {
      throw switchError(
        'INVALID_MODULE_TARGET',
        `target must be one of: ${ALLOWED_TARGETS.join(', ')}`,
        400
      );
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw switchError('INVALID_MODULE_INPUT', 'input must be a JSON object', 400);
    }
    return this.handlers[selected]({ input, ...context });
  }
}

module.exports = { AsteraModuleSwitch, TARGETS, ALLOWED_TARGETS };
