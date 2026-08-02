"use strict";

const { evaluate, evaluateAndPublish } = require("./evaluator-engine");
const { evaluateInformationQuality, loadInformationQualityProfiles } = require("./information-quality/engine");
const { createHttpKbSystemAdapter } = require("./adapters/http-kb-system-adapter");
const { createInMemoryKbAdapter } = require("./adapters/in-memory-kb-adapter");
const { validateKbAdapter } = require("./adapters/kb-system-adapter");
const { sha256Text, sha256Json } = require("./utils/hash");
const { createEvaluationPacket } = require("./integration/create-evaluation-packet");
const { runAsteraKbAdmission } = require("./integration/astera-kb-admission-hook");

module.exports = {
  evaluate,
  evaluateAndPublish,
  evaluateInformationQuality,
  loadInformationQualityProfiles,
  createHttpKbSystemAdapter,
  createInMemoryKbAdapter,
  validateKbAdapter,
  sha256Text,
  sha256Json,
  createEvaluationPacket,
  runAsteraKbAdmission
};
