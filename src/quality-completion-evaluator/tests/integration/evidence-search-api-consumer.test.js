"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { stableStringify } = require("../../utils/stable-json");
const { evaluateGeneric } = require("../../generic/evaluator-engine");

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value)).digest("hex");
}

function measurement() {
  const base = {
    measurement_id: "m_generic_score",
    metric_id: "generic.score",
    value: 100,
    unit: null,
    evidence_claim_refs: ["claim.generic.score"],
    provenance: {
      collector_id: "deterministic-test-runner",
      collected_at: "2026-09-25T00:00:00.000Z"
    }
  };
  return { ...base, measurement_hash: sha256(base) };
}

function request() {
  return {
    schema_version: "astera.evaluation.request.v2",
    evaluation_id: "eval_search_1",
    evaluation_time: "2026-09-25T00:00:00.000Z",
    subject: { subject_id: "subject_1", subject_type: "generic" },
    profile_id: "generic.measurement.v1",
    measurements: [measurement()],
    evidence_search: {
      request: {
        question: "What official evidence supports the measured result?",
        preplanned_queries: [
          {
            query_id: "q1",
            claim_id: "claim.generic.score",
            role: "OFFICIAL",
            text: "official evidence for measured result"
          }
        ],
        paid_search: { enabled: false }
      }
    }
  };
}

function finalValidSearchResult() {
  const excerpt = "Official measured result evidence";
  return {
    schema_version: "astera.evidence-search.result.v1",
    request_id: "eval-search-request-1",
    caller_id: "evaluation-verification-engine",
    status: "FINAL_VALID",
    execution_time: "2026-09-25T00:00:00.000Z",
    effective_as_of: "2026-09-25",
    query_plan_hash: sha256("plan"),
    duration_ms: 10,
    evidence: [
      {
        candidate_id: "ev_1",
        canonical_record_id: "record-1",
        provider_id: "official-provider",
        source_class: "FREE",
        source_family_id: "official-family",
        source_id: "official-source",
        capability_id: "search",
        canonical_locator: { url: "https://example.test/official" },
        publisher: { id: "publisher", name: "Official Publisher" },
        authority_id: "official-authority",
        source_role: "OFFICIAL",
        title: "Official Evidence",
        excerpt,
        language: "en",
        jurisdiction: "",
        published_at: null,
        updated_at: null,
        version: "1",
        revision_id: null,
        content_hash: sha256(excerpt),
        fields: {},
        retrieval_trace: { provider_id: "official-provider" },
        lineage_fingerprint: { family: "official-family" }
      }
    ],
    query_execution: {
      initial: [
        {
          query_id: "q1",
          claim_id: "claim.generic.score",
          role: "OFFICIAL",
          provider_records: [
            {
              provider_id: "official-provider",
              status: "FOUND",
              candidate_record_ids: ["ev_1"]
            }
          ]
        }
      ],
      reinforcement: []
    },
    ai_used: false,
    payment_executed: false,
    result_hash: sha256("search-result")
  };
}

test("generic evaluator calls existing Evidence Search API contract and owns evidence registry/binding", async () => {
  const calls = [];
  const evidenceSearchClient = {
    async search(payload, context) {
      calls.push({ payload, context });
      return finalValidSearchResult();
    }
  };

  const result = await evaluateGeneric(request(), { evidenceSearchClient });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].payload.question, "What official evidence supports the measured result?");
  assert.equal(result.status, "PASSED");
  assert.equal(result.ai_used, false);
  assert.equal(result.evidence.source, "EVIDENCE_SEARCH_API");
  assert.equal(result.evidence.search.status, "FINAL_VALID");
  assert.equal(result.evidence.valid, true);
  assert.equal(result.evidence.registry.entries.length, 1);
  assert.equal(result.evidence.bindings.bindings.length, 1);
  assert.deepEqual(result.dimensions[0].metrics[0].evidence_refs, ["ev_1"]);
  assert.equal(result.evidence.bindings.bindings[0].claim_id, "claim.generic.score");
});

test("generic evaluator fails closed when Evidence Search returns no adopted evidence", async () => {
  const emptyResult = {
    ...finalValidSearchResult(),
    status: "INVALID",
    evidence: [],
    query_execution: { initial: [], reinforcement: [] },
    result_hash: sha256("empty-search-result")
  };
  const evidenceSearchClient = { async search() { return emptyResult; } };

  const result = await evaluateGeneric(request(), { evidenceSearchClient });

  assert.equal(result.status, "BLOCKED");
  assert.equal(result.evidence.registry.entries.length, 0);
  assert.ok(result.blocking.some((item) => item.block_id === "EVAL-HB-002" || item.block_id === "EVAL-HB-003"));
});

test("generic evaluator fails closed when Evidence Search API fails", async () => {
  const evidenceSearchClient = {
    async search() {
      const error = new Error("evidence search unavailable");
      error.code = "EVIDENCE_API_REQUEST_FAILED";
      throw error;
    }
  };

  const result = await evaluateGeneric(request(), { evidenceSearchClient });
  assert.equal(result.status, "EVALUATION_FAILED");
  assert.equal(result.ai_used, false);
  assert.equal(result.errors[0].code, "EVIDENCE_API_REQUEST_FAILED");
});
