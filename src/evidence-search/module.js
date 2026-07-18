'use strict';

const { calculateUsageReport } = require('./paid/usage-calculator');

const REQUEST_SCHEMA_VERSION = 'astera.evidence-search.module-request.v1';
const RESPONSE_SCHEMA_VERSION = 'astera.evidence-search.module-response.v1';
const OPERATIONS = Object.freeze({
  CALCULATE_PAID_USAGE: 'CALCULATE_PAID_USAGE'
});

function fail(message, code = 'INVALID_MODULE_REQUEST') {
  const error = new Error(message);
  error.code = code;
  throw error;
}

class EvidenceSearchModule {
  constructor(options = {}) {
    this.moduleId = 'astera-evidence-search';
    this.version = String(options.version || '2.4.0');
  }

  async execute(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
      fail('request must be an object');
    }
    if (request.schema_version !== REQUEST_SCHEMA_VERSION) {
      fail(`schema_version must be ${REQUEST_SCHEMA_VERSION}`, 'UNSUPPORTED_MODULE_SCHEMA');
    }

    const operation = String(request.operation || '').trim().toUpperCase();
    if (!Object.values(OPERATIONS).includes(operation)) {
      fail(`unsupported operation: ${operation || '(empty)'}`, 'UNSUPPORTED_MODULE_OPERATION');
    }

    let result;
    switch (operation) {
      case OPERATIONS.CALCULATE_PAID_USAGE:
        result = calculateUsageReport(request.payload);
        break;
      default:
        fail(`unsupported operation: ${operation}`, 'UNSUPPORTED_MODULE_OPERATION');
    }

    return Object.freeze({
      schema_version: RESPONSE_SCHEMA_VERSION,
      module_id: this.moduleId,
      module_version: this.version,
      operation,
      status: 'OK',
      result
    });
  }
}

function createEvidenceSearchModule(options = {}) {
  const instance = new EvidenceSearchModule(options);
  return Object.freeze({
    execute: instance.execute.bind(instance)
  });
}

module.exports = {
  REQUEST_SCHEMA_VERSION,
  RESPONSE_SCHEMA_VERSION,
  OPERATIONS,
  createEvidenceSearchModule
};
