 "use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { stableStringify } = require("../../utils/stable-json");
const { evaluateGeneric } = require("../../generic/evaluator-engine");

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function evidenceBundle() {
  const base = {
    schema_version: "astera.evidence-registry-entry.v1",
    evidence_id: "ev_1",
    evidence_type: "EXTERNAL_RECORD",
    candidate_id: "ev_1",
    source: { provider_id: "test", source_class: "FREE", source_family_id: "test", source_id: "test", capability_id: "search", canonical_locator: { url: "https://example.test/evidence" }, canonical_record_id: "record-1", publisher: { id: "pub", name: "Publisher" }, authority_id: "authority", source_role: "OFFICIAL" },
    content: { title: "Evidence", excerpt: "Measured benchmark result", language: "en", jurisdiction: "", published_at: null, updated_at: null, version: "1", revision_id: null, content_hash: sha256("Measured benchmark result"), fields: {} },
    provenance: { request_id: "req_1", query_plan_hash: "plan", query_ids: ["q1"], claim_ids: ["c1"], binding_ids: [], retrieval_trace: {}, lineage_fingerprint: {}, collected_at: "2026-09-25T00:00:00.000Z", effective_as_of: "2026-09-25" }
  };
  const entry = { ...base, integrity: { algorithm: "sha256", content_hash: base.content.content_hash, entry_hash: sha256(base) } };
  const entries = [entry];
  return {
    registry: { schema_version: "astera.evidence-registry.v1", entries, registry_hash: sha256(entries) },
    bindings: { schema_version: "astera.evidence-bindings.v1", bindings: [], bindings_hash: sha256([]) }
  };
}

function request() {
  const evidence = evidenceBundle();
  return {
    schema_version: "astera.evaluation.request.v2",
    evaluation_id: "eval_generic_1",
    subject: { subject_id: "subject_1", subject_type: "benchmark_run", subject_version: "1" },
    profile_id: "generic.measurement.v1",
    metrics: [{ metric_id: "generic.score", value: 100, evidence_refs: ["ev_1"] }],
    evidence_registry: evidence.registry,
    evidence_bindings: evidence.bindings
  };
}

test("generic v2 passes with evidence-backed deterministic metric", async () => {
  const result = await evaluateGeneric(request());
  assert.equal(result.status, "PASSED");
  assert.equal(result.scores.total, 100);
  assert.equal(result.ai_used, false);
  assert.equal(result.evidence.valid, true);
});

test("generic v2 blocks tampered evidence registry", async () => {
  const input = request();
  input.evidence_registry.entries[0].content.excerpt = "tampered";
  const result = await evaluateGeneric(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocking.some((item) => item.block_id === "EVAL-HB-001"));
});

test("generic v2 blocks metric without required evidence", async () => {
  const input = request();
  input.metrics[0].evidence_refs = [];
  const result = await evaluateGeneric(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocking.some((item) => item.block_id === "EVAL-HB-003"));
});
