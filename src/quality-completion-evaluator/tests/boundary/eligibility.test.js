"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluate } = require("../../index");
const { baseDesignRequest } = require("../fixtures/factory");

test("complete deterministic design reaches PASSED", async () => {
  const result = await evaluate(baseDesignRequest());
  assert.equal(result.status, "PASSED");
  assert.equal(result.judgment.passed, true);
  assert.equal(result.scores.quality, 100);
  assert.equal(result.scores.completion, 100);
});
test("missing a required section prevents 95 completion", async () => {
  const request = baseDesignRequest();
  request.target.content = request.target.content.replace("# Archive\n旧Versionを削除せずArchiveする。\n", "");
  request.target.content_hash = require("../../utils/hash").sha256Text(request.target.content);
  const result = await evaluate(request);
  assert.equal(result.judgment.passed, false);
  assert.ok(result.scores.completion < 95);
});
