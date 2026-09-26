 "use strict";

const { evaluate: evaluateLegacy } = require("./evaluator-engine");
const { evaluateGeneric, REQUEST_SCHEMA_VERSION: GENERIC_REQUEST_SCHEMA_VERSION } = require("./generic/evaluator-engine");
const { evaluateInformationQuality, loadInformationQualityProfiles } = require("./information-quality/engine");
const { sha256Text, sha256Json } = require("./utils/hash");
const { createEvaluationPacket } = require("./integration/create-evaluation-packet");

async function evaluate(request) {
  if (request?.schema_version === GENERIC_REQUEST_SCHEMA_VERSION) return evaluateGeneric(request);
  return evaluateLegacy(request);
}

module.exports = {
  evaluate,
  evaluateGeneric,
  GENERIC_REQUEST_SCHEMA_VERSION,
  evaluateInformationQuality,
  loadInformationQualityProfiles,
  sha256Text,
  sha256Json,
  createEvaluationPacket
};
