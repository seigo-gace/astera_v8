"use strict";
const { evaluate, evaluateAndPublish } = require("../evaluator-engine");
const { createEvaluationPacket } = require("./create-evaluation-packet");
async function runAsteraKbAdmission(input, options = {}) {
  const packet = createEvaluationPacket(input);
  if (options.publish === true) {
    if (!options.kbAdapter) throw new TypeError("kbAdapter is required when publish=true");
    return evaluateAndPublish(packet, options.kbAdapter);
  }
  return evaluate(packet);
}
module.exports = { runAsteraKbAdmission };
