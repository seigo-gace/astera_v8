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
  const bindingBase = {
    schema_version: "astera.evidence-binding.v1",
    request_id: "req_1",
    phase: "INITIAL",
    query_id: "q1",
    claim_id: "c1",
    query_role: "PRIMARY",
    relation: "SUPPORTS_QUERY",
    evidence_id: "ev_1",
    candidate_id: "ev_1",
    canonical_record_id: "record-1",
    provider_id: "test",
    source_role: "OFFICIAL",
    source_family_id: "test",
    authority_id: "authority",
    url: "https://example.test/evidence"
  };
  const bindingId = `evb_${sha256(bindingBase).slice(0, 24)}`;
  const bindingWithId = { ...bindingBase, binding_id: bindingId };
  const binding = { ...bindingWithId, binding_hash: sha256(bindingWithId) };

  const base = {
    schema_version: "astera.evidence-registry-entry.v1",
    evidence_id: "ev_1",
    evidence_type: "EXTERNAL_RECORD",
    candidate_id: "ev_1",
    source: { provider_id: "test", source_class: "FREE", source_family_id: "test", source_id: "test", capability_id: "search", canonical_locator: { url: "https://example.test/evidence" }, canonical_record_id: "record-1", publisher: { id: "pub", name: "Publisher" }, authority_id: "authority", source_role: "OFFICIAL" },
    content: { title: "Evidence", excerpt: "Measured benchmark result", language: "en", jurisdiction: "", published_at: null, updated_at: null, version: "1", revision_id: null, content_hash: sha256("Measured benchmark result"), fields: {} },
    provenance: { request_id: "req_1", query_plan_hash: "plan", query_ids: ["q1"], claim_ids: ["c1"], binding_ids: [bindingId], retrieval_trace: {}, lineage_fingerprint: {}, collected_at: "2026-09-25T00:00:00.000Z", effective_as_of: "2026-09-25" }
  };
  const entry = { ...base, integrity: { algorithm: "sha256", content_hash: base.content.content_hash, entry_hash: sha256(base) } };
  const entries = [entry];
  const bindings = [binding];
  return {
    registry: { schema_version: "astera.evidence-registry.v1", entries, registry_hash: sha256(entries) },
    bindings: { schema_version: "astera.evidence-bindings.v1", bindings, bindings_hash: sha256(bindings) }
  };
}

function measurement(overrides = {}) {
  const base = {
    measurement_id: "m_generic_score",
    metric_id: "generic.score",
    value: 100,
    unit: null,
    evidence_refs: ["ev_1"],
    provenance: { collector_id: "deterministic-test-runner", collected_at: "2026-09-25T00:00:00.000Z", run_id: "run_1" },
    ...overrides
  };
  delete base.measurement_hash;
  return { ...base, measurement_hash: sha256(base) };
}

function request() {
  const evidence = evidenceBundle();
  return {
    schema_version: "astera.evaluation.request.v2",
    evaluation_id: "eval_generic_1",
    evaluation_time: "2026-09-25T00:00:00.000Z",
    run_id: "run_1",
    subject: { subject_id: "subject_1", subject_type: "benchmark_run", subject_version: "1" },
    profile_id: "generic.measurement.v1",
    measurements: [measurement()],
    evidence_registry: evidence.registry,
    evidence_bindings: evidence.bindings
  };
}

test("generic v2 passes with evidence-backed hashed deterministic measurement", async () => {
  const result = await evaluateGeneric(request());
  assert.equal(result.status, "PASSED");
  assert.equal(result.scores.total, 100);
  assert.equal(result.ai_used, false);
  assert.equal(result.evidence.valid, true);
  assert.match(result.result_hash, /^[a-f0-9]{64}$/);
});

test("generic v2 is byte-stable for the same request", async () => {
  const first = await evaluateGeneric(request());
  const second = await evaluateGeneric(request());
  assert.deepEqual(first, second);
  assert.equal(first.result_hash, second.result_hash);
});

test("generic v2 blocks tampered evidence registry", async () => {
  const input = request();
  input.evidence_registry.entries[0].content.excerpt = "tampered";
  const result = await evaluateGeneric(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocking.some((item) => item.block_id === "EVAL-HB-001"));
});

test("generic v2 blocks a self-edited measurement value without matching hash", async () => {
  const input = request();
  input.measurements[0].value = 12;
  const result = await evaluateGeneric(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocking.some((item) => item.block_id === "EVAL-HB-004"));
});

test("generic v2 blocks required measurement without evidence even with a valid measurement hash", async () => {
  const input = request();
  input.measurements[0] = measurement({ evidence_refs: [] });
  const result = await evaluateGeneric(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocking.some((item) => item.block_id === "EVAL-HB-003"));
});

test("generic v2 detects self-consistent binding hash whose source identity disagrees with registry", async () => {
  const input = request();
  const old = input.evidence_bindings.bindings[0];
  const { binding_hash: ignored, ...base } = old;
  void ignored;
  const changedBase = { ...base, authority_id: "wrong-authority" };
  input.evidence_bindings.bindings[0] = { ...changedBase, binding_hash: sha256(changedBase) };
  input.evidence_bindings.bindings_hash = sha256(input.evidence_bindings.bindings);
  const result = await evaluateGeneric(input);
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.evidence.errors.some((item) => item.code === "EVIDENCE_BINDING_SOURCE_MISMATCH"));
});
