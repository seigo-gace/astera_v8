"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("Blocking Rule Registry includes every currently emitted domain-lens blocking rule", () => {
  const registryPath = path.join(__dirname, "..", "..", "blocking", "blocking-rules.v1.json");
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const ids = registry.rules.map((rule) => rule.block_id);
  assert.equal(new Set(ids).size, ids.length, "blocking rule IDs must be unique");
  assert.ok(ids.includes("KB-HB-016"));
  const rule = registry.rules.find((item) => item.block_id === "KB-HB-016");
  assert.equal(rule.name, "domain_lens_check_incomplete");
});
