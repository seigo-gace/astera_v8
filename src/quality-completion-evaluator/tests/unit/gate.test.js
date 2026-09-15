"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decideEvaluationJudgment } = require("../../evaluation-judgment");
const req = { totals: { mandatory_failures: 0 } };
const ev = { counts: { invalid: 0 } };

test("95/95 passes", () => {
  assert.equal(
    decideEvaluationJudgment({ evaluationComplete: true, scores: { quality: 95, completion: 95 }, blocking: [], requirements: req, evidence: ev }).status,
    "PASSED"
  );
});
test("94.99/100 fails", () => {
  assert.equal(
    decideEvaluationJudgment({ evaluationComplete: true, scores: { quality: 94.99, completion: 100 }, blocking: [], requirements: req, evidence: ev }).status,
    "REVISION_REQUIRED"
  );
});
test("blocking overrides 100/100", () => {
  assert.equal(
    decideEvaluationJudgment({ evaluationComplete: true, scores: { quality: 100, completion: 100 }, blocking: [{}], requirements: req, evidence: ev }).status,
    "BLOCKED"
  );
});
